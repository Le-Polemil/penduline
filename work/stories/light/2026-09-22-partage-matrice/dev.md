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
| 0. Spike temps réel — `realtime.send()` depuis un trigger, filtre `in.(…)` sur DELETE, longueur d'URL | Terminé | 2026-09-22 |
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

### 2026-09-22 : Spike temps réel

**Statut** : Terminé

**Actions réalisées** :
- Démarrage du Supabase local (seul `supabase_db_penduline` tournait).
- Lecture du schéma `realtime` et du **code source** des fonctions `apply_rls`,
  `is_visible_through_filters`, `check_equality_op`, `subscription_check_filters`.
- Appel réel de `realtime.send()` en SQL, et vérification de l'insertion dans
  `realtime.messages`.

**Les trois questions, et leurs réponses** :

1. **`realtime.send()` depuis un trigger — OUI.** La fonction existe avec la signature
   `(payload jsonb, event text, topic text, private boolean)`, l'appel passe, et le
   message atterrit dans `realtime.messages`. Le repli côté client documenté dans le plan
   n'a pas lieu d'être : on garde le trigger.

   ⚠️ **Mais une policy manque, et son absence est silencieuse.** `realtime.messages` a
   la RLS activée et **aucune policy** : un canal privé se connecte, ne reçoit rien, et
   ne signale aucune erreur. Exactement le symptôme de la publication vide de #39. La
   policy devient une pièce à part entière de la migration E.

2. **Un filtre `in.(…)` tranche-t-il un DELETE — OUI**, et la réponse vient du mécanisme,
   pas d'une observation. Dans `realtime.apply_rls` :
   - `if is_rls_enabled and action <> 'DELETE'` → la RLS n'est **pas** évaluée pour les
     DELETE, ce qui confirme la mesure du 2026-09-08 ;
   - les filtres sont appliqués à `old_columns` autant qu'à `columns` → la ligne
     supprimée entière (grâce à `replica identity full`) est bien confrontée au filtre ;
   - `if not is_rls_enabled or action = 'DELETE'` → passer le filtre SUFFIT à être
     délivré ;
   - `check_equality_op` traduit `in` en `= any(…)` : **même chemin de code que `eq`**.

   Le levier annoncé par le plan tient donc, et pour la raison annoncée.

3. **Longueur d'un `in.(…)` — la vraie limite n'est pas l'URL.** Le filtre voyage dans la
   trame WebSocket, pas dans une URL. En revanche `realtime.subscription_check_filters`
   **plafonne un filtre `in` à 100 valeurs** et **LÈVE** au-delà
   (`too many values for `in` filter. Maximum 100`). L'abonnement échoue alors en entier :
   plus aucun temps réel, pas seulement les matrices en trop.

**Fichiers modifiés** :
- `work/stories/light/2026-09-22-partage-matrice/plan.md` (actions 5 et 7 amendées)

**Notes** : le plafond à 100 est le seul vrai changement de conception issu du spike. Le
jeu de matrices accessibles sera découpé en tranches de 100, une liaison
`on('postgres_changes', …)` par tranche sur le même canal. Un compte réel en a une
poignée — mais le mode de défaillance est total et muet, donc il se traite maintenant, pas
le jour où quelqu'un franchit le seuil.
