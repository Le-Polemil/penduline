-- Penduline — synchronisation temps réel entre onglets et appareils (#39).
--
-- Le service Realtime tourne déjà (il n'était pas dans les sept services retirés
-- du compose lors du dégraissage). Ce qui manque, c'est la PUBLICATION : sans
-- table déclarée, un client s'abonne, se connecte, et ne reçoit strictement
-- rien — aucune erreur, aucun symptôme, sinon l'absence de synchronisation.

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.boards;
alter publication supabase_realtime add table public.universes;

/*
  `replica identity full` — indispensable, et pas une optimisation.

  Par défaut, un événement DELETE ne transporte que la clé primaire. Or Realtime
  applique la RLS à chaque événement avant de le délivrer, et la policy de ces
  tables porte sur `user_id = auth.uid()` : sur une ligne réduite à son `id`, il
  n'y a rien à évaluer, et l'événement N'EST PAS DÉLIVRÉ.

  Concrètement : purger une tâche dans un onglet la laisserait affichée dans
  l'autre, indéfiniment. Avec `full`, la ligne supprimée voyage entière, la RLS
  peut trancher, et l'événement arrive.

  Contrepartie assumée : le WAL grossit, chaque UPDATE y écrivant aussi l'ancienne
  version de la ligne. À ce volume, c'est sans conséquence.
*/
alter table public.tasks      replica identity full;
alter table public.boards     replica identity full;
alter table public.universes  replica identity full;
