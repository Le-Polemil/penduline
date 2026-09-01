---
story: "Statistiques rétrospectives par case"
story_code: "statistiques"
issue: 48
created: 2026-09-01
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : `completion_stats(since)` → `jsonb`, index partiel | En attente | |
| 2. `packages/shared/stats.ts` : types, parsing défensif, quatre lectures, constat en clair | En attente | |
| 3. `packages/shared/stats.test.ts` : une lecture par test + les pièges (moyenne de moyennes, trous, jsonb malformé) | En attente | |
| 4. `data/useStats.ts` : appel de la RPC, échec distingué de zéro | En attente | |
| 5. Charger le skill `dataviz`, puis `screens/Stats.tsx` en SVG à la main | En attente | |
| 6. `App.tsx` + `Home.tsx` : routage `{ kind: 'stats' }` et entrée | En attente | |
| 7. `styles.css` : styles de l'écran, mobile compris | En attente | |
| 8. Qualité : `npm test` + `npm run typecheck` | En attente | |
| 9. Validation migration en transaction annulée (formes, concordance, RLS, fuseau) | En attente | |
| 10. Validation manuelle navigateur (mobile + desktop) | En attente | |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->
