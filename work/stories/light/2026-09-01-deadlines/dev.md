---
slug: "deadlines"
title: "Deadlines : échéance, statut « dans le rouge » et tri"
created: 2026-09-01
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration `tasks.due_at` + index partiel | Terminé | 2026-09-01 |
| 2. `shared/types.ts` — `Task.due_at`, `TaskPatch`, fixture `makeTask` | Terminé | 2026-09-01 |
| 3. `shared/layout.ts` — statut, `splitOverdue`, formatage, conversions de fuseau | Terminé | 2026-09-01 |
| 4. `shared/layout.ts` — zones : `BoardGroup.overdue` et `planReorder` | Terminé | 2026-09-01 |
| 5. `shared/layout.test.ts` — suite `échéances (#19)` | Terminé | 2026-09-01 |
| 6. `web/data` — `TASK_COLS`, libellés d'annulation, hook `useNow` | Terminé | 2026-09-01 |
| 7. `web/components` — `Deadline.tsx`, badge et entrée de menu dans `TaskCard` | Terminé | 2026-09-01 |
| 8. `web/screens` — trois zones dans `Matrix` et `Global`, drop indexé zone 3 | Terminé | 2026-09-01 |
| 9. `web/styles.css` — badge, couleurs de statut, séparateur de zone | Terminé | 2026-09-01 |
| 10. `apps/extension` — `TASK_COLS`, badge, édition, tri de `listFor`, styles | Terminé | 2026-09-01 |
| 11. `README.md` — puce `due_at` dans la section « Modèle » | Terminé | 2026-09-01 |
| 12. Qualité — typecheck, tests, build | Terminé | 2026-09-01 |

## Journal

### 2026-09-01 : migration, types et couche partagée (tâches 1 à 5)

**Statut** : Terminé

**Actions réalisées** :

- Migration `20260901120000_task_due_at.sql` : `tasks.due_at timestamptz` nullable
  et `tasks_due_idx` partiel sur `(user_id, due_at)` restreint aux lignes ni
  cochées ni supprimées. Rien d'autre — la policy `"tasks: owner"` est `for all`
  donc indifférente aux colonnes, `public.tasks` est déjà publiée en temps réel
  avec `replica identity full`, et `tasks_updated_at` horodate seul.
- `types.ts` : `Task.due_at: string | null` et `'due_at'` dans `TaskPatch`.
- `layout.ts`, section `Échéances (#19)` : `deadlineStatus`, `isOverdue`,
  `splitOverdue`, `formatDeadline`, `toLocalInput`, `fromLocalInput`, toutes
  pures et toutes avec `now = Date.now()` en dernier paramètre.
- `BoardGroup` gagne `overdue`, `groupTasksByBoard` et `planReorder` gagnent
  `now`.
- 13 tests dans `describe('échéances (#19)')`. **133 tests verts** (120 avant).

**Fichiers modifiés** :

- `apps/supabase/migrations/20260901120000_task_due_at.sql` (nouveau)
- `packages/shared/src/types.ts`
- `packages/shared/src/layout.ts`
- `packages/shared/src/layout.test.ts`
- `packages/shared/src/test-fixtures.ts`

**Notes** :

- **La décision qui structure tout** : `splitOverdue` travaille sur des **lignes**
  (après `buildRows`), pas sur des cartes, et son `rest` **conserve l'ordre
  reçu**. C'est ce qui permet à `insertPosition` de rester intacte : elle moyenne
  les `position` de deux lignes voisines, donc elle exige une liste triée par
  position. On ne lui passe que `rest`. Sans cette contrainte, le
  glisser-déposer et `Alt`+flèches déposeraient à côté.
- Travailler sur les lignes évite aussi qu'une paire dont une seule carte est
  dépassée se fende entre deux zones.
- `planReorder` rend `null` pour une dépassée non épinglée : son rang appartient
  à son échéance. Une dépassée **épinglée** reste ordonnable — l'épinglage garde
  la préséance et sa zone n'est pas retriée.
- `toLocalInput` n'utilise surtout pas `toISOString().slice(0, 16)` : ce serait
  de l'heure UTC dans un champ qui affiche du local, et l'échéance perdrait le
  décalage à chaque aller-retour dans le formulaire.
- Une `due_at` illisible est traitée comme absente plutôt que comme dépassée :
  sinon une donnée bricolée ferait remonter n'importe quoi en tête de case.

### 2026-09-01 : application web (tâches 6 à 9)

**Statut** : Terminé

**Actions réalisées** :

- `store.ts` : `due_at` dans `TASK_COLS`, branche `taskLabel`
  (« Fixer l'échéance » / « Retirer l'échéance »).
- `useNow.ts` (nouveau) : tick de 60 s **plus** écoute de `visibilitychange`.
- `Deadline.tsx` (nouveau) : `datetime-local`, rend `null` hors édition.
- `TaskCard.tsx` : prop facultative `deadline`, badge `<time>` entre le titre et
  le `⋯`, modificateur `task--{statut}`, entrée de menu après « Attacher un
  lien ».
- `Matrix.tsx` et `Global.tsx` : les trois zones, `now` câblé, `dropInsert` et
  `planReorder` indexés sur la zone manuelle seule.
- `styles.css` : `.due`, `.due--soon`, `.due--overdue`, `.zone-split`,
  `.due-edit*`.

**Fichiers modifiés** :

- `apps/web/src/data/store.ts`, `apps/web/src/data/useNow.ts` (nouveau)
- `apps/web/src/components/Deadline.tsx` (nouveau),
  `apps/web/src/components/TaskCard.tsx`
- `apps/web/src/screens/Matrix.tsx`, `apps/web/src/screens/Global.tsx`
- `apps/web/src/styles.css`

**Notes** :

- **Le worktree n'avait pas de `node_modules`.** La résolution de
  `@penduline/shared` remontait donc vers le dépôt principal, et le typecheck du
  web échouait sur `splitOverdue` et `due_at` alors que la couche partagée était
  correcte. `npm install` dans le worktree a réglé le tout. À refaire dans tout
  nouveau worktree de ce dépôt avant de typechecker.
- **Défaut attrapé à l'écriture** : `Deadline` initialisait son brouillon par
  `useState(() => …)`, qui ne s'exécute qu'au montage. Le composant restant monté
  entre deux ouvertures, rouvrir l'éditeur après un `Ctrl+Z` ou une modification
  venue d'un autre onglet aurait proposé l'ancienne valeur — et la revalider
  aurait écrasé la bonne. Corrigé par un `useEffect` qui recale le brouillon à
  chaque ouverture.
- Une carte dépassée reste **glissable** vers une autre case : c'est exactement
  le comportement d'une épinglée aujourd'hui. Seul son rang dans sa propre case
  lui échappe. Les flèches ↑/↓ disparaissent (`rowCount` à 1), la zone n'a pas
  d'interstice, et `planReorder` rend `null` en garde-fou.

### 2026-09-01 : extension, README et qualité (tâches 10 à 12)

**Statut** : Terminé

**Actions réalisées** :

- `extension/store.ts` : `due_at` dans le `TASK_COLS` dupliqué, branche de
  libellé dans son `patchTask` réduit.
- `extension/App.tsx` : badge dans la carte, entrée `⏰` dans le menu `⋯`,
  éditeur `datetime-local` sous la carte, rang « en retard » dans `listFor`.
- `extension/useNow.ts` (nouveau) : copie assumée du crochet du web.
- `extension/styles.css` : mêmes classes `.due*`, en plus compact.
- `README.md` : puce `due_at` dans « Modèle ».
- **Typecheck OK** sur les trois espaces de travail. **159 tests verts**
  (133 partagés + 26 web). **Build OK** pour le web et l'extension.

**Fichiers modifiés** :

- `apps/extension/src/store.ts`, `apps/extension/src/App.tsx`,
  `apps/extension/src/styles.css`, `apps/extension/src/useNow.ts` (nouveau)
- `README.md`

**Notes** :

- `useNow` est **dupliqué** entre le web et l'extension plutôt que remonté dans
  `packages/shared` : celui-ci ne dépend pas de React, et l'y faire entrer pour
  douze lignes ferait payer la dépendance à tout ce qui l'importe. Même position
  que pour `usePersist`, dont l'en-tête dit que les deux hôtes ne partagent que
  `classifyWriteFailure`.
- Le tri du popup reste **volontairement divergent** de celui du web : liste
  plate, sans zones ni interstices, donc rien n'y dépend de l'ordre des
  `position` pour calculer une insertion. On y ajoute simplement le rang « en
  retard » entre l'épinglage et la position.
- L'éditeur du popup vit **hors** du menu : celui-ci se referme au choix de
  l'action, et la saisie doit lui survivre.

### 2026-09-01 : validation manuelle — NON EFFECTUÉE

**Statut** : En attente de l'utilisateur

Les vérifications automatiques passent, mais le plan de test manuel du `plan.md`
(12 points) n'a pas été joué : il demande un compte, une base servie et des
gestes à la souris. Les points qui ne sont couverts par **aucun** test
automatique, et qui méritent donc le clic :

- **Point 5** — glisser une carte entre deux autres alors qu'une dépassée est
  présente dans la case. C'est le geste qui valide toute la mécanique de zones ;
  la logique est testée dans `layout.test.ts`, son câblage au DOM ne l'est pas
  (le dépôt n'a aucun test de composant).
- **Point 10** — le passage au rouge tout seul, puis le recalcul immédiat au
  retour sur l'onglet. `useNow` n'est pas testé.
- **Point 11** — le changement de fuseau système. L'aller-retour
  `fromLocalInput`/`toLocalInput` est testé, le comportement du champ natif ne
  l'est pas.
- **Point 12** — l'extension, qu'il faut charger dans Chrome.

⚠️ La migration `20260901120000_task_due_at.sql` doit être appliquée avant que le
front ne lise la colonne — le pipeline de la PR #88 le fait désormais tout seul
au déploiement.
