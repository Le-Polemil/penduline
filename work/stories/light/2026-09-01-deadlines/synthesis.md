---
slug: "deadlines"
title: "Deadlines : échéance, statut « dans le rouge » et tri"
created: 2026-09-01
completed: 2026-09-01
status: "Done"
---

# Synthèse

## Résumé

Une tâche peut désormais porter une échéance (`tasks.due_at`, en UTC). Elle
s'affiche par un badge dont la couleur suit trois états — neutre, « bientôt »
(moins de 24 h), « dans le rouge » —, et une tâche dépassée **remonte** en tête
de sa case. Web et extension, pose et retrait des deux côtés.

Aucune automatisation : rien ne se déplace, rien ne notifie. `due_at` est le
prérequis de #22, #30 et #32, et cette story existe pour qu'il se livre seul,
sans attendre le moteur de planification de #20.

## La décision qui structure tout

Faire remonter les dépassées casse une prémisse du code : `insertPosition`
moyenne les `position` de deux lignes voisines, donc elle exige que l'ordre
**affiché** soit l'ordre des **positions**. Sans précaution, le glisser-déposer
et `Alt`+flèches auraient déposé à côté.

La réponse ne demandait aucune invention : les épinglées vivent **déjà** dans une
zone séparée, et `planReorder` documente la règle. Les dépassées deviennent une
troisième zone sur ce précédent :

```
zone 1  épinglées      ordre position    pas d'interstice   inchangée
zone 2  en retard      ordre due_at ↑    pas d'interstice   NOUVELLE
zone 3  ordre manuel   ordre position    interstices ✓      inchangée
```

`splitOverdue` travaille sur des **lignes** (après `buildRows`) et son `rest`
**conserve l'ordre reçu**. On ne passe que `rest` aux calculs d'insertion :
`insertPosition`, `visibleTasks` et toute l'arithmétique fractionnaire restent
donc rigoureusement inchangées.

Conséquences assumées :

- Une dépassée non épinglée perd ses flèches ↑/↓ : son rang appartient à son
  échéance. Elle reste **glissable** vers une autre case, exactement comme une
  épinglée aujourd'hui.
- L'épinglage garde la préséance : la zone 1 n'est pas retriée par échéance.
- Découper sur les lignes plutôt que sur les cartes évite qu'une paire dont une
  seule carte est dépassée se fende entre deux zones.

## Changements réalisés

- **Migration** `tasks.due_at timestamptz` + `tasks_due_idx` partiel. Rien
  d'autre : la policy `"tasks: owner"` est `for all`, `public.tasks` est déjà
  publiée en temps réel, et `tasks_updated_at` horodate seul.
- **`packages/shared`** : `deadlineStatus`, `isOverdue`, `splitOverdue`,
  `formatDeadline`, `toLocalInput`, `fromLocalInput` — toutes pures, toutes avec
  `now = Date.now()` en dernier paramètre, sur le patron de `isFreshCapture`.
  `BoardGroup.overdue`, `planReorder` qui refuse une dépassée.
- **Web** : `Deadline.tsx`, badge `<time>` dans `TaskCard`, entrée de menu, les
  trois zones dans `Matrix` et `Global`, crochet `useNow`.
- **Extension** : badge, édition, rang « en retard » dans son tri local.
- Annulation `Ctrl+Z` et synchronisation temps réel fonctionnent **sans une ligne
  de code** : `previousValues` est piloté par les clés du patch, et `identiques`
  itère celles de la ligne entrante.

## Fichiers modifiés

- `apps/supabase/migrations/20260901120000_task_due_at.sql` *(nouveau)*
- `packages/shared/src/` : `types.ts`, `layout.ts`, `layout.test.ts`,
  `test-fixtures.ts`
- `apps/web/src/` : `data/store.ts`, `data/useNow.ts` *(nouveau)*,
  `components/Deadline.tsx` *(nouveau)*, `components/TaskCard.tsx`,
  `screens/Matrix.tsx`, `screens/Global.tsx`, `styles.css`
- `apps/extension/src/` : `store.ts`, `App.tsx`, `useNow.ts` *(nouveau)*,
  `styles.css`
- `README.md`

## Tests et validation

- **Linting** : ⚪ sans objet — le dépôt n'a pas de linter.
- **Typecheck** : ✅ les trois espaces de travail.
- **Tests automatiques** : ✅ **159** (133 partagés dont 13 nouveaux, 26 web).
- **Build** : ✅ web et extension.
- **Validation manuelle** : ❌ **non effectuée** — voir le dernier bloc de
  `dev.md` pour les quatre points qui ne sont couverts par aucun test.

## Notes

- Le dépôt n'a **aucun test de composant React**. Tout ce qui devait être vérifié
  a donc été poussé dans `packages/shared` ; ce qui reste dans l'interface — le
  câblage des zones au DOM, `useNow`, le champ `datetime-local` — n'est vérifiable
  qu'à la main.
- `useNow` est **volontairement dupliqué** entre le web et l'extension :
  `packages/shared` ne dépend pas de React, et l'y faire entrer pour douze lignes
  ferait payer la dépendance à tout ce qui l'importe.
- **Gotcha worktree** : un worktree fraîchement créé n'a pas de `node_modules`, et
  la résolution de `@penduline/shared` remonte alors vers le dépôt principal — le
  typecheck échoue sur du code pourtant correct. `npm install` dans le worktree
  avant toute vérification.
- Pour la suite : `due_at` seul ne fait rien tomber. #22 (actions automatiques)
  aura besoin d'un garde `due_applied_at`, faute de quoi un déplacement automatique
  se rejouerait après un déplacement manuel.
