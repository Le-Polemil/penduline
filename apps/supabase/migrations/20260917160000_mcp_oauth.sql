-- Penduline — serveur MCP : marque d'origine et autorisations OAuth (#23).
--
-- Deux choses sans rapport apparent, livrées ensemble parce qu'elles n'ont de
-- sens que l'une avec l'autre : un agent va pouvoir écrire dans la base, donc il
-- faut (a) savoir ce qu'il a écrit, et (b) pouvoir lui retirer ce droit.

-- ── (a) D'où vient cette ligne ───────────────────────────────────────────────
--
-- Un enum plutôt qu'un booléen `created_by_agent`. Les deux valeurs d'aujourd'hui
-- ne sont pas les deux valeurs de toujours : le jour où une ligne naîtra d'un
-- import ou d'une récurrence, un booléen obligerait à une migration de schéma et
-- à relire tous les appels, là où un enum n'a qu'une valeur à ajouter.
create type public.origin as enum ('user', 'agent');

-- Un défaut à `'user'` sur une colonne `not null` : Postgres n'a AUCUNE ligne à
-- réécrire (le défaut est stocké dans le catalogue depuis la 11), et les
-- insertions de l'application ne changent pas d'une virgule — elles héritent du
-- défaut sans mentionner la colonne. Seul le serveur MCP écrit `'agent'`
-- explicitement.
alter table public.universes add column origin public.origin not null default 'user';
alter table public.boards    add column origin public.origin not null default 'user';
alter table public.tasks     add column origin public.origin not null default 'user';

comment on column public.universes.origin is
  'Qui a créé cet univers : ''user'' depuis l''application, ''agent'' via le serveur MCP (#23).';
comment on column public.boards.origin is
  'Qui a créé cette matrice : ''user'' depuis l''application, ''agent'' via le serveur MCP (#23).';
comment on column public.tasks.origin is
  'Qui a créé cette tâche : ''user'' depuis l''application, ''agent'' via le serveur MCP (#23).';

-- Rien d'autre à faire pour ces trois colonnes, et c'est voulu :
--   · les policies « … : owner » sont `for all`, donc indifférentes aux colonnes ;
--   · les trois tables sont déjà publiées en temps réel avec `replica identity
--     full` (#39), donc la colonne voyagera d'un onglet à l'autre sans un mot de
--     plus ;
--   · aucun index : `origin` est une marque d'affichage, jamais un critère de
--     recherche. Un index sur deux valeurs dont l'une écrase l'autre ne servirait
--     à rien.

-- ── (b) Qui a le droit d'écrire, et jusqu'à quand ────────────────────────────
--
-- Deux tables plutôt qu'une, parce qu'elles ne répondent pas à la même question
-- et n'appartiennent pas au même monde :
--
--   oauth_clients   « quelle APPLICATION est-ce ? » — enregistrée dynamiquement
--                   par le client lui-même (RFC 7591), sans utilisateur derrière.
--                   Personne ne la possède.
--
--   oauth_grants    « cet utilisateur-là lui a-t-il dit oui ? » — un couple
--                   (utilisateur, client), que l'utilisateur peut reprendre.
--
-- Les fondre reviendrait à ré-enregistrer l'application à chaque autorisation, et
-- à ne plus savoir dire « ces deux autorisations concernent le même client ».

create table public.oauth_clients (
  -- `client_id` est la clé primaire, et donc l'unicité dont dépend la référence
  -- de `oauth_grants` ci-dessous. Pas d'`id uuid` de plus : il n'existe aucun
  -- parcours qui ne parte pas du `client_id` — c'est lui que le client présente.
  client_id     text primary key,
  client_name   text not null check (char_length(client_name) between 1 and 120),
  -- Les URI de redirection ENREGISTRÉES. `/authorize` refuse toute autre valeur :
  -- c'est la barrière qui empêche de détourner un code d'autorisation vers un
  -- hôte tiers, et elle ne peut pas vivre ailleurs qu'ici.
  redirect_uris text[] not null check (array_length(redirect_uris, 1) >= 1),
  created_at    timestamptz not null default now(),
  -- Sert au diagnostic, pas à une règle : un client jamais revu depuis des mois
  -- est un enregistrement mort, et c'est la seule façon de le voir.
  last_used_at  timestamptz
);

create table public.oauth_grants (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  client_id           text not null references public.oauth_clients (client_id) on delete cascade,
  -- Dénormalisé DÉLIBÉRÉMENT : le nom du client AU MOMENT de l'autorisation.
  -- Un enregistrement dynamique laisse le client choisir son nom ; le relire dans
  -- `oauth_clients` ferait qu'un client renommé après coup s'afficherait dans
  -- « Applications connectées » sous un nom que l'utilisateur n'a jamais approuvé.
  client_name         text not null,
  -- Le jeton de rafraîchissement n'est JAMAIS stocké en clair : une fuite de la
  -- base donnerait sinon un accès direct et durable à tous les comptes autorisés.
  -- `unique` parce que la rotation remplace le hash, et que deux autorisations ne
  -- peuvent pas partager le même jeton.
  refresh_token_hash  text unique,
  created_at          timestamptz not null default now(),
  last_used_at        timestamptz,
  -- `null` = active. Une colonne plutôt qu'un `delete` : révoquer efface le
  -- droit, pas la trace qu'il a existé — et c'est précisément la trace qu'on
  -- veut garder après coup.
  revoked_at          timestamptz
);

-- Le seul parcours est « les autorisations de tel utilisateur, les plus récentes
-- d'abord » : c'est la liste de la modale, et c'est aussi la relecture faite à
-- chaque appel MCP pour vérifier que l'autorisation n'a pas été révoquée.
create index oauth_grants_user_idx on public.oauth_grants (user_id, created_at desc);

-- ── Les droits, dissymétriques, et c'est le point ────────────────────────────
--
-- `oauth_clients` n'appartient à personne : pas de `user_id`, aucune ligne à
-- filtrer. Même protection que `job_runs` (#20) — RLS activée SANS policy (sous
-- RLS, ce qui n'est pas autorisé est refusé : zéro policy = zéro ligne), plus un
-- `revoke` qui la retire de l'API PostgREST. Seul le `service_role`, que le
-- serveur MCP s'accorde pour 60 s, la voit.
alter table public.oauth_clients enable row level security;
revoke all on public.oauth_clients from anon, authenticated;

comment on table public.oauth_clients is
  'Applications MCP enregistrées dynamiquement (RFC 7591, #23). Sans propriétaire : RLS activée sans aucune policy, et aucun droit pour anon/authenticated — la table est invisible à l''API.';

-- `oauth_grants`, elle, APPARTIENT à un utilisateur — donc la policy habituelle,
-- et aucun `revoke`. C'est ce qui permet à l'application web de lister et de
-- révoquer une autorisation en tapant PostgREST directement, sans passer par le
-- serveur MCP : un serveur en panne ne doit pas empêcher de lui couper l'accès.
alter table public.oauth_grants enable row level security;

create policy "oauth_grants: owner" on public.oauth_grants
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

comment on table public.oauth_grants is
  'Autorisations accordées à une application MCP (#23) : un couple (utilisateur, client). `revoked_at is null` = active.';
comment on column public.oauth_grants.refresh_token_hash is
  'SHA-256 du jeton de rafraîchissement courant — jamais le jeton lui-même. Remplacé à chaque rotation.';

-- Aucun `grant` explicite sur `oauth_grants` : les droits s'héritent de la
-- propriété `supabase_admin` comme pour `tasks`, `boards` et `universes`, et
-- `penduline-migrate.sh verify` relit précisément `role_table_grants` pour le
-- confirmer après application.
