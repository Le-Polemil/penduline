-- Penduline — le rangement d'une matrice devient personnel (#53).
--
-- ── POURQUOI DEUX COLONNES DÉMÉNAGENT ────────────────────────────────────────
--
-- `boards` porte aujourd'hui `universe_id` et `position` : dans quel univers la
-- matrice est rangée, et à quelle place. Tant qu'une matrice appartenait à une
-- seule personne, c'était juste.
--
-- Le partage rend ces deux colonnes insoutenables là où elles sont :
--
-- 1. **Les univers restent privés.** `universes` garde sa policy
--    `user_id = auth.uid()`. Un invité verrait donc, sur la matrice partagée, un
--    `universe_id` pointant vers un univers qu'il n'a pas le droit de lire — un
--    identifiant orphelin, et une fuite de la façon dont l'autre s'organise.
-- 2. **Ranger est un geste d'écriture sur la ligne partagée.** Pour que l'invité
--    puisse classer la matrice chez lui, il faudrait lui ouvrir l'UPDATE sur
--    `boards` — donc aussi, de fait, le renommage. Un cloisonnement par colonne,
--    que la RLS ne sait pas exprimer proprement.
--
-- La table de placement est mono-utilisateur PAR CONSTRUCTION. Sa policy est
-- triviale, son filtre temps réel aussi : la scission CONTIENT la complexité du
-- partage au lieu de la diffuser dans tout le schéma.

create table board_placements (
  board_id    uuid not null references boards (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- `null` = pas rangée dans un univers. Un état normal, comme avant.
  -- `on delete set null` : supprimer un univers ne fait pas disparaître les
  -- matrices qu'il contenait — exactement la règle qui valait sur `boards`.
  universe_id uuid references universes (id) on delete set null,
  -- Fractionnaire, pour insérer entre deux voisines sans renuméroter. Scopée au
  -- couple (personne, univers), comme elle l'était au couple (personne, univers)
  -- sur `boards`.
  position    double precision not null default 0,
  primary key (board_id, user_id)
);

-- Le parcours de l'accueil : « mes matrices, groupées par univers, dans l'ordre ».
create index board_placements_user_idx on board_placements (user_id, universe_id, position);

-- ── Reprise de l'existant ────────────────────────────────────────────────────
-- Chaque matrice existante a un propriétaire et un rangement : il devient son
-- placement. Aucun compte ne doit voir son accueil bouger.
insert into board_placements (board_id, user_id, universe_id, position)
select b.id, b.user_id, b.universe_id, b.position from boards b;

-- Et les colonnes partent. Les laisser « au cas où » créerait deux sources de
-- vérité pour la même question, dont l'une ne serait plus jamais lue — celle
-- qu'on retrouve trois mois plus tard en se demandant laquelle fait foi.
-- (`boards_universe_idx` et `boards_user_idx` tombent avec elles.)
alter table boards drop column universe_id;
alter table boards drop column position;

-- ── Un placement naît avec l'accès, et meurt avec lui ────────────────────────
--
-- En base et non dans les clients : trois clients écrivent des matrices (web,
-- panneau d'extension, serveur MCP), et une matrice sans placement serait
-- INVISIBLE sur l'accueil de son propre propriétaire. Une règle qui doit tenir
-- pour tout le monde n'a qu'un endroit correct où vivre.

create or replace function public.placement_en_fin(p_user uuid, p_universe uuid)
returns double precision
language sql
stable
as $$
  -- Même calcul que `addBoard` côté client : le maximum du groupe, plus un.
  select coalesce(max(p.position), 0) + 1
    from public.board_placements p
   where p.user_id = p_user
     and p.universe_id is not distinct from p_universe;
$$;

create or replace function public.boards_placement_proprietaire()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.board_placements (board_id, user_id, position)
  values (new.id, new.user_id, public.placement_en_fin(new.user_id, null))
  on conflict do nothing;
  return null;
end;
$$;

create trigger boards_placement_proprietaire
  after insert on boards
  for each row execute function public.boards_placement_proprietaire();

-- L'invité reçoit la matrice HORS univers : ranger est son geste, pas celui de
-- l'inviteur. Elle apparaît en fin de liste, là où l'œil va chercher ce qui
-- vient d'arriver.
create or replace function public.board_members_placement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.board_placements (board_id, user_id, position)
  values (new.board_id, new.user_id, public.placement_en_fin(new.user_id, null))
  on conflict do nothing;
  return null;
end;
$$;

create trigger board_members_placement
  after insert on board_members
  for each row execute function public.board_members_placement();

-- Révocation, ou départ volontaire : le placement s'en va aussi.
--
-- Le garde-fou `not exists` n'est pas théorique : rien n'interdit au
-- propriétaire de figurer AUSSI dans `board_members` un jour (un import, une
-- migration maladroite). Sans lui, retirer cette ligne effacerait le rangement
-- du propriétaire sur sa propre matrice.
create or replace function public.board_members_retrait_placement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.board_placements p
   where p.board_id = old.board_id
     and p.user_id = old.user_id
     and not exists (
       select 1 from public.boards b
        where b.id = old.board_id and b.user_id = old.user_id
     );
  return null;
end;
$$;

create trigger board_members_retrait_placement
  after delete on board_members
  for each row execute function public.board_members_retrait_placement();

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Une seule policy `for all`, et cette fois c'est JUSTE : la table est
-- mono-utilisateur par construction, l'hypothèse « une ligne appartient à une
-- personne » y est vraie et le reste.
--
-- Le `with check` ajoute `peut_lire` : sans lui, n'importe qui pourrait
-- s'inventer un placement vers une matrice qu'il ne voit pas. Ça ne lui en
-- donnerait pas la lecture — les policies de `boards` et `tasks` tiennent seules
-- — mais son accueil afficherait une ligne fantôme, et il croirait à un bug.
alter table board_placements enable row level security;

create policy "board_placements: le sien" on board_placements
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid() and peut_lire(board_id));

-- ── Temps réel ───────────────────────────────────────────────────────────────
--
-- ⚠️ Cette table n'est pas publiée par confort, elle porte un SIGNAL.
--
-- Son filtre est `user_id=eq.<moi>` — stable, immunisé au plafond de 100 valeurs
-- du filtre `in`, et surtout il n'a PAS besoin d'être réabonné quand le jeu de
-- matrices accessibles change. Or c'est précisément lui qui change :
--
--   partage accordé  → INSERT du placement → délivré à l'invité, tout de suite
--   partage révoqué  → DELETE du placement → délivré à l'invité, tout de suite
--
-- Le DELETE arrive parce que le filtre est évalué sur la ligne entière avant
-- caviardage (`replica identity full`), et que Realtime n'évalue aucune policy
-- pour les DELETE — le filtre y suffit, et il est ici exact.
--
-- Autrement dit : cette table est le canal d'arrivée et de départ des matrices
-- partagées, et c'est elle qui déclenchera le réabonnement des autres tables.
alter table board_placements replica identity full;
alter publication supabase_realtime add table board_placements;
