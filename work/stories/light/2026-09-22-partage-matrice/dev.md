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
| 1. Migration A — appartenance (`board_members`, `peut_lire`/`peut_ecrire`, réécriture RLS, `task_attachments.board_id`) | Terminé | 2026-09-22 |
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


### 2026-09-22 : Migration A — appartenance et réécriture RLS

**Statut** : Terminé

**Actions réalisées** :
- Enum `board_role`, table `board_members` (le propriétaire n'y figure pas :
  `boards.user_id` reste l'autorité), index sur le parcours inverse `(user_id)`.
- Trois fonctions `security definer` : `est_proprietaire`, `peut_lire`, `peut_ecrire`.
- `task_attachments.board_id` dénormalisé, rempli par trigger — **et** un second trigger
  `tasks_propager_board_id` pour le cas oublié du plan : une tâche déplacée vers une
  autre matrice laissait ses liens rattachés à l'ancienne, donc délivrés en temps réel à
  qui voit l'ancienne. Une fuite qui survit au déplacement.
- Les quatre policies `for all` remplacées par **16 policies**, une par verbe et par table.
- Migration appliquée à la base locale et enregistrée dans `schema_migrations`.

**Fichiers modifiés** :
- `apps/supabase/migrations/20260922130000_partage_appartenance.sql` (nouveau)

**Validation à deux comptes** (seeds `demo@penduline.test` / `intrus@penduline.test`,
le tout dans une transaction annulée — aucun résidu en base) :

| Situation | Attendu | Obtenu |
|---|---|---|
| demo, ses matrices | 4 | 4 |
| intrus, sans partage | 0 matrice, 0 tâche | 0 / 0 |
| intrus en `lecture` | voit la matrice et ses tâches | 1 matrice, 3 tâches |
| intrus en `lecture`, insertion d'une tâche | refus | `new row violates row-level security policy` |
| intrus en `ecriture`, insertion | acceptée | acceptée |
| intrus en `ecriture`, renommage de la matrice | refus | 0 ligne touchée |

Aucune erreur de récursion : le `security definer` fait bien son office.

**Notes** :

⚠️ **Piège d'environnement, à ne pas réapprendre.** `supabase … migration up --local`
et `db reset --local` visent le port **54322**, qui est occupé par le conteneur d'un
AUTRE projet (`supabase_db_pcb-fidfe`). Le Postgres de Penduline écoute sur **55322**
(et Kong sur 55321), la CLI ayant décalé les ports au démarrage faute de trouver ceux de
`config.toml` libres. La commande a heureusement échoué sur un contrôle d'historique —
elle aurait sinon appliqué cette migration à la base d'un autre projet. Les migrations
sont donc appliquées via `docker exec -i supabase_db_penduline psql`, et la ligne de
`supabase_migrations.schema_migrations` posée à la main.