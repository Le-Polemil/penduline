-- Penduline — la matière de la revue périodique (#47).
--
-- Deux pièces, pour deux manques distincts.
--
-- 1. `quadrant_changed_at` : la seule donnée que le ticket croyait déjà avoir.
-- 2. `review_boards()` : les faits que le client ne peut PAS connaître depuis #40.

-- ── 1. Quand cette tâche a-t-elle changé de case ? ───────────────────────────
--
-- POURQUOI UNE COLONNE, ET PAS `updated_at`.
-- `set_updated_at()` écrase `updated_at` à CHAQUE update, quelle que soit la
-- colonne touchée. Une tâche renommée et une tâche déplacée deviennent donc
-- indiscernables — or la revue doit signaler la première et taire la seconde.
-- Le signal « jamais reclassée » n'est pas difficile à calculer avec l'existant :
-- il est indécidable.
--
-- LE DÉFAUT `now()` VAUT BACKFILL, ET C'EST UN CHOIX.
-- Remplir l'existant avec `created_at` serait plus « vrai » en apparence et
-- faux en pratique : l'historique des déplacements n'existe pas, donc TOUTE
-- tâche déjà déplacée rapporterait « jamais bougé depuis N mois ». Un écran de
-- revue qui présente comme oubliées des tâches reclassées la semaine dernière
-- ne perd pas un signal, il perd sa crédibilité entière.
--
-- Avec `now()`, l'erreur change de sens : pendant les premiers jours le signal
-- SOUS-rapporte (il ne montre rien) au lieu de SUR-rapporter (il montre tout).
-- Une absence est honnête, un faux positif est trompeur. L'interface le dit.
alter table public.tasks
  add column quadrant_changed_at timestamptz not null default now();

comment on column public.tasks.quadrant_changed_at is
  'Dernier changement de case. Ne dit rien des déplacements antérieurs à la migration #47 : l''existant est initialisé à la date de migration, pas à created_at.';

/*
  Trigger SÉPARÉ de `set_updated_at()`, volontairement.

  Cette dernière ne mentionne aucune table (`new.updated_at = now()`) : c'est ce
  qui la rend réutilisable. Y coudre une règle sur `tasks.quadrant` la
  spécialiserait pour son unique appelant actuel. Le dépôt a déjà le précédent
  d'un second trigger sur `tasks` (`tasks_depth_guard`).

  `update of quadrant` : le trigger ne s'arme même pas pour un renommage ou un
  déplacement de position. Le test `is distinct from` reste néanmoins
  nécessaire — la clause `of` se déclenche dès que la colonne est CITÉE dans le
  `set`, sa valeur fût-elle inchangée.
*/
create or replace function public.set_quadrant_changed_at()
returns trigger
language plpgsql
as $$
begin
  if new.quadrant is distinct from old.quadrant then
    new.quadrant_changed_at = now();
  end if;
  return new;
end;
$$;

create trigger tasks_quadrant_changed_at
  before update of quadrant on public.tasks
  for each row execute function public.set_quadrant_changed_at();

-- Les trois signaux calculés en mémoire filtrent tous sur (utilisateur, case,
-- ancienneté) parmi les tâches ouvertes. L'index partiel épouse exactement ce
-- prédicat — et il sert aussi le comptage d'`eliminer_open` ci-dessous.
create index tasks_review_idx
  on public.tasks (user_id, quadrant, quadrant_changed_at)
  where not done and not deleted;

-- ── 2. Ce que le client ne peut pas savoir ──────────────────────────────────
--
-- POURQUOI CÔTÉ SERVEUR.
-- Depuis #40, `store.tasks` ne contient que les tâches OUVERTES. Deux signaux
-- de la revue demandent l'inverse :
--
--   « matrice sans activité »  →  le max(updated_at) sur TOUTES ses tâches.
--       Calculé en mémoire, une matrice dont tout vient d'être terminé
--       passerait pour dormante — l'exact contraire de la vérité.
--   « Éliminer qui ne se vide pas »  →  la dernière sortie d'Éliminer, donc une
--       tâche archivée ou supprimée, invisible du client.
--
-- Même raisonnement, et même solution, que `search_tasks` (#45).
--
-- POURQUOI AUCUN SEUIL EN PARAMÈTRE.
-- La fonction rend des FAITS, pas des verdicts. Les seuils sont réglables par
-- l'utilisateur et vivent dans son navigateur ; les porter ici les dédoublerait
-- entre le SQL et `packages/shared/src/review.ts`, où ils sont testés. Sans
-- argument, la fonction reste par ailleurs appelable en GET par PostgREST.
create or replace function public.review_boards()
returns table (
  board_id uuid,
  last_activity timestamptz,
  eliminer_open int,
  eliminer_last_cleared timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    t.board_id,
    -- Toutes les tâches, étapes comprises : cocher une étape EST une activité
    -- sur la matrice, et la taire ferait passer pour dormante une matrice où
    -- l'on travaille.
    max(t.updated_at) as last_activity,
    -- Ici au contraire, `parent_id is null` : une étape hérite du quadrant de
    -- son parent (`Matrix.tsx`, `store.addTask(..., t.quadrant, ..., t.id)`).
    -- Sans ce filtre, une tâche d'Éliminer à trois étapes en compterait quatre.
    count(*) filter (
      where t.quadrant = 'eliminer' and not t.done and not t.deleted and t.parent_id is null
    )::int as eliminer_open,
    -- La dernière fois qu'une tâche d'Éliminer en est sortie. `null` = jamais.
    --
    -- Proxy assumé : pour une tâche terminée ou supprimée, `updated_at` est en
    -- pratique la date de sa sortie — c'est la dernière chose qui lui arrive.
    -- Le grain de `updated_at` est trop grossier pour le signal 2 (d'où la
    -- colonne ci-dessus), il suffit amplement pour celui-ci.
    max(t.updated_at) filter (
      where t.quadrant = 'eliminer' and (t.done or t.deleted) and t.parent_id is null
    ) as eliminer_last_cleared
  from public.tasks t
  group by t.board_id;
$$;

comment on function public.review_boards() is
  'Faits par matrice que le client ne peut pas calculer depuis #40 (il ne charge que les tâches ouvertes) : dernière activité toutes tâches confondues, et état de la case Éliminer. Rend des faits, jamais des verdicts — les seuils appartiennent au client.';
