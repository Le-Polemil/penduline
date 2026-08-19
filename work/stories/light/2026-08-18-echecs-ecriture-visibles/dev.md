---
slug: "echecs-ecriture-visibles"
title: "Les échecs d'écriture sont invisibles pour l'utilisateur"
issue: 34
created: 2026-08-18
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. `packages/shared/src/write.ts` + `write.test.ts` + export dans `index.ts` | En attente | |
| 2. `apps/web/src/components/Toast.tsx` + CSS `.toast-stack` / `.toast--error`, monté dans `AppRoot` | En attente | |
| 3. Migrer le toast d'annulation dans l'hôte (`useCompletion`, `Matrix.tsx`, `Global.tsx`) | En attente | |
| 4. `apps/web/src/data/persist.ts` | En attente | |
| 5. Réécrire les 10 chemins de `apps/web/src/data/store.ts` sur `persist` | En attente | |
| 6. Session expirée : `view` en `sessionStorage`, `signOut({ scope: 'local' })` | En attente | |
| 7. Extension : `toast.tsx` + les 3 chemins de `apps/extension/src/store.ts` | En attente | |
| 8. Vérifier qu'aucun `console.error` ne subsiste seul sur un chemin d'écriture | En attente | |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->
