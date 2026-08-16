---
story: "Préservation des paires dans shared"
story_code: "paires-dans-shared"
issues: [60]
created: 2026-08-16
status: "In Progress"
---

# Journal de développement

## Progression

| # | Tâche | Statut | Date |
|---|-------|--------|------|
| 1 | `TaskWrite`, `planPairMove`, `planPairDetach` dans `layout.ts` | Terminé | 2026-08-16 |
| 2 | Tests des deux fonctions, cas dégradés compris | Terminé | 2026-08-16 |
| 3 | Rebrancher les 8 appelants du web | Terminé | 2026-08-16 |
| 4 | Rebrancher les 3 appelants de l'extension | Terminé | 2026-08-16 |
| 5 | **Commit 1** — extraction, comportement identique | Terminé | 2026-08-16 |
| 6 | **Commit 2** — corriger le décalage fixe de +0,001 | En attente | |
| 7 | Documentation (`README.md`) | En attente | |
| 8 | Vérifications qualité + test manuel | En attente | |

## Journal

<!-- Les entrées sont ajoutées ici après chaque action concrète. -->

### 2026-08-16 — Tâches 1 à 5 : l'extraction

**Statut** : Terminé

**Actions réalisées** :
- `TaskWrite`, `planPairMove`, `planPairDetach` et `planPairPatch` dans `layout.ts`.
- 7 tests supplémentaires (31 au total).
- Huit appelants du web et trois de l'extension rebranchés ; les deux `movePair`
  locaux ont disparu.

**Fichiers modifiés** :
- `packages/shared/src/layout.ts`, `packages/shared/src/layout.test.ts`
- `apps/web/src/screens/Matrix.tsx`, `apps/extension/src/App.tsx`

**Notes** :

*Une quatrième fonction s'est imposée en rebranchant.* L'épinglage applique le
même patch aux deux tâches **sans toucher aux positions** — il ne rentrait donc
pas dans `planPairMove`, qui en exige une. Lui passer une position factice aurait
réordonné la paire à chaque épinglage. D'où `planPairPatch`, et une décomposition
plus juste : `planPairMove` = `planPairPatch` + des positions.

*Une parenté que la dispersion cachait.* `unpair()`, `archive()` et `removeTask()`
faisaient tous les trois la même chose sans en avoir l'air : `pair_id` à `null` des
deux côtés, plus un patch propre à la tâche qui part. `planPairDetach` les couvre
d'un coup — ce n'est pas un effet du refactoring, c'est ce qu'il révèle.

*Les `partnerOf` restants sont volontaires.* Quatre appels subsistent dans les
composants, mais aucun ne duplique une logique d'écriture : ils servent à
composer le texte d'une confirmation, à exclure les deux moitiés d'une liste de
référence, et à décider si « Dissocier » doit apparaître. Connaître la partenaire
pour ses propres besoins n'est pas la même chose que réimplémenter l'invariant.

*Le comportement est strictement identique* — `+0.001` conservé tel quel. La
correction fait l'objet du commit suivant, pour qu'un déplacement de code et un
changement de comportement restent relisibles séparément.

**Vérifications** : 31 tests, typecheck et build au vert ; `grep "function movePair" apps/`
ne renvoie plus rien.
