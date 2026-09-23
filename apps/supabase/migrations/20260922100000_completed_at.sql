-- Penduline — `completed_at` : l'instant du cochage, et rien d'autre.
--
-- ── CETTE MIGRATION RENVERSE UNE DÉCISION ÉCRITE ─────────────────────────────
--
-- `20260901140000_stats.sql` refusait explicitement cette colonne, et son
-- argument était bon : depuis #75, cocher n'est qu'UNE SEULE écriture portant
-- `done` et `archived` ensemble, donc pour une tâche `done` jamais retouchée
-- ensuite, `updated_at` EST l'instant de complétion, au millième.
--
-- Ce qui a changé, c'est le « jamais retouchée ensuite ». La corbeille doit
-- s'ordonner par date de cochage ; or `updated_at` est réécrit par son trigger à
-- CHAQUE update, quelle que soit la colonne touchée. Renommer une tâche déjà
-- rangée la fait remonter en tête d'une liste qui prétend classer par cochage.
-- C'est le raisonnement exact qui a fait naître `quadrant_changed_at` en #47 —
-- appliqué cette fois à la complétion.
--
-- La colonne ne duplique donc PAS `updated_at` : elle en est l'inverse. L'un dit
-- « dernière modification, quelle qu'elle soit », l'autre « moment où la tâche a
-- quitté la grille ». Les confondre est précisément ce qui a produit le défaut.
--
-- `quadrant_changed_at` reste distincte et intacte : elle date un changement de
-- CASE. Une tâche peut changer de case dix fois sans être cochée, et être cochée
-- sans changer de case. Trois colonnes, trois questions, aucune redondance.

alter table public.tasks add column completed_at timestamptz;

comment on column public.tasks.completed_at is
  'Instant du cochage. `null` = pas cochée, y compris après une restauration. Tenue par trigger : aucun client ne l''écrit, et aucune autre modification ne la déplace (#48 bis).';

/*
  Le trigger, et pourquoi il ne peut pas être ailleurs.

  La règle doit valoir pour TOUTE écriture — l'app web, le popup, et depuis #23
  le serveur MCP. La poser côté client la ferait exister en trois copies, et
  c'est exactement comme ça qu'une règle se met à mentir d'un seul côté.

  `update of done` : le trigger ne se déclenche que si `done` figure dans le SET.
  Un renommage, un déplacement, une échéance ne l'atteignent jamais — c'est tout
  l'objet de la colonne.
*/
create or replace function public.tasks_completed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- Une tâche créée déjà cochée (import, API) : rare, mais elle doit porter
    -- une date, sinon elle serait indistinguable d'une tâche ouverte.
    if new.done then new.completed_at = now(); end if;
    return new;
  end if;

  -- Cochée : on date. La comparaison porte sur la TRANSITION, pas sur la valeur :
  -- réécrire `done = true` sur une tâche déjà cochée ne doit rien déplacer.
  if new.done and not old.done then
    new.completed_at = now();
  -- Décochée — annulation dans les quatre secondes, ou restauration depuis la
  -- corbeille. La date part avec : une tâche revenue dans la grille n'a pas de
  -- date de cochage, et en garder une ferait mentir un futur affichage.
  elsif old.done and not new.done then
    new.completed_at = null;
  end if;

  return new;
end;
$$;

create trigger tasks_completed_at
  before insert or update of done on public.tasks
  for each row execute function public.tasks_completed_at();

/*
  RATTRAPAGE DE L'EXISTANT — et le piège qu'il fallait désamorcer.

  Pour les tâches déjà cochées, `updated_at` reste la meilleure estimation
  disponible, et c'est même une BONNE estimation : c'est tout l'argument de #48,
  qui vaut pour tout ce qui n'a pas été retouché depuis.

  ⚠️ Mais `tasks_updated_at` se déclenche sur TOUT update, sans liste de
  colonnes. Lancer le rattrapage tel quel copierait bien l'ancien `updated_at`
  dans `completed_at` — l'expression du SET lit les valeurs d'AVANT — puis le
  trigger écraserait `updated_at` par `now()` sur chaque ligne touchée. On
  détruirait la donnée dont les statistiques de #48 dépendent, dans le geste même
  qui prétend la préserver. D'où la désactivation le temps du rattrapage.

  Le trigger posé ci-dessus ne se déclenche pas ici : le SET ne touche pas `done`.
*/
alter table public.tasks disable trigger tasks_updated_at;

update public.tasks
   set completed_at = updated_at
 where done and completed_at is null;

alter table public.tasks enable trigger tasks_updated_at;

-- Aucun index. La corbeille trie EN MÉMOIRE — ses tâches sont déjà chargées par
-- `loadBin`. `tasks_completed_idx` (#48) continue de servir les statistiques, qui
-- lisent toujours `updated_at` : les basculer sur `completed_at` est un choix
-- séparé, qui se discute avec ses propres conséquences sur l'historique affiché.
