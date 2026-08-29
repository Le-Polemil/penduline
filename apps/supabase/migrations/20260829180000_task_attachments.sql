-- Penduline — une tâche peut porter des liens (#78).
--
-- La capture depuis le navigateur retenait le titre et perdait l'URL : clic
-- droit sur le nom d'une issue qu'on vient de surligner, le titre est bon, le
-- lien s'évapore. Or c'est le lien qui rend la tâche actionnable trois jours
-- plus tard.
--
-- Une TABLE, pas une colonne : une tâche porte plusieurs liens — une issue et sa
-- PR, un article et sa discussion. Une colonne obligerait à choisir lequel
-- compte, ou à empiler du texte dans un champ.

create table task_attachments (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references tasks (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  -- ⚠️ Le schéma est contraint EN BASE, pas seulement à la saisie.
  --
  -- Un `javascript:` entré par l'API — un client tiers, un script, une version
  -- future du front qui oublierait de valider — finirait cliquable dans l'app
  -- web. La contrainte est la seule barrière que rien ne contourne. Le front
  -- valide AUSSI, pour le message d'erreur ; la base valide POUR de bon.
  url        text not null check (url ~* '^https?://' and char_length(url) between 8 and 2048),
  -- Facultatif : sans lui, l'interface affiche le domaine. Un lien sans nom vaut
  -- mieux qu'un nom inventé.
  label      text check (label is null or char_length(label) between 1 and 200),
  position   double precision not null default 0,
  created_at timestamptz not null default now()
);

-- Le parcours réel est « les pièces jointes de mes tâches, dans l'ordre ».
create index task_attachments_task_idx on task_attachments (task_id, position);
create index task_attachments_user_idx on task_attachments (user_id);

-- Isolation multi-utilisateur, identique à `boards`, `tasks` et `universes`.
alter table task_attachments enable row level security;

create policy "task_attachments: owner" on task_attachments
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Le temps réel (#39) doit propager les liens comme le reste : sans quoi un lien
-- ajouté dans un onglet n'apparaîtrait dans l'autre qu'au rechargement.
-- `replica identity full` est requis pour que les DELETE filtrés par RLS
-- portent leurs colonnes — la leçon de #39, qui vaut pour toute table publiée.
alter table task_attachments replica identity full;
alter publication supabase_realtime add table task_attachments;
