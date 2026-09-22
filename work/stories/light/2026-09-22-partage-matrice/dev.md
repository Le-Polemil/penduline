---
story: "Partager une matrice avec quelqu'un"
story_code: "partage-matrice"
created: 2026-09-22
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 0. Spike temps réel — `realtime.send()` depuis un trigger, filtre `in.(…)` sur DELETE, longueur d'URL | En attente | |
| 1. Migration A — appartenance (`board_members`, `peut_lire`/`peut_ecrire`, réécriture RLS, `task_attachments.board_id`) | En attente | |
| 2. Migration B — rangement par personne (`board_placements`, backfill, retrait de `boards.universe_id`/`position`) | En attente | |
| 3. Migration C — attribution (`author_id`, `completed_by`, correctif `completion_stats`, revue des RPC) | En attente | |
| 4. Migration D — invitations (`board_invitations`, `accepter_invitation`) | En attente | |
| 5. Migration E — canal de révocation (trigger `realtime.send()`) | En attente | |
| 6. Suite de tests RLS à deux comptes (`partage.live.test.ts`) — avant le client | En attente | |
| 7. Temps réel conforme à l'accès (`packages/shared/src/realtime.ts` + tests unitaires) | En attente | |
| 8. Web — store, types, modale de partage, menu matrice, écran d'invitation | En attente | |
| 9. Attribution visible sur la carte de tâche | En attente | |
| 10. Extension et serveur MCP — colonnes et filtres alignés | En attente | |
| 11. Portes de qualité (lint, typecheck, tests) | En attente | |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->
