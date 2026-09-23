-- Penduline — inviter quelqu'un sur une matrice (#53).
--
-- ── LE LIEN, ET POURQUOI PAS L'E-MAIL ────────────────────────────────────────
--
-- Une invitation est un LIEN À JETON, que l'inviteur transmet lui-même — par
-- SMS, par messagerie, de vive voix. Aucun e-mail n'est envoyé par le produit.
--
-- Ce n'est pas un pis-aller en attendant mieux. C'est ce qui fait que le MÊME
-- chemin sert les deux cas que le ticket demande : inviter quelqu'un qui a déjà
-- un compte, et inviter une adresse inconnue. Avec un e-mail, le second cas
-- demanderait une infrastructure transactionnelle (le SMTP en place sert GoTrue,
-- il n'est pas appelable depuis SQL), un gabarit de plus, et une clé d'API
-- stockée quelque part. Avec un lien, il n'y a rien de plus à faire.
--
-- `email` est donc un LIBELLÉ — « c'est à Alice que j'ai envoyé ce lien » — et
-- jamais une autorité. C'est le jeton qui fait foi.

create table board_invitations (
  id          uuid primary key default gen_random_uuid(),
  board_id    uuid not null references boards (id) on delete cascade,
  -- Facultatif, et purement mnémotechnique : il sert à afficher « invité :
  -- alice@… » dans la modale de partage tant que le lien n'a pas été utilisé.
  email       text check (email is null or char_length(email) between 3 and 320),
  role        board_role not null default 'lecture',
  -- ⚠️ LE HACHAGE, PAS LE JETON. La base ne doit jamais pouvoir redonner un
  -- lien d'accès : une fuite de cette table (sauvegarde, export, lecture par un
  -- rôle trop large) rendrait sinon chaque invitation en cours rejouable.
  -- Le jeton clair n'existe qu'une fois, dans la valeur de retour de
  -- `creer_invitation`, et ensuite seulement dans le lien.
  token_hash  text not null unique,
  invited_by  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- Une invitation qui ne périme pas est une clé oubliée sous le paillasson.
  expires_at  timestamptz not null default now() + interval '7 days',
  -- ⚠️ USAGE UNIQUE. Une fois consommée, le lien ne vaut plus rien : c'est ce
  -- qui borne les dégâts d'un lien transféré, retrouvé dans un historique de
  -- conversation, ou capturé en capture d'écran. Inviter trois personnes = trois
  -- liens, et c'est le comportement souhaitable.
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null
);

create index board_invitations_board_idx on board_invitations (board_id, created_at desc);

-- ── Créer un lien ────────────────────────────────────────────────────────────
--
-- `security invoker` DÉLIBÉRÉMENT : la policy d'insertion ci-dessous vérifie
-- déjà que l'appelant est propriétaire, et rien ici ne demande de franchir la
-- RLS. Un `definer` aurait obligé à réécrire ce contrôle à la main dans le
-- corps — donc à le tenir d'accord avec la policy, indéfiniment.
--
-- Le jeton est fabriqué EN BASE et rendu une seule fois. Le laisser fabriquer au
-- client aurait supposé que les trois clients tirent tous de l'aléa
-- cryptographique correct, et que le hachage soit écrit trois fois.
create or replace function public.creer_invitation(
  p_board uuid,
  p_role  board_role default 'lecture',
  p_email text default null
)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  jeton text;
begin
  -- 24 octets en hexadécimal : 48 caractères sûrs dans une URL, sans le `+`,
  -- le `/` ni le `=` du base64 qu'il faudrait échapper à chaque passage.
  jeton := encode(extensions.gen_random_bytes(24), 'hex');

  insert into board_invitations (board_id, email, role, token_hash, invited_by)
  values (
    p_board,
    nullif(btrim(p_email), ''),
    p_role,
    encode(sha256(convert_to(jeton, 'utf8')), 'hex'),
    auth.uid()
  );

  -- La seule et unique fois où le jeton clair sort de cette fonction.
  return jeton;
end;
$$;

-- ── Lire une invitation avant de l'accepter ──────────────────────────────────
--
-- ⚠️ `security definer`, et c'est indispensable : l'invité n'a AUCUN droit de
-- lecture, ni sur `board_invitations`, ni sur la matrice qu'on lui propose. Sans
-- cette fonction, l'écran d'acceptation ne pourrait rien afficher.
--
-- ⚠️ ET C'EST AUSSI POURQUOI ELLE EXISTE : l'écran doit montrer ce que le
-- SERVEUR dit, jamais ce que l'URL porte. Un lien forgé afficherait sinon un nom
-- de matrice rassurant au-dessus du partage de quelqu'un d'autre. C'est
-- exactement la règle que suit déjà l'écran de consentement MCP.
--
-- Elle ne rend RIEN sur un jeton inconnu, expiré ou déjà consommé : pas de
-- message distinguant les trois cas, qui transformerait la fonction en oracle
-- permettant de tester des jetons au hasard.
create or replace function public.lire_invitation(jeton text)
returns table (
  board_name    text,
  invited_by    text,
  role          board_role,
  expires_at    timestamptz,
  deja_accessible boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.name,
    u.email::text,
    i.role,
    i.expires_at,
    -- Pour que l'écran dise « vous avez déjà accès » au lieu de proposer de
    -- rejoindre une matrice qu'on voit déjà — le cas d'un lien rouvert.
    b.user_id = auth.uid()
      or exists (
        select 1 from public.board_members m
         where m.board_id = i.board_id and m.user_id = auth.uid()
      )
  from public.board_invitations i
  join public.boards b on b.id = i.board_id
  left join auth.users u on u.id = i.invited_by
  where i.token_hash = encode(sha256(convert_to(jeton, 'utf8')), 'hex')
    and i.accepted_at is null
    and i.expires_at > now();
$$;

-- ── Accepter ─────────────────────────────────────────────────────────────────
--
-- `security definer` : l'invité doit pouvoir s'inscrire dans `board_members`,
-- dont la policy d'insertion réserve le geste au propriétaire. C'est le seul
-- endroit du schéma où quelqu'un s'ajoute lui-même — et il ne le peut qu'en
-- présentant un jeton que le propriétaire a émis.
create or replace function public.accepter_invitation(jeton text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv public.board_invitations;
begin
  if auth.uid() is null then
    raise exception 'Il faut être connecté pour accepter une invitation.'
      using errcode = '42501';
  end if;

  select * into inv
    from public.board_invitations i
   where i.token_hash = encode(sha256(convert_to(jeton, 'utf8')), 'hex')
     and i.accepted_at is null
     and i.expires_at > now();

  -- Un seul message pour les trois cas — inconnu, expiré, déjà consommé.
  -- Les distinguer dirait à qui essaie des jetons au hasard lesquels existent.
  if not found then
    raise exception 'Cette invitation n''est plus valable.'
      using errcode = '22023';
  end if;

  -- Le propriétaire qui rouvre son propre lien n'a rien à accepter, et surtout
  -- ne doit pas se retrouver membre de sa propre matrice : ce serait la ligne
  -- que `board_members_retrait_placement` se garde justement de croire.
  if exists (select 1 from public.boards b where b.id = inv.board_id and b.user_id = auth.uid()) then
    return inv.board_id;
  end if;

  -- `do update` et non `do nothing` : réinviter quelqu'un avec un rôle
  -- supérieur doit le lui donner. C'est le geste attendu quand on passe un
  -- lecteur en rédacteur par un nouveau lien.
  insert into public.board_members (board_id, user_id, role, invited_by)
  values (inv.board_id, auth.uid(), inv.role, inv.invited_by)
  on conflict (board_id, user_id) do update set role = excluded.role;

  update public.board_invitations
     set accepted_at = now(), accepted_by = auth.uid()
   where id = inv.id;

  return inv.board_id;
end;
$$;

comment on function public.creer_invitation(uuid, board_role, text) is
  'Crée un lien d''invitation et rend le jeton CLAIR — la seule fois où il sort de la base. security invoker : la policy d''insertion vérifie déjà la propriété.';
comment on function public.lire_invitation(text) is
  'Ce que l''écran d''acceptation affiche, rendu par le SERVEUR et non lu dans l''URL. Ne rend rien sur un jeton inconnu, expiré ou consommé — sans distinguer les trois cas.';
comment on function public.accepter_invitation(text) is
  'Consomme une invitation et inscrit l''appelant dans board_members. Le seul endroit où quelqu''un s''ajoute lui-même, et il lui faut un jeton émis par le propriétaire.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Le propriétaire voit et gère SES invitations. L'invité n'a aucun droit ici :
-- il ne connaît cette table qu'à travers les deux fonctions ci-dessus.
--
-- Pas de policy `for update` : seule `accepter_invitation`, en `definer`, pose
-- `accepted_at`. Personne ne peut rouvrir une invitation consommée, ni repousser
-- une expiration — pas même le propriétaire, qui en créera une nouvelle.
alter table board_invitations enable row level security;

create policy "board_invitations: lire si propriétaire" on board_invitations
  for select using (est_proprietaire(board_id));
create policy "board_invitations: créer si propriétaire" on board_invitations
  for insert with check (est_proprietaire(board_id) and invited_by = auth.uid());
create policy "board_invitations: révoquer si propriétaire" on board_invitations
  for delete using (est_proprietaire(board_id));
