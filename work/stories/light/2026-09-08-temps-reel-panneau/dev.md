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
| T1 — `packages/shared/src/realtime.ts` : fonctions pures de fusion déplacées depuis `useRealtime.ts` | Terminé | 2026-09-08 |
| T2 — `packages/shared/src/realtime.test.ts` : tests des fonctions pures (identité préservée, insertion, remplacement, retrait d'un absent) | Terminé | 2026-09-08 |
| T3 — `subscribeRealtime(client, userId, sink)` : câblage du canal sans React, collections du sink facultatives, retrait du filtre serveur | Terminé | 2026-09-08 |
| T4 — Export depuis `packages/shared/src/index.ts` | Terminé | 2026-09-08 |
| T5 — `apps/web/src/data/useRealtime.ts` réduit à l'enveloppe React, sink inchangé côté appelant | Terminé | 2026-09-08 |
| T6 — Non-régression du chemin de délivrance, prouvée automatiquement | Terminé | 2026-09-08 |
| T7 — `apps/extension/src/store.ts` : abonnement, `admits` propre au panneau, `reload` = `refresh()` de #116 | Terminé | 2026-09-08 |
| T8 — `apps/extension/src/App.tsx` : relecture au changement de vue conditionnée à l'état du canal | Terminé | 2026-09-08 |
| T9 — Commentaire anti-régression : pas de canal dans le service worker MV3 | Terminé | 2026-09-08 |
| T10 — `work/coolify-deploy.md` : documenter le service Realtime (aujourd'hui muet) | Terminé | 2026-09-08 |
| T11 — `work/architecture.md` : corriger les lignes périmées (temps réel « non branché », épinglage) | Terminé | 2026-09-08 |
| T12 — Portes qualité : typecheck, tests, build | Terminé | 2026-09-08 |
| T15 — `realtime.live.test.ts` : vérification de bout en bout contre un Supabase réel | Terminé | 2026-09-08 |
| T13 — Validation manuelle navigateur (deux onglets web + panneau réel) | En attente | |
| T14 — Reporter dans #53 les six constats d'héritage | Terminé | 2026-09-08 |

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

### 2026-09-08 : T1–T4 — le module partagé

**Statut** : Terminé

**Actions réalisées** :

- `packages/shared/src/realtime.ts` *(nouveau)* : `identiques`, `fusionner`,
  `retirer` déplacées telles quelles depuis `useRealtime.ts`, plus
  `subscribeRealtime(client, userId, getSink, options)` — tout le câblage
  `postgres_changes` et la règle de rechargement à la reconnexion, sans React ;
- `packages/shared/src/realtime.test.ts` *(nouveau)* : 12 tests ;
- export depuis `packages/shared/src/index.ts`.

**Fichiers modifiés** : `packages/shared/src/realtime.ts`,
`packages/shared/src/realtime.test.ts`, `packages/shared/src/index.ts`.

**Notes** :

- **`getSink` est un GETTER, pas un objet — et c'est une amélioration sur #39,
  pas une transcription.** Le sink est reconstruit à chaque rendu de l'hôte ; le
  capturer une fois figerait `reload` et `admits` au premier. #39 évitait le piège
  par une ref *à l'intérieur* du hook, donc par discipline. Le prendre en
  paramètre le rend **inatteignable** : `subscribeRealtime` relit le sink à chaque
  événement et ne peut structurellement pas en tenir un périmé.
- **`setAttachments` facultatif vaut configuration.** Absent, la table n'est pas
  abonnée du tout. Pas de drapeau `mode` — même convention que les props
  facultatives de `TaskCard`. C'est ainsi que le panneau s'en passe.
- **`onLive` rend un booléen, pas le statut brut** de supabase-js. L'appelant n'a
  pas à connaître ce vocabulaire pour savoir s'il doit encore relire lui-même, et
  ça évite de faire fuiter un type de la bibliothèque dans les deux hôtes.
- **Ce que les tests protègent vraiment : l'identité de référence.** Rendre la
  MÊME référence quand rien ne change est ce qui empêche React de re-rendre, donc
  ce qui garde texte et focus dans un champ pendant qu'une écriture distante
  arrive. C'était la conclusion la plus fine de #39 et elle n'était pas testable —
  la mécanique vivait dans un hook. Une régression y serait invisible en test
  classique et se verrait en production par un champ qui se vide sous les doigts.
- 🐛 Une apostrophe droite non échappée dans un libellé de test (`d'une`) a fait
  échouer la collecte du fichier entier : 221 tests passaient, mais un fichier
  était compté en échec. Corrigée en apostrophe typographique.

### 2026-09-08 : T5 — le hook web réduit à son enveloppe

**Statut** : Terminé

**Actions réalisées** : `apps/web/src/data/useRealtime.ts` passe de **150 à 34
lignes**. Il ne garde que la ref et le `useEffect`. La signature
`useRealtime(userId, sink)` est **inchangée** : `store.ts` n'a pas été touché, et
le type `RealtimeSink` est re-exporté pour que rien d'autre ne bouge.

**Fichiers modifiés** : `apps/web/src/data/useRealtime.ts`.

**Notes** : le seul changement de comportement côté web est le **retrait du
filtre serveur** — d'où T6 avant T7 dans le plan. Le web est le consommateur
existant : s'il régresse, il faut le savoir avant d'en brancher un second.

### 2026-09-08 : T7–T9 — le panneau s'abonne

**Statut** : Terminé

**Actions réalisées** :

- `apps/extension/src/store.ts` : `admisAuPanneau` au niveau module, sink par ref,
  `subscribeRealtime` dans un `useEffect [userId]`, et `live` ajouté au contrat
  `ExtStore` ;
- `apps/extension/src/App.tsx` : les deux relectures de repli (changement de vue,
  retour de visibilité) sont **conditionnées** à `store.live` ;
- `apps/extension/src/background.ts` : garde-fou en tête de fichier — ne pas
  abonner le service worker.

**Fichiers modifiés** : `apps/extension/src/store.ts`,
`apps/extension/src/App.tsx`, `apps/extension/src/background.ts`.

**Notes** :

- **`admisAuPanneau` diverge de `inWorkingSet` du web, à dessein.** Le web garde
  les étapes cochées ; le panneau n'affiche pas d'étapes. Réutiliser la règle du
  web ferait rentrer par le canal ce que le `select` du panneau sort par la porte.
  `archived` n'y figure pas non plus — le `select` ne le filtre pas et c'est le
  rendu (`listFor`) qui l'écarte ; ajouter ici un critère absent du chargement
  ferait diverger les deux chemins, ce que cette fonction existe pour éviter.
- **`reload` = le `refresh()` de #116, sans une ligne de neuf.** Il porte déjà le
  garde-fou `gen`/`enVol` contre l'écrasement d'une écriture locale non
  acquittée. Bon signe : la frontière de #116 avait été tracée au bon endroit,
  elle sert un second appelant sans être touchée.
- ⚠️ **Le piège que j'ai failli poser dans T8** : l'écouteur `visibilitychange`
  est posé une fois, donc une fermeture sur `store.live` l'aurait figé sur
  `false` — la valeur au montage, la souscription n'ayant pas encore abouti. Le
  repli se serait exécuté pour toujours, canal ou pas. Passé par `liveRef`.
- **Conditionner et non supprimer.** Un socket peut ne jamais s'établir (hors
  ligne, proxy qui bloque les WebSockets). Sans repli, ce panneau n'aurait plus
  aucun rattrapage — et c'est précisément le mode de défaillance que le canal ne
  peut pas signaler lui-même.
- 🧹 L'objet du sink était écrit deux fois (init de la ref + affectation par
  rendu). Ramené au motif du hook web : un `const courant`, puis affectation.

### 2026-09-08 : T10–T11 — les deux documents périmés

**Statut** : Terminé

**Actions réalisées** :

- `work/coolify-deploy.md` : nouvelle section « Realtime : le huitième service,
  celui qu'on a GARDÉ ». Le doc ne contenait **zéro** occurrence de « realtime »
  alors que ce service porte toute la synchronisation. Y figurent la vérification
  du 8 septembre, le piège du `SUBSCRIBED` trompeur, la recette de sonde
  transitive avec témoin négatif, et ce qu'on casse si on le retire un jour du
  compose pour récupérer de la RAM ;
- `work/architecture.md` : la ligne « Temps réel Supabase : non branché, à
  ajouter » est barrée et corrigée.

**Fichiers modifiés** : `work/coolify-deploy.md`, `work/architecture.md`.

**Notes** :

- **Corroboration inattendue de T0.** `work/coolify-deploy.md` documentait déjà
  la sonde PostgREST `200`/`400`, et concluait que la base était à jour **sauf les
  deux migrations du 6 septembre**. La migration realtime datant du 29 août, elle
  est donc appliquée — établi une seconde fois, par un chemin indépendant du mien.
- ⚖️ **La section « État » d'`architecture.md` n'a PAS été réécrite.** Elle est
  un instantané du 24 juillet : elle parle de « pièces » et de `rooms`, liste
  comme non couverts le temps réel, l'édition de titre et l'extension, et
  mentionne l'épinglage retiré depuis. Un avertissement daté a été ajouté en
  tête plutôt qu'une réécriture : ce document porte des **décisions datées**, et
  réviser un instantané au fil de l'eau lui ferait perdre ce qui en fait la
  valeur. Le pointeur va vers `README.md` et `work/stories/`.

### 2026-09-08 : T12 — portes qualité

**Statut** : Terminé

- `npm run typecheck --workspaces` : ✅ shared, extension, web
- `npm test --workspaces` : ✅ **260 tests** (233 shared dont 12 nouveaux, 27 web)
- `npm run build` : ✅ shared, web, extension

**Notes** : le bundle du panneau passe de 169,8 Ko à 171,5 Ko (+1,7 Ko) — le
câblage du canal, la bibliothèque Realtime étant déjà embarquée avec
supabase-js.

### 2026-09-08 : T14 — l'héritage déposé dans #53

**Statut** : Terminé

**Actions réalisées** : commentaire sur l'issue #53 avec **six** constats (le plan
en annonçait trois ; l'exploration architecturale en a ajouté trois).

**Notes** : le constat qui compte le plus n'est pas technique. Le client ne porte
plus **aucune** décision d'accès — excellente nouvelle pour #53, qui n'aura rien à
retoucher côté client, mais la RLS devient de ce fait le **point de défaillance
unique**. Il n'y a plus de filtre client pour masquer une policy trop large : le
critère « audit RLS vérifié par des tests dédiés » de #53 passe de recommandé à
seul garde-fou restant. C'est dit explicitement là-bas.

Les deux constats d'infrastructure valaient aussi le déplacement : `jwt_expiry`
sans rotation fait traîner la révocation d'un partage jusqu'à une heure — **y
compris sur le socket temps réel**, qui porte le jeton avec lequel il a été
ouvert. Le critère « révoquer un accès » de #53 doit trancher ce qu'on en fait.

### 2026-09-08 : T6 + T15 — la vérification de bout en bout, sans navigateur

**Statut** : Terminé

**Le problème à résoudre.** Le plan faisait de la non-régression web « le point le
plus important », et je ne pouvais pas piloter un navigateur : le MCP
chrome-devtools refuse de démarrer, une instance Chrome occupant déjà le profil
(`/Users/polemil/.cache/chrome-devtools-mcp/chrome-profile`). Tuer la session du
navigateur de l'utilisateur n'était pas une option.

**Ce qui a été fait à la place** — et c'est mieux que ce que le plan prévoyait :
un test d'intégration réel, `packages/shared/src/realtime.live.test.ts`, qui
exerce `subscribeRealtime` contre un vrai Supabase avec **deux clients
authentifiés distincts** — on veut voir arriver l'écriture d'autrui, pas l'écho
de la sienne.

Quatre assertions, chacune sur un mode de défaillance silencieux :

| Test | Ce qu'il attrape |
|---|---|
| INSERT distant délivré **sans filtre serveur** | la seule preuve automatisée que le retrait du filtre délivre |
| UPDATE distant délivré | le cheminement WAL → RLS → socket |
| `admits` refuse une tâche cochée | le temps réel ne réintroduit pas ce que #40 a sorti |
| DELETE distant délivré | `replica identity full` — sans elle l'événement n'est même pas émis |

**Désactivé par défaut** (`describe.skipIf`), activé par `PENDULINE_LIVE=1` :
aucune CI ici n'a de serveur. Résultat des deux modes :

- `npm test -w @penduline/shared` → **233 passés, 4 ignorés**
- `PENDULINE_LIVE=1 … ` → **237 passés**

**Fichiers modifiés** : `packages/shared/src/realtime.live.test.ts` *(nouveau)*.

**Notes** :

- 🐛 **Première version fausse, et instructive.** Elle patientait 2,5 s en dur
  avant d'écrire. L'INSERT échouait — mais l'UPDATE et le DELETE passaient. Le
  diagnostic n'est pas un bug produit : **Realtime ne rejoue pas les
  événements**, donc l'écriture partie avant que la souscription n'aboutisse
  était perdue. Corrigé en attendant le vrai `onLive` — ce qui exerce au passage
  ce rappel, et fait tomber la durée de 12 s à 3,7 s. La leçon vaut pour toute
  vérification manuelle : **ouvrir le panneau, puis écrire** — pas l'inverse.
- ⚖️ **Pourquoi ce test reste dans le dépôt** alors que le reste de
  `packages/shared` est purement unitaire. Le mode de défaillance du temps réel
  est le SILENCE : publication vide, `replica identity` par défaut, ou filtre trop
  étroit — dans les trois cas l'abonnement atteint `SUBSCRIBED` et ne reçoit rien,
  sans erreur ni log. Aucun test unitaire ne peut l'attraper, il faut un vrai WAL.
  Une paragraphe de journal aurait pourri ; une commande qui se relance tient.
- ⚠️ **Piège d'environnement consigné dans le fichier** : un autre projet
  Supabase occupait 54321, et `supabase status` annonce le port **configuré**, pas
  celui réellement publié par Docker. La vérité est dans
  `docker ps` sur `supabase_kong_penduline` — ici 55321. D'où
  `PENDULINE_LIVE_URL`.
- **Ce que ça ne couvre PAS**, et qui reste en T13 : le câblage React de chaque
  hôte (les deux `useEffect`), et le comportement du panneau dans un vrai
  navigateur. Le fond est prouvé, l'intégration visuelle non.
- Le serveur de dev lancé pour l'occasion visait bien le Supabase **local** —
  vérifié dans le module transformé avant d'ouvrir quoi que ce soit, pour ne
  prendre aucun risque d'écrire en production. `.env` n'a pas été modifié : les
  variables ont été passées en ligne.

### 2026-09-08 : PR #118 ouverte, CI verte

**Statut** : Terminé

- PR **#118**, base `chore/extension-1.5.0-et-garde-fou-pinned` — ⛓️ **empilée sur
  #115** et pas par commodité : le `reload` de reconnexion réutilise le
  `refresh()` livré là-bas. `MERGEABLE`.
- CI : `check` **pass** (30 s), `image` `skipping`. Idem sur #115 après les
  commits de la 1.5.0.

**🐛 Un commit poussé cassé, et c'est une erreur de méthode.** `3b66135` ne
compilait pas : `process.env` dans le test live, alors que `@penduline/shared` n'a
pas `@types/node` — et `npm run build` commençant par le build de shared, toute la
chaîne tombait derrière. Après avoir ajouté le test, j'avais relancé `npm test`
mais **pas le typecheck**. Corrigé par `b537bf5` (lecture par `globalThis`, pas de
dépendance nouvelle).

Ce qui l'a laissé passer est instructif : ma commande de contrôle comptait des
lignes (`grep -c`) au lieu de lire la sortie. Le décompte disait « 2 » et
« 0 builds » — l'information était là, mais mise en forme pour ne pas être lue.
**Lire la sortie, ne pas la compter.**

**Il reste T13**, la validation navigateur, que je ne peux pas exécuter (MCP
chrome-devtools bloqué par une instance Chrome occupant son profil ; tuer la
session de l'utilisateur n'était pas une option). La synthèse n'est
volontairement PAS écrite avant ce retour : elle affirmerait une validation qui
n'a pas eu lieu.
