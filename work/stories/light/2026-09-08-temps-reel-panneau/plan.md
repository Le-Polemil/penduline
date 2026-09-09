---
slug: "temps-reel-panneau"
title: "Temps réel du panneau, et délivrance scopée à l'accès"
issues: [117]
created: 2026-09-08
status: "In Progress"
---

# Temps réel du panneau, et délivrance scopée à l'accès

## Contexte

**Le besoin.** Ajouter une tâche dans un onglet doit mettre à jour les autres
onglets *et* le panneau d'extension. Et quand une matrice change, le serveur doit
pousser vers tous les clients connectés qui ont accès à cette matrice — pas
seulement vers son propriétaire.

**Ce qui existe déjà.** L'infrastructure de push est en place :

- `apps/supabase/migrations/20260829140000_realtime.sql:8-10,27-29` publie
  `tasks`, `boards`, `universes` dans `supabase_realtime` avec
  `replica identity full` ; `task_attachments` s'ajoute dans sa propre migration
  (`20260829180000_task_attachments.sql:44-45`). Rien, dans aucune migration, ne
  retire une table ni ne rétablit une `replica identity` par défaut.
- Le chemin est Postgres WAL → service Supabase Realtime → RLS évaluée **par
  abonné, pour chaque événement** → WebSocket. Pas de Redis, et aucun besoin
  d'en ajouter.
- `apps/web/src/data/useRealtime.ts` consomme tout ça côté web. **Le point 1 du
  besoin est donc déjà satisfait sur le web** : deux onglets se synchronisent
  aujourd'hui.

**Pourquoi l'extension avait été écartée, et pourquoi ce motif est tombé.** #39
excluait explicitement l'extension, et pour une bonne raison : « son popup charge
à chaque ouverture et vit quelques secondes ». Un abonnement WebSocket n'a
aucun sens dans une fenêtre qui vit trois secondes.

**#101 a supprimé ce motif** en passant l'extension en panneau latéral : le
panneau ne se ferme plus, il reste ouvert des heures. L'argument qui justifiait
l'exclusion justifie maintenant l'inverse.

**Ce qui manque, et c'est tout.**

| Manque | Nature |
|---|---|
| L'extension n'ouvre **aucun** canal | Code client — `useRealtime` n'existe que côté web |
| Le filtre serveur est `user_id=eq.<moi>` | Encode la propriété dans le client ; ne portera rien vers un invité |

**Ce que la 1.5.0 vient de livrer, et qui n'est pas ça.** Le panneau relit
maintenant en silence aux changements de vue et au retour de visibilité, et peint
son dernier état connu depuis `chrome.storage.local` (#116). C'est un rattrapage
*au moment où l'on regarde* — pas une synchronisation. Un panneau resté ouvert sur
une matrice ne voit toujours rien de ce qui change ailleurs.

**Séquencement.** #53 (partager une matrice) déclare #39 (temps réel) comme
**prérequis dur**, et se réserve la réécriture des policies RLS comme son point
critique. Aujourd'hui il existe **quatre** policies en tout, une par table, toutes
`for all` et toutes littéralement `user_id = auth.uid()`, sans un seul join ni
sous-requête ; et **aucune table d'appartenance n'existe** (vérifié : ni
`board_members`, ni invitation, ni rôle, nulle part). « Les clients qui ont accès
à cette matrice » se réduit donc, pour l'instant, à son propriétaire. Le volet
« accès » de ce plan est de la **préparation vérifiable**, pas une fonctionnalité
observable de bout en bout — choix assumé, pour que #53 n'ait pas à retoucher le
client.

## ⚠️ Étape 0 — établir que le push répond en production

**À faire avant d'écrire une ligne**, et la story #39 en donne la raison mieux
que moi. Sa synthèse
(`work/stories/light/2026-08-29-temps-reel/synthesis.md`) raconte que la
publication `supabase_realtime` était **vide** : un client s'abonnait, recevait
`SUBSCRIBED`, et **rien d'autre** — aucune erreur, aucun symptôme. Elle conclut :
« l'avoir cherché *avant* d'écrire le client a économisé une journée de débogage
d'un code parfaitement correct », et « la migration doit atteindre la production
**avant** le front — sans elle, l'abonnement reste muet ».

Ce qui est déjà acquis : le **service** Realtime tournait bien en août, #39
l'ayant vérifié (il ne faisait pas partie des sept retirés lors du dégraissage).

Ce qui reste à établir, et n'est écrit nulle part :

1. `20260829140000_realtime.sql` est-elle **appliquée en production** ? Le
   contexte du 7 septembre relevait deux migrations en attente et un déploiement
   en échec depuis le 4 — cette migration date d'août et devrait être passée, mais
   « devrait » n'est pas « est ».
2. Le **WebSocket** est-il joignable depuis un client, à l'origine de production ?
3. Rien de tout ça n'est dans `work/coolify-deploy.md`, qui ne contient **zéro**
   occurrence de « realtime » alors que l'instance est une Supabase auto-hébergée
   « dégraissée à PostgREST + GoTrue » (`apps/supabase/README.md:47-52`). À
   documenter, quel que soit le résultat.

Si le service n'est pas joignable, ce plan s'arrête ici et devient une tâche
d'infrastructure.

### ✅ Résultat — étape 0 faite le 2026-09-08, entièrement en lecture seule

| Vérification | Résultat |
|---|---|
| Service Realtime joignable | ✅ `SUBSCRIBED` sur `api.penduline.polemil.dev` |
| Migration `realtime` appliquée en prod | ✅ prouvé transitivement |
| La sonde discrimine | ✅ témoin négatif → `HTTP 400 / 42703` |

**La preuve transitive**, faute de pouvoir interroger `pg_publication_tables` par
PostgREST : la migration realtime n'ajoute **aucune colonne**, donc la technique
de sondage du 7 septembre ne s'y applique pas directement. Mais
`tasks.parent_id` (`20260829160000_subtasks.sql`) et la table `task_attachments`
(`20260829180000_task_attachments.sql`) répondent tous deux `HTTP 200` en
production — et ces deux migrations sont **postérieures** à
`20260829140000_realtime.sql`, appliquée dans l'ordre par
`apps/supabase/deploy/penduline-migrate.sh`. Donc la publication est peuplée et
`replica identity full` est en place.

Le témoin négatif (une colonne inventée → `42703`) établit que la sonde discrimine
vraiment, au lieu de répondre `200` à tout.

⚠️ Aucune écriture en production : la preuve de bout en bout (écrire et attendre
l'événement) aurait exigé des identifiants de compte réel, que la clé `anon` ne
donne pas. La chaîne transitive s'y substitue sans rien toucher.

## Ce qu'on construit

### 1. La mécanique d'abonnement remonte dans `@penduline/shared`

`useRealtime.ts` contient trois choses de natures différentes : des fonctions
pures de fusion, le câblage du canal, et un `useEffect`. Seule la dernière est
liée à React.

Le paquet partagé possède déjà `createSupabase(config): SupabaseClient`
(`packages/shared/src/supabase.ts`) — recevoir un client en paramètre y est donc
un précédent établi. On crée `packages/shared/src/realtime.ts` :

- **les fonctions pures** `fusionner`, `retirer`, `identiques`, déplacées telles
  quelles depuis `useRealtime.ts:17-47`. Elles portent la neutralisation de
  l'écho **par comparaison et non par marquage** — la raison est documentée sur
  place et doit voyager avec le code ;
- **`subscribeRealtime(client, userId, sink): () => void`** : tout le câblage
  `.on('postgres_changes', …)` et la règle de rechargement à la reconnexion, en
  TypeScript simple, sans React. Rend sa fonction de désabonnement.

Le `sink` reste l'interface actuelle (`RealtimeSink`), avec les collections
**facultatives** : le panneau n'a ni pièces jointes ni corbeille, et
`setAttachments` absent doit simplement ne pas abonner cette table — pas de
drapeau `mode`, la même convention que `drag`/`split` sur `TaskCard`.

C'est exactement la duplication qui a coûté #61 sur les paires : la règle vit à
un seul endroit avant d'être appelée d'un second.

Chaque application ne garde qu'une enveloppe de dix lignes :

```
useEffect(() => subscribeRealtime(supabase, userId, sinkRef.current), [userId])
```

⚠️ Le `sink` doit continuer de passer par une **ref tenue à jour**, et non par
les dépendances de l'effet : il est reconstruit à chaque rendu du store, et le
capturer figerait `reload`/`admits` au premier. C'est déjà la raison du
`courant`/`useRef` actuel (`useRealtime.ts:62-64`), et l'erreur est facile à
réintroduire en déplaçant le code.

**Tests** : `packages/shared/src/realtime.test.ts` sur les fonctions pures —
identité préservée quand rien ne change (c'est ce qui évite le scintillement),
insertion, remplacement, retrait d'un absent. C'est la première fois que cette
mécanique devient testable ; elle ne l'était pas dans un hook.

### 2. La délivrance passe de la propriété à l'accès

Le filtre `user_id=eq.${userId}` est décrit dans le code comme doublant la RLS
(`useRealtime.ts:76-80`) : c'est une **optimisation de réveil, jamais la
frontière de sécurité** — la frontière est la RLS, évaluée par abonné pour chaque
événement.

Ce filtre pose deux problèmes :

1. il **bloquerait un invité** sous #53, silencieusement et sans erreur ;
2. `tasks.user_id` change de sens avec #53 (« propriétaire » → « auteur », dit
   explicitement dans le ticket). Un client qui filtre là-dessus devient faux
   sans que rien ne le signale.

**Décision : on retire le filtre, et la RLS reste seule juge de ce qui est
délivré.** Ce n'est pas un pari — c'est déjà le motif établi dans ce dépôt :

- les trois fonctions RPC exposées (`search_tasks`, `review_boards`,
  `completion_stats`) sont toutes `security invoker` et **n'ont aucun prédicat
  `user_id`** : elles reposent entièrement sur la RLS pour leur cadrage ;
- `work/architecture.md:16-19` et `apps/supabase/README.md:321-323` affirment que
  l'isolation repose **entièrement** sur les policies, « pas sur le code client ».

Un filtre `board_id=in.(<matrices accessibles>)` — la lecture littérale de
« filtre par matrice » — a par ailleurs trois défauts concrets :

- `task_attachments` **ne porte pas de `board_id`** (il n'atteint sa matrice que
  par `task_id → tasks.board_id`) : la table échapperait au motif, ou imposerait
  une colonne dénormalisée ;
- il faut **se réabonner à chaque changement du jeu de matrices** (création,
  suppression, partage), avec une fenêtre d'événements perdus à chaque
  réabonnement ;
- il redéplace dans le client une décision d'accès que #53 va justement sortir du
  client.

Comportement attendu **inchangé** pour un compte seul — c'est précisément ce que
la vérification doit établir.

⚠️ **Contrepartie, à documenter dans le code.** Sans filtre, le serveur Realtime
évalue la RLS pour chaque abonné à chaque changement, au lieu d'écarter d'abord
les abonnés dont le filtre ne correspond pas. À l'échelle actuelle (auto-hébergé,
poignée de comptes, `config.toml` sans aucun plafond Realtime) c'est négligeable.
Le levier `board_id=in.(…)` reste disponible si le volume devenait un sujet : la
décision et son motif partent dans un commentaire, pas dans un ticket qu'on ne
relira pas.

### 3. Le panneau s'abonne

Dans `apps/extension/src/store.ts`, à côté du chargement existant :

- brancher `subscribeRealtime` sur `tasks`, `boards`, `universes` — **pas**
  `task_attachments`, que le store du panneau ne porte pas ;
- `admits` : la même règle qu'au chargement du panneau, qui ne lit que
  `done = false`, `deleted = false`, `parent_id is null`. ⚠️ Elle diverge de
  `inWorkingSet` du web (`apps/web/src/data/store.ts:32-35`), qui garde les
  étapes cochées. Ne pas réutiliser l'une pour l'autre — le panneau
  réintroduirait par la fenêtre ce que son `select` sort par la porte ;
- `reload` : le `refresh()` livré avec #116, déjà silencieux et déjà protégé
  contre l'écrasement d'une écriture locale non acquittée. Rien à écrire de neuf.

⚠️ **Le service worker ne doit PAS ouvrir de canal.** MV3 le tue en permanence :
un abonnement y serait rompu en boucle, et le chunk `session-bridge` (221 Ko) est
déjà rechargé à chaque réveil. Ses écritures (capture par menu contextuel,
`background.ts:234-283`) arrivent au panneau **par le canal du panneau**, ce qui
est le but. À écrire en commentaire à l'endroit où quelqu'un serait tenté de
l'ajouter.

### 4. Articulation avec le rattrapage de #116

Les quatre mécaniques se répartissent proprement, et aucune ne remplace l'autre :

| Mécanique | Rôle |
|---|---|
| Cache `chrome.storage.local` | Première peinture, avant tout réseau |
| Canal temps réel | Mises à jour vivantes, panneau ouvert et connecté |
| `reload()` à la re-souscription | Rattrape le trou d'une coupure — les événements perdus ne se rejouent pas |
| Relecture au changement de vue | Repli quand le socket est **down** (hors ligne, WebSocket bloqué par un proxy) |

Un seul ajustement : la relecture au changement de vue devient redondante tant
que le canal est `SUBSCRIBED`. On la **conditionne** à l'état du canal plutôt que
de la supprimer — supprimée, un panneau derrière un proxy qui bloque les
WebSockets n'aurait plus aucun rattrapage.

### 5. Deux documents périmés à corriger au passage

Constaté pendant l'exploration, et directement dans le sujet :

- `work/architecture.md:83` dit encore « Temps réel Supabase : non branché, à
  ajouter » — livré depuis `20260829140000_realtime.sql`. La ligne 89 mentionne
  aussi l'épinglage, retiré par #110 ;
- `work/coolify-deploy.md` ne mentionne pas le service Realtime (voir étape 0).

## Fichiers

| Fichier | Nature |
|---|---|
| `packages/shared/src/realtime.ts` | **Nouveau** — fusion pure + `subscribeRealtime` |
| `packages/shared/src/realtime.test.ts` | **Nouveau** — tests des fonctions pures |
| `packages/shared/src/index.ts` | Export du nouveau module |
| `apps/web/src/data/useRealtime.ts` | Réduit à l'enveloppe React ; `sink` inchangé côté appelant |
| `apps/extension/src/store.ts` | Abonnement + `admits` propre au panneau |
| `apps/extension/src/App.tsx` | Relecture au changement de vue conditionnée à l'état du canal |
| `work/architecture.md`, `work/coolify-deploy.md` | Corrections ci-dessus |

**Aucune migration.** La publication et `replica identity full` sont déjà en
place, et le retrait du filtre est purement côté client.

## Vérification

**Non-régression web — le point le plus important.** Le web synchronise déjà ; ce
plan y touche par extraction et par retrait du filtre. Deux onglets, même compte :
créer, cocher, renommer, déplacer une tâche, ajouter un lien, créer/supprimer une
matrice, renommer un univers. Chaque geste doit apparaître dans l'autre onglet,
comme avant.

**Non-délivrance croisée.** Deux comptes distincts, deux navigateurs. Écrire dans
l'un ne doit produire **aucun** événement dans l'autre. C'est ce qui établit que
la RLS suffit sans le filtre — à faire explicitement, pas à déduire.

**Panneau.** Panneau ouvert sur une matrice + app web dans un onglet : cocher une
tâche sur le web la fait disparaître du panneau sans le toucher. Capturer par le
menu contextuel fait apparaître la tâche dans le panneau déjà ouvert.

**Coupure.** Panneau ouvert, couper le réseau, modifier depuis un autre appareil,
rétablir : le `reload()` de re-souscription doit rattraper. Puis, réseau coupé,
changer de vue : la relecture de repli doit s'exécuter.

**Écriture concurrente.** Cocher une tâche dans le panneau au moment où un
événement distant arrive sur la même tâche : la carte ne doit pas reculer.

**Portes qualité** : `npm run typecheck --workspaces`, `npm test --workspaces`
(248 tests aujourd'hui, + ceux de `realtime.test.ts`), `npm run build`.

## Hors périmètre — et ce que #53 devra savoir

- La réécriture RLS et la table d'appartenance : c'est #53, qui les revendique.
- L'édition concurrente entre deux personnes (#53 aussi, et explicitement à
  traiter *après* le temps réel).
- Un canal dans le service worker : écarté, motif ci-dessus.
- Le filtre `board_id=in.(…)` : décision de ne pas le payer, documentée en
  commentaire.

Trois constats de l'exploration à **reporter dans #53**, parce qu'ils y coûteront
cher si personne ne les a vus :

1. `review_boards()` et `completion_stats()` n'ont **aucun prédicat `user_id`** et
   reposent entièrement sur la RLS. Élargir la policy de lecture de `tasks` les
   fait silencieusement renvoyer les faits des matrices d'autrui.
2. Chaque table n'a **qu'une** policy `for all`, même expression en `using` et
   `with check`. Dissocier lecture et écriture (lire si membre, écrire si
   propriétaire) suppose de **remplacer** la policy, pas d'en ajouter une : une
   policy `for select` additive serait OR'ée, mais la `for all` continuerait de
   gouverner UPDATE et DELETE.
3. `config.toml:61,76` : `jwt_expiry = 3600` et
   `enable_refresh_token_rotation = false`. Un partage révoqué reste donc vivant
   jusqu'à une heure, le temps de vie du jeton — y compris pour l'évaluation RLS
   de Realtime.
