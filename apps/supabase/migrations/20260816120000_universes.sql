-- Penduline — les matrices peuvent être regroupées en « univers ».
--
-- Le modèle était plat (`boards` → `tasks`), ce qui tenait tant qu'on avait
-- quelques matrices. Le produit encourageant à en créer une par contexte,
-- l'accueil finit par devenir une liste indifférenciée.
--
-- Un univers regroupe des matrices SANS en devenir le propriétaire. Deux
-- décisions le disent :
--
--   * `boards.universe_id` est NULLABLE — aucune matrice n'est obligée
--     d'appartenir à un univers, et la migration n'en crée aucun. Tous les
--     comptes existants restent donc dans un état parfaitement valide.
--
--   * la suppression est `on delete set null`, PAS `cascade` — supprimer un
--     univers ne doit jamais emporter les matrices qu'il contenait, sans quoi
--     ranger deviendrait un acte risqué.

-- ── Univers ──────────────────────────────────────────────────────────────────
-- Mêmes contraintes que `boards` : le nom vient de l'utilisateur, borné comme
-- celui d'une matrice, et l'ordre est fractionnaire pour insérer entre deux
-- voisins sans renuméroter.
create table universes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index universes_user_idx on universes (user_id, position);

-- Isolation multi-utilisateur, identique à `boards` et `tasks`.
alter table universes enable row level security;

create policy "universes: owner" on universes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── Rattachement des matrices ────────────────────────────────────────────────
alter table boards
  add column universe_id uuid references universes (id) on delete set null;

-- L'accueil lit les matrices groupées par univers puis triées par position :
-- `boards_user_idx` (user_id, position) ne couvre plus ce parcours.
create index boards_universe_idx on boards (user_id, universe_id, position);
