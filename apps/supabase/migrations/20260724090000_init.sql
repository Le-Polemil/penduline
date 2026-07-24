-- Penduline — schéma initial (aligné sur la maquette « Matrice Maison.dc.html »)
-- Une pièce = une matrice. Isolation multi-utilisateur : chaque ligne porte
-- user_id = auth.uid(), et les policies RLS empêchent tout accès croisé.

-- ── Enum des zones de la matrice (4 cases + « à trier ») ──────────────────────
create type quadrant as enum (
  'faire',
  'planifier',
  'deleguer',
  'eliminer',
  'parking'
);

-- ── Pièces de la maison (chacune EST une matrice) ────────────────────────────
create table rooms (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);
create index rooms_user_idx on rooms (user_id, position);

-- ── Tâches (éléments placés dans une case) ───────────────────────────────────
create table tasks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  room_id    uuid not null references rooms (id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 500),
  quadrant   quadrant not null default 'parking',
  done       boolean not null default false,
  pinned     boolean not null default false,
  archived   boolean not null default false,  -- terminée + rangée (corbeille)
  deleted    boolean not null default false,  -- supprimée (corbeille)
  -- Ordre dans (room, quadrant) ; fractionnaire pour insérer entre deux voisins.
  position   double precision not null default 0,
  -- Deux tâches partageant un pair_id s'affichent côte à côte (une ligne).
  pair_id    uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_room_idx on tasks (room_id, quadrant, position);
create index tasks_user_idx on tasks (user_id);

-- ── updated_at auto ──────────────────────────────────────────────────────────
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger tasks_updated_at
  before update on tasks
  for each row execute function set_updated_at();

-- ── Row Level Security : chacun ne voit/écrit que ses propres lignes ──────────
alter table rooms enable row level security;
alter table tasks enable row level security;

create policy "rooms: owner" on rooms
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "tasks: owner" on tasks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
