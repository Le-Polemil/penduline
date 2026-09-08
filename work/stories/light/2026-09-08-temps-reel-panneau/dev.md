---
slug: "temps-reel-panneau"
title: "Temps réel du panneau, et délivrance scopée à l'accès"
issues: [117]
created: 2026-09-08
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| T0 — Établir que le push répond en production (service + migration appliquée) | Terminé | 2026-09-08 |
| T1 — `packages/shared/src/realtime.ts` : fonctions pures de fusion déplacées depuis `useRealtime.ts` | En attente | |
| T2 — `packages/shared/src/realtime.test.ts` : tests des fonctions pures (identité préservée, insertion, remplacement, retrait d'un absent) | En attente | |
| T3 — `subscribeRealtime(client, userId, sink)` : câblage du canal sans React, collections du sink facultatives, retrait du filtre serveur | En attente | |
| T4 — Export depuis `packages/shared/src/index.ts` | En attente | |
| T5 — `apps/web/src/data/useRealtime.ts` réduit à l'enveloppe React, sink inchangé côté appelant | En attente | |
| T6 — Non-régression web vérifiée à deux onglets avant de toucher à l'extension | En attente | |
| T7 — `apps/extension/src/store.ts` : abonnement, `admits` propre au panneau, `reload` = `refresh()` de #116 | En attente | |
| T8 — `apps/extension/src/App.tsx` : relecture au changement de vue conditionnée à l'état du canal | En attente | |
| T9 — Commentaire anti-régression : pas de canal dans le service worker MV3 | En attente | |
| T10 — `work/coolify-deploy.md` : documenter le service Realtime (aujourd'hui muet) | En attente | |
| T11 — `work/architecture.md` : corriger les lignes périmées (temps réel « non branché », épinglage) | En attente | |
| T12 — Portes qualité : typecheck, tests, build | En attente | |
| T13 — Validation manuelle (plan de test du plan.md) | En attente | |
| T14 — Reporter dans #53 les six constats d'héritage | En attente | |

## Journal

### 2026-09-08 : T0 — Établir que le push répond en production

**Statut** : Terminé

**Pourquoi d'abord.** La synthèse de #39 est explicite : la publication
`supabase_realtime` était vide, un client s'abonnait, recevait `SUBSCRIBED` et
**rien d'autre** — aucune erreur, aucun symptôme. Elle conclut que l'avoir cherché
avant d'écrire le client avait économisé une journée de débogage d'un code
parfaitement correct. On ne recommence pas.

**Actions réalisées** :

- sonde de joignabilité en lecture seule (script temporaire, supprimé après
  exécution) : abonnement `postgres_changes` sur `tasks` contre
  `api.penduline.polemil.dev` → **`SUBSCRIBED`**. Le service est exposé et un
  canal rejoint ;
- ⚠️ `SUBSCRIBED` étant précisément le faux positif de #39, preuve séparée que la
  migration est appliquée en production. Comme
  `20260829140000_realtime.sql` n'ajoute **aucune colonne**, la technique de
  sondage PostgREST du 7 septembre ne s'y applique pas directement → preuve
  **transitive** par deux migrations postérieures :
  - `GET /rest/v1/tasks?select=parent_id&limit=1` → `HTTP 200` (colonne de
    `20260829160000_subtasks.sql`)
  - `GET /rest/v1/task_attachments?select=id&limit=1` → `HTTP 200` (table de
    `20260829180000_task_attachments.sql`)
  - témoin négatif `?select=colonne_qui_nexiste_pas` → `HTTP 400 / 42703`, ce qui
    établit que la sonde discrimine au lieu de répondre `200` à tout.

  Les migrations étant appliquées dans l'ordre par
  `apps/supabase/deploy/penduline-migrate.sh`, la présence des artefacts de deux
  migrations postérieures établit celle de la migration realtime : publication
  peuplée, `replica identity full` en place.

**Fichiers modifiés** : aucun (vérification seule).

**Notes** :

- **Aucune écriture en production.** La preuve de bout en bout — écrire une tâche
  et attendre l'événement — aurait exigé les identifiants d'un compte réel, que la
  clé `anon` ne donne pas. La chaîne transitive s'y substitue sans rien toucher.
- Le plan est donc **viable** : il ne devient pas une tâche d'infrastructure.
- Constat à traiter en T10 : `work/coolify-deploy.md` ne contient **zéro**
  occurrence de « realtime », alors que ce service porte toute la fonctionnalité.
  Le seul endroit qui l'atteste est un commentaire de migration.

### 2026-09-08 : Cadrage — décision sur le filtre serveur

**Statut** : Terminé (décision, pas d'implémentation)

**La décision** : retirer le filtre `user_id=eq.<moi>`, et laisser la RLS seule
juge de ce qui est délivré.

**Pourquoi**, et ce n'est pas un pari :

- le filtre n'a jamais été la frontière de sécurité — le code le dit lui-même
  (« inutile de réveiller le client pour des lignes qu'il n'aurait pas le droit de
  lire de toute façon ») ;
- c'est déjà le motif du dépôt : `search_tasks`, `review_boards` et
  `completion_stats` sont toutes `security invoker` et n'ont **aucun** prédicat
  `user_id` ;
- sous #53 il bloquerait un invité **en silence**, et `tasks.user_id` change de
  sens (propriétaire → auteur) sans qu'aucun type ne s'en aperçoive.

**Ce qui a été écarté**, et pourquoi — un filtre `board_id=in.(…)` :
`task_attachments` ne porte pas de `board_id` et échapperait au motif ; il faudrait
se réabonner à chaque changement du jeu de matrices, avec une fenêtre d'événements
perdus à chaque fois ; et il remet dans le client une décision d'accès que #53 va
justement en sortir.

**Notes** : aucun effet observable avant #53. La non-régression est le seul critère
de ce volet, d'où T6 placée **avant** T7 — on prouve que le web n'a pas bougé avant
d'ajouter un second consommateur.
