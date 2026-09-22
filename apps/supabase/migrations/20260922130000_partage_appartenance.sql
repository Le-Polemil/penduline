-- Penduline — partage d'une matrice : l'appartenance, et la réécriture des policies (#53).
--
-- ── CE QUE CETTE MIGRATION CASSE, ET POURQUOI IL LE FAUT ─────────────────────
--
-- Depuis la migration initiale, quatre tables portent la MÊME policy :
--
--     for all using (user_id = auth.uid()) with check (user_id = auth.uid())
--
-- Une seule hypothèse — *une ligne appartient à une personne* — et tout le
-- cloisonnement du produit repose dessus. Le partage l'invalide à la racine :
-- une matrice peut désormais être lue par quelqu'un qui ne l'a pas créée.
--
-- ⚠️ Ces policies sont REMPLACÉES, pas complétées. Ajouter une `for select`
-- permissive à côté ne suffirait pas : elle serait bien OR'ée pour les lectures,
-- mais la `for all` continuerait de gouverner UPDATE et DELETE. Un invité en
-- lecture seule pourrait alors supprimer les tâches qu'il a le droit de voir.
--
-- ⚠️ Et depuis #117, il n'y a plus de filtre client pour rattraper une policy
-- trop large : la RLS est le levier UNIQUE de la délivrance, temps réel compris.
-- Une erreur ici n'expose pas seulement des lectures, elle expose un flux poussé.
-- C'est pourquoi la suite de tests à deux comptes est écrite AVANT le client.

-- ── Le rôle d'un invité ──────────────────────────────────────────────────────
--
-- Un enum et non un booléen `peut_ecrire` : les deux valeurs d'aujourd'hui ne
-- sont pas celles de toujours. Un rôle « commentaire » ou « administrateur »
-- viendrait s'y ajouter, là où un booléen imposerait une seconde colonne.
-- Même raisonnement que `origin` (#23).
create type board_role as enum ('lecture', 'ecriture');

-- ── L'appartenance ───────────────────────────────────────────────────────────
--
-- ⚠️ LE PROPRIÉTAIRE N'Y FIGURE PAS. `boards.user_id` reste l'autorité, et garde
-- exactement le sens qu'il avait. Deux raisons :
--
-- 1. Une ligne d'appartenance peut être supprimée — par le propriétaire lui-même
--    en nettoyant, par une cascade mal pensée plus tard. Un propriétaire dont
--    l'accès tient à une ligne effaçable perdrait sa propre matrice, sans recours.
-- 2. Deux représentations du même fait finissent toujours par diverger. Ici la
--    question « qui possède ? » a UNE réponse, et elle est sur `boards`.
create table board_members (
  board_id   uuid not null references boards (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       board_role not null default 'lecture',
  -- Qui a ouvert cet accès. `on delete set null` : le départ de l'inviteur ne
  -- doit pas retirer son accès à l'invité — ce serait une révocation fantôme.
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

-- La clé primaire couvre « les membres de cette matrice ». Le parcours INVERSE —
-- « les matrices auxquelles j'ai accès » — est celui des fonctions ci-dessous,
-- donc de CHAQUE ligne lue par un invité. Il lui faut son propre index.
create index board_members_user_idx on board_members (user_id);

-- ── La décision d'accès, en deux fonctions et deux seulement ─────────────────
--
-- Les policies des tables ET les fonctions RPC les appellent : élargir la
-- lecture aux matrices partagées ne se fait donc qu'à un endroit. C'est ce qui
-- évite que `search_tasks`, `review_boards` et `completion_stats` partent en
-- silence sur une autre définition de l'accès que celle des policies.
--
-- ⚠️ `security definer` N'EST PAS UN CONFORT, C'EST LA SEULE SORTIE.
--
-- Une policy sur `boards` qui interrogerait `board_members`, dont la policy
-- interroge `boards`, se mord la queue :
--
--     boards.select ⟵ peut_lire(id) ⟵ board_members ⟵ policy de board_members
--            ▲                                               │
--            └───────────────────────────────────────────────┘
--
-- Postgres ne devine pas la sortie : il détecte la récursion et fait ÉCHOUER la
-- requête. `definer` casse la boucle en lisant l'appartenance hors RLS, une
-- fois, pour rendre un booléen.
--
-- L'escalade habituelle des `definer` n'a pas prise ici, et c'est vérifiable :
-- ces fonctions ne rendent AUCUNE ligne, seulement un oui/non à propos de
-- `auth.uid()` — celui de l'appelant, qu'il ne choisit pas. Le `search_path`
-- figé ferme l'autre moitié du risque (une table homonyme injectée par un
-- schéma que l'appelant contrôlerait).
--
-- L'exécution reste ouverte à `public` DÉLIBÉRÉMENT : une policy est évaluée
-- sous le rôle de l'appelant, et lui retirer le droit d'exécution ferait échouer
-- la lecture au lieu de la refuser — un déni de service, pas un cloisonnement.
-- La fonction ne divulgue rien : elle ne répond que sur l'appelant lui-même.

create or replace function public.est_proprietaire(board uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.boards b
     where b.id = board and b.user_id = auth.uid()
  );
$$;

create or replace function public.peut_lire(board uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.boards b
     where b.id = board and b.user_id = auth.uid()
  ) or exists (
    select 1 from public.board_members m
     where m.board_id = board and m.user_id = auth.uid()
  );
$$;

create or replace function public.peut_ecrire(board uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.boards b
     where b.id = board and b.user_id = auth.uid()
  ) or exists (
    select 1 from public.board_members m
     where m.board_id = board
       and m.user_id = auth.uid()
       and m.role = 'ecriture'
  );
$$;

comment on function public.peut_lire(uuid) is
  'Cette personne peut-elle VOIR cette matrice ? Propriétaire ou membre, quel que soit le rôle. Appelée par les policies RLS et par les RPC — une seule définition de l''accès pour les deux.';
comment on function public.peut_ecrire(uuid) is
  'Cette personne peut-elle MODIFIER le contenu de cette matrice ? Propriétaire, ou membre en écriture. Ne donne PAS le droit de renommer ou supprimer la matrice elle-même : cela reste au propriétaire.';

-- ── `task_attachments` doit savoir de quelle matrice il relève ───────────────
--
-- Aujourd'hui un lien n'atteint sa matrice que par `task_id → tasks.board_id`.
-- Deux raisons rendent la dénormalisation obligatoire, et aucune n'est une
-- affaire de performance pure :
--
-- 1. **Le filtre temps réel ne sait pas joindre.** C'est une chaîne transmise
--    dans la trame WebSocket, évaluée sur la ligne telle qu'elle voyage. Sans
--    `board_id` sur la ligne, il n'y a rien à filtrer — et pour les DELETE, le
--    filtre est la SEULE barrière (mesuré le 2026-09-08, cf. `realtime.ts`).
-- 2. La policy exécuterait sinon une sous-requête par abonné ET par événement.
alter table task_attachments add column board_id uuid references boards (id) on delete cascade;

update task_attachments a
   set board_id = t.board_id
  from tasks t
 where t.id = a.task_id;

alter table task_attachments alter column board_id set not null;
create index task_attachments_board_idx on task_attachments (board_id);

-- Posé par la base, jamais par les trois clients : la règle doit valoir pour
-- l'app web, le panneau d'extension et le serveur MCP, et la poser côté client
-- la ferait exister en trois copies — c'est ainsi qu'une règle se met à mentir
-- d'un seul côté (même raisonnement que `tasks_completed_at`).
create or replace function public.task_attachments_board_id()
returns trigger language plpgsql as $$
begin
  new.board_id = (select t.board_id from public.tasks t where t.id = new.task_id);
  return new;
end;
$$;

create trigger task_attachments_board_id
  before insert or update of task_id on task_attachments
  for each row execute function public.task_attachments_board_id();

-- ⚠️ Et le cas qu'on oublie : une TÂCHE déplacée vers une autre matrice.
--
-- Sans ce second trigger, ses liens garderaient l'ancienne matrice. Le lien
-- deviendrait invisible à qui voit la nouvelle, et — bien pire — resterait
-- délivré en temps réel à qui voit l'ancienne. Une fuite qui survit au
-- déplacement, et que rien ne signale.
create or replace function public.tasks_propager_board_id()
returns trigger language plpgsql as $$
begin
  update public.task_attachments
     set board_id = new.board_id
   where task_id = new.id;
  return null;
end;
$$;

create trigger tasks_propager_board_id
  after update of board_id on tasks
  for each row when (old.board_id is distinct from new.board_id)
  execute function public.tasks_propager_board_id();

-- ── Réécriture des policies ──────────────────────────────────────────────────
--
-- Une policy par verbe, et non plus une `for all` : c'est exactement ce que le
-- partage demande de distinguer — lire si membre, écrire si le rôle le permet,
-- disposer de la matrice si propriétaire.

-- Matrices : tout le monde la voit, le propriétaire seul en dispose.
--
-- Renommer et supprimer restent au propriétaire, y compris pour un membre en
-- écriture. Ce n'est pas une timidité : « écriture » porte sur le CONTENU. Un
-- invité qui supprimerait la matrice détruirait le travail de tous les autres,
-- sans qu'aucun d'eux ait consenti à lui donner ce pouvoir.
drop policy "boards: owner" on boards;

create policy "boards: lire si accès" on boards
  for select using (peut_lire(id));
create policy "boards: créer pour soi" on boards
  for insert with check (user_id = auth.uid());
create policy "boards: modifier si propriétaire" on boards
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "boards: supprimer si propriétaire" on boards
  for delete using (user_id = auth.uid());

-- Tâches : le contenu, gouverné par le rôle.
--
-- ⚠️ `with check` sur l'UPDATE n'est pas une redondance du `using`. `using`
-- porte sur la ligne AVANT, `with check` sur la ligne APRÈS : les deux ensemble
-- interdisent de déplacer une tâche d'une matrice où l'on écrit vers une
-- matrice où l'on ne fait que lire — un transfert qui, sinon, passerait.
--
-- `user_id = auth.uid()` à l'insertion : la colonne devient l'AUTEUR (migration
-- C la renomme `author_id`, et le renommage emporte cette expression). On
-- n'écrit donc pas au nom de quelqu'un d'autre sur une matrice partagée.
drop policy "tasks: owner" on tasks;

create policy "tasks: lire si accès" on tasks
  for select using (peut_lire(board_id));
create policy "tasks: créer si écriture" on tasks
  for insert with check (peut_ecrire(board_id) and user_id = auth.uid());
create policy "tasks: modifier si écriture" on tasks
  for update using (peut_ecrire(board_id)) with check (peut_ecrire(board_id));
create policy "tasks: supprimer si écriture" on tasks
  for delete using (peut_ecrire(board_id));

-- Liens : mêmes droits que la tâche qu'ils décorent, via `board_id`.
drop policy "task_attachments: owner" on task_attachments;

create policy "task_attachments: lire si accès" on task_attachments
  for select using (peut_lire(board_id));
create policy "task_attachments: créer si écriture" on task_attachments
  for insert with check (peut_ecrire(board_id));
create policy "task_attachments: modifier si écriture" on task_attachments
  for update using (peut_ecrire(board_id)) with check (peut_ecrire(board_id));
create policy "task_attachments: supprimer si écriture" on task_attachments
  for delete using (peut_ecrire(board_id));

-- Appartenance : le propriétaire distribue, chacun peut partir.
alter table board_members enable row level security;

-- Les membres se voient entre eux : c'est ce qui permet d'afficher « coché par
-- Bob » sans donner à chacun la liste des comptes de la base.
create policy "board_members: lire si accès" on board_members
  for select using (peut_lire(board_id));
create policy "board_members: inviter si propriétaire" on board_members
  for insert with check (est_proprietaire(board_id));
create policy "board_members: changer le rôle si propriétaire" on board_members
  for update using (est_proprietaire(board_id)) with check (est_proprietaire(board_id));
-- Le propriétaire révoque, et l'invité QUITTE. Les deux passent par la même
-- ligne, donc par la même policy — un `delete` supplémentaire réservé à soi-même
-- aurait été une seconde règle à tenir d'accord avec la première.
create policy "board_members: révoquer ou quitter" on board_members
  for delete using (est_proprietaire(board_id) or user_id = auth.uid());
