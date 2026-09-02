-- Penduline — une tâche peut porter une échéance (#19).
--
-- La matrice classe dans l'espace — urgent, important — et pas dans le temps.
-- « Avant mardi » finissait écrit dans le titre, faute d'endroit où le mettre.
--
-- Une COLONNE, pas une table : une tâche a au plus une échéance. C'est la
-- différence exacte avec les liens de #78, où une tâche en porte plusieurs — une
-- issue et sa PR — et où une colonne aurait obligé à choisir lequel compte.
--
-- Aucun statut n'est stocké. « Dans le rouge » se déduit de `due_at` et de
-- l'heure courante au moment du rendu : une colonne `overdue` serait fausse dès
-- la minute suivante, et il faudrait quelqu'un pour la réécrire. Personne ne
-- tourne encore côté serveur (c'est #20), et cette story se livre sans lui.

alter table public.tasks add column due_at timestamptz;

-- Index PARTIEL, et c'est le point : l'immense majorité des tâches n'auront
-- jamais d'échéance. Les indexer toutes coûterait la taille d'un index plein
-- pour répondre à des requêtes qui ne regardent qu'une poignée de lignes.
--
-- Le prédicat reprend celui du parcours réel — « mes échéances qui comptent
-- encore » : une tâche cochée ou supprimée n'est plus en retard, elle est sortie.
create index tasks_due_idx on public.tasks (user_id, due_at)
  where due_at is not null and not done and not deleted;

-- Rien d'autre à faire, et c'est voulu :
--   · la policy « tasks: owner » est `for all`, donc indifférente aux colonnes ;
--   · `public.tasks` est déjà publiée en temps réel avec `replica identity full`
--     (#39), donc la colonne voyagera d'un onglet à l'autre sans un mot de plus ;
--   · le trigger `tasks_updated_at` horodate la modification tout seul.
