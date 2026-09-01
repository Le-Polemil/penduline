---
story: "Revue périodique : ce qui stagne, ce qui n'a jamais bougé"
story_code: "revue-periodique"
issue: 47
created: 2026-09-01
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : `quadrant_changed_at`, trigger dédié, index partiel, RPC `review_boards()` | En attente | |
| 2. `packages/shared/types.ts` : `quadrant_changed_at` sur `Task` + fixture `makeTask` | En attente | |
| 3. `packages/shared/review.ts` : seuils, défauts et calcul pur des 5 signaux | En attente | |
| 4. `packages/shared/review.test.ts` : un test par signal + les bords | En attente | |
| 5. `store.ts` : `quadrant_changed_at` dans `TASK_COLS` | En attente | |
| 6. `data/useReview.ts` : appel de la RPC, une fois par visite | En attente | |
| 7. `screens/Review.tsx` : l'écran, réutilisant `TaskCard` et `store.group` | En attente | |
| 8. `App.tsx` + `Home.tsx` : routage `{ kind: 'review' }` et bouton d'entrée | En attente | |
| 9. `styles.css` : styles de l'écran, mobile compris | En attente | |
| 10. Qualité : `npm test` + `npm run typecheck` | En attente | |
| 11. Validation manuelle navigateur (mobile + desktop) | En attente | |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->
