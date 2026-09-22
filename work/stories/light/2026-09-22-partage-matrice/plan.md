---
story: "Partager une matrice avec quelqu'un"
story_code: "partage-matrice"
created: 2026-09-22
status: "In Progress"
---

# Partager une matrice avec quelqu'un (#53)

## Contexte

Une matrice « Maison » partagée avec son conjoint, une matrice projet avec un collègue.
Tout le modèle de sécurité repose aujourd'hui sur une hypothèse unique : **une ligne
appartient à un utilisateur**, et chaque table n'a qu'**une** policy `for all`
(`user_id = auth.uid()`). Le partage casse cette hypothèse à la racine.

Le prérequis dur (#39, temps réel) est livré, et #117 a poussé l'analyse plus loin —
mais il ne simplifie pas ce ticket, il le complique : depuis la mesure du 2026-09-08
(`packages/shared/src/realtime.ts:96`), **le filtre serveur est la seule barrière des
événements `DELETE`** — la RLS n'y est pas appliquée. On ne peut donc pas se contenter
d'élargir les policies : le filtre doit devenir *conforme à l'accès*.

Résultat visé : inviter quelqu'un par un lien, lui donner la lecture ou l'écriture, voir
qui a créé et qui a coché, révoquer, quitter — sans qu'aucun compte ne voie jamais une
matrice qui ne lui a pas été ouverte.

### Décisions prises en amont

| Question | Décision |
|---|---|
| Atteindre une adresse sans compte | **Lien d'invitation à jeton**, partagé par l'inviteur lui-même. Aucune infra e-mail nouvelle. |
| Révocation sur un socket ouvert | **Canal de diffusion dédié** : le retrait pousse un ordre de réabonnement + rechargement. |
| Édition simultanée | **Dernier écrit gagne, mais visible.** Le temps réel supprime l'écrasement *silencieux*, qui est la perte que le ticket redoute. |
| Rangement chez l'invité | **Rangeable dans SES univers** → `universe_id` et `position` quittent `boards` pour une table de placement par personne. |

---

## Vue d'ensemble

```
boards (user_id = PROPRIÉTAIRE)          universes (user_id, privés, inchangés)
   │                                          ▲
   ├─ board_members (board_id, user_id, rôle) │
   ├─ board_invitations (jeton haché, rôle)   │
   └─ board_placements (board_id, user_id, universe_id, position)  ── par personne
          ▲
tasks (author_id, completed_by) ── board_id ──┘
task_attachments (author_id, board_id dénormalisé)
```

Deux fonctions `security definer` portent toute la décision d'accès :
`peut_lire(board uuid)` et `peut_ecrire(board uuid)`. `definer` n'est pas un confort :
une policy sur `boards` qui interrogerait `board_members`, dont la policy interroge
`boards`, **récurse à l'infini**. C'est le piège classique de ce schéma, et la seule
sortie propre.

---

## Actions

### 0. Spike temps réel (aucun code livré)

Contre le Supabase local, vérifier trois choses avant d'écrire quoi que ce soit :

1. `realtime.send()` est-il appelable depuis un trigger sur cette version du service ?
   (c'est le mécanisme du canal de révocation)
2. Un filtre `board_id=in.(a,b,c)` tranche-t-il bien un `DELETE`, comme `user_id=eq.`
   le fait aujourd'hui ?
3. La longueur d'URL tenable pour un `in.(…)` — un compte à 200 matrices.

**Repli documenté si (1) échoue** : la diffusion part du client de l'inviteur au moment
de la révocation, sur le topic de la personne retirée. Moins sûr (un client peut se
taire), mais suffisant pour un signal qui n'est pas une frontière de sécurité.

### 1. Migration A — appartenance et réécriture RLS

`apps/supabase/migrations/<ts>_partage_appartenance.sql`

- `board_members (board_id, user_id, role, invited_by, created_at)`, PK `(board_id, user_id)`,
  `role` enum `'lecture' | 'ecriture'`. Le propriétaire **n'y figure pas** : `boards.user_id`
  reste l'autorité, et une seule ligne ne peut pas être supprimée par erreur.
- `peut_lire(uuid)` / `peut_ecrire(uuid)` — `security definer`, `stable`, `set search_path = public`.
- `task_attachments.board_id` dénormalisé `not null`, rempli par trigger depuis `tasks`.
  Sans lui, la policy imposerait une sous-requête **par abonné et par événement**, et le
  filtre temps réel n'aurait rien à mordre.
- **Remplacer** (et non compléter) les policies `for all` :

| Table | select | insert | update / delete |
|---|---|---|---|
| `boards` | `peut_lire(id)` | `user_id = auth.uid()` | `user_id = auth.uid()` (propriétaire seul) |
| `tasks` | `peut_lire(board_id)` | `peut_ecrire(board_id) and author_id = auth.uid()` | `peut_ecrire(board_id)` |
| `task_attachments` | `peut_lire(board_id)` | `peut_ecrire(board_id)` | `peut_ecrire(board_id)` |
| `board_members` | membre de la matrice | propriétaire | propriétaire, **ou soi-même** (quitter) |
| `universes` | inchangé (`user_id = auth.uid()`) | | |

Une `for select` *additive* ne suffirait pas : elle serait OR'ée en lecture, mais la
`for all` continuerait de gouverner UPDATE et DELETE.

### 2. Migration B — rangement par personne

`board_placements (board_id, user_id, universe_id, position)`, PK `(board_id, user_id)`.

- Backfill depuis `boards.universe_id` / `boards.position` pour le propriétaire.
- `drop column boards.universe_id, boards.position` — sinon deux sources de vérité.
- Trigger : une ligne de placement naît avec la matrice (propriétaire) et avec
  l'adhésion (invité), `universe_id = null`, `position` en fin de liste.
- Policy : `user_id = auth.uid()` pour tout, `with check (peut_lire(board_id))`.

Le filtre temps réel de cette table reste `user_id=eq.<moi>` — elle est par construction
mono-utilisateur.

### 3. Migration C — attribution

- Renommer `tasks.user_id → tasks.author_id` et `task_attachments.user_id → author_id`.
  Le renommage n'est pas cosmétique : la colonne **change de sens** (propriétaire → auteur)
  et les policies ne s'appuient plus dessus. Renommer fait échouer à la compilation les
  ~10 sites d'écriture dont la signification a bougé, au lieu de compter sur une relecture.
  `boards.user_id` et `universes.user_id` gardent leur nom **et** leur sens.
- `tasks.completed_by uuid` — posé par `tasks_completed_at()` (étendre le trigger existant,
  `20260922100000_completed_at.sql`) en même temps que `completed_at`, et remis à `null`
  au décochage, exactement comme lui.
- **`completion_stats(since, tz)` : ajouter `and t.completed_by = auth.uid()`.** Sans ça,
  l'élargissement de la policy `tasks` fait compter à l'utilisateur les complétions des
  autres — silencieusement. C'est la raison d'être de `completed_by`.
- `review_boards()` et `search_tasks(q)` : élargissement **voulu** (ils doivent couvrir les
  matrices partagées). Revus et commentés comme tels, pas laissés au hasard.

### 4. Migration D — invitations

`board_invitations (id, board_id, email, role, token_hash, invited_by, created_at, expires_at, accepted_at, accepted_by)`.

- Le jeton clair ne vit que dans le lien ; la base n'en garde que le hachage.
- `email` est un **libellé**, pas une autorité : le jeton seul fait foi. C'est ce qui rend
  le même chemin valable pour un compte existant et pour une adresse inconnue.
- `accepter_invitation(jeton text)` — `security definer` : l'invité n'a aucun droit de
  lecture sur la ligne d'invitation, il ne peut que la présenter.
- `lire_invitation(jeton text)` — `security definer`, rend le **strict nécessaire** à
  l'écran d'acceptation : nom de la matrice, qui invite, rôle proposé, expiration.
  Ajoutée après la revue UX, et pour la raison qui gouverne déjà `AuthorizeScreen` :
  **ce qui s'affiche doit venir du serveur, jamais de l'URL**. Un lien forgé afficherait
  sinon un nom de matrice rassurant au-dessus du partage de quelqu'un d'autre.
- Policies : propriétaire seul en select / insert / delete.

### 5. Migration E — canal de révocation

Trigger sur `board_members` (et `board_placements`) : `realtime.send()` vers le topic
`penduline:user:<user_id>`, avec la raison (`acces_accorde` | `acces_retire`).

⚠️ **Et une policy sur `realtime.messages`**, sans quoi rien n'arrive. Le spike l'a
mesuré : la RLS y est activée avec **zéro policy** — un canal privé se connecte et reste
muet, sans erreur. La policy borne chacun à son propre canal :
`for select to authenticated using (realtime.topic() = 'penduline:user:' || auth.uid())`.
Canal **privé**, pas public : un topic public serait écoutable par qui connaît l'UUID.

C'est ce qui ferme les deux trous que le filtre `in.(…)` ouvre : un invité tout juste
ajouté ne verrait rien arriver (son filtre ne couvre pas la nouvelle matrice), et un
révoqué continuerait de recevoir les `{id}` de suppressions jusqu'à son prochain
réabonnement.

### 6. Suite de tests RLS à deux comptes — **avant le client**

`packages/shared/src/partage.live.test.ts`, sur le modèle de `realtime.live.test.ts`.

Depuis #117, la non-délivrance croisée est la **seule** preuve qu'il existe un
cloisonnement : il n'y a plus de filtre client pour masquer une policy trop large.
Cette suite est le livrable de sécurité du ticket, pas une vérification de fin.

Deux comptes réels, et au minimum :

- B ne lit ni n'écrit une matrice de A non partagée (boards, tasks, attachments, placements)
- B en `lecture` lit, et **échoue** à écrire
- B en `ecriture` écrit ; il ne peut ni renommer ni supprimer la matrice
- `search_tasks`, `review_boards`, `completion_stats` : aucune fuite, et `completion_stats`
  ne compte que ce que l'appelant a coché
- Temps réel : B reçoit les INSERT/UPDATE/**DELETE** de la matrice partagée, et **rien**
  d'une matrice tierce
- Après révocation : B ne lit plus rien, et son canal reçoit l'ordre de réabonnement
- `accepter_invitation` : jeton valide → adhésion ; jeton expiré, déjà consommé, ou
  inventé → refus
- `lire_invitation` : ne rend rien sur un jeton inventé, et jamais autre chose que le nom
  de la matrice, l'inviteur, le rôle et l'expiration

### 7. Temps réel conforme à l'accès

`packages/shared/src/realtime.ts`

- `subscribeRealtime(client, userId, getSink, options)` prend désormais **le jeu de
  matrices accessibles**. Filtres : `tasks` et `task_attachments` en `board_id=in.(…)`,
  `boards` en `id=in.(…)`, `universes` et `board_placements` en `user_id=eq.<moi>`.
- ⚠️ **Le filtre `in` est plafonné à 100 valeurs** (constat du spike, voir `dev.md`), et
  le dépassement fait LEVER `realtime.subscription_check_filters` : l'abonnement échoue
  en entier, donc plus aucun temps réel. Le jeu est donc **découpé en tranches de 100**,
  une liaison `on('postgres_changes', …)` par tranche, sur le même canal. Ce n'est pas
  une optimisation pour plus tard : au-delà du seuil, tout tombe d'un coup.
- Réabonnement quand ce jeu change, **suivi d'un rechargement complet** : Realtime ne
  rejoue rien, chaque réabonnement ouvre une fenêtre d'événements perdus. Le mécanisme
  existe déjà pour la reconnexion (`dejaAbonne`) — on le réemploie, on n'en invente pas
  un second.
- Abonnement au canal de diffusion `penduline:user:<id>` : à réception, recalcul du jeu,
  réabonnement, rechargement.
- L'avertissement en tête de fichier est **mis à jour**, pas supprimé : il reste vrai, il
  change seulement de levier.

Tests unitaires (Node, sans réseau) : construction du filtre, détection d'un changement
de jeu, et non-réabonnement quand le jeu est identique dans un autre ordre.

### 8. Web — store et écrans

- `apps/web/src/data/store.ts` : `author_id` aux quatre insertions, chargement des
  `board_placements` et des `board_members`, `moveBoard` écrit dans `board_placements`,
  `Board` perd `universe_id`/`position` (le store les rattache depuis le placement).
- `packages/shared/src/types.ts` : `BoardMember`, `BoardPlacement`, `Invitation`,
  `Role`, et les colonnes déplacées.
- `components/ShareModal.tsx` (nouveau) : membres, rôle, révoquer, **créer un lien** à
  copier. Gabarit et vocabulaire repris de `ConnectedApps.tsx`, qui fait déjà ça pour les
  applications connectées.
- `components/BoardMenu.tsx` : « Partager… » (propriétaire), « Quitter le partage » (invité).
- Badge « partagée » sur la ligne de matrice, sur le modèle de `OriginBadge.tsx`.
- `screens/Invitation.tsx` + interception d'URL dans `lib/partage.ts`, **exactement** sur
  le motif de `readAuthorizeRequest` / `AUTHORIZE_PATH` : fonction pure, lue une fois en
  initialiseur paresseux, écran rendu **après** `!session` — un visiteur déconnecté
  s'inscrit d'abord et retombe dessus.
  ⚠️ `SignIn` passe `redirectTo: window.location.origin` : avec une invitation en
  attente, il doit passer l'URL d'invitation, sinon la confirmation d'adresse ramène
  l'invité sur un accueil vide. C'est l'échec le plus coûteux du parcours, parce qu'il
  est silencieux.

**Trois points ajoutés après la revue UX**, tous sur le même principe — un refus muet se
lit comme un bug, un refus expliqué se lit comme une intention :

- **Lecture seule** : la matrice s'affiche entière, et les gestes d'écriture sont
  désactivés *en portant leur motif* (« Vous avez accès en lecture »), sur le modèle de
  `CardFocus.refusal`. La RLS refusera de toute façon ; l'interface doit rendre ce refus
  prévisible **avant** le geste, pas après.
- **Révocation pendant la consultation** : si la matrice retirée est ouverte, retour à
  l'accueil avec un message explicite, et non un écran vide ou une erreur de chargement.
  Un retrait non expliqué se lit comme une perte de données.
- **Annonces `aria-live`** via `a11y/announce.tsx` : apparition d'une matrice partagée,
  disparition sur révocation, refus d'une action en lecture seule. Un changement poussé
  par le temps réel est par construction un changement que personne n'a déclenché —
  sans annonce, il n'existe pas pour qui ne voit pas la liste.

### 9. Attribution visible

Sur `TaskCard`, **seulement quand la matrice est partagée** : qui a créé, et qui a coché.
Sur une matrice personnelle, l'information est bruit — c'est toujours soi.
Du texte, jamais une icône seule — même règle que la pastille « partagée ».

### 10. Extension et serveur MCP

- `apps/extension/src/store.ts`, `background.ts` : `author_id`, et le même jeu de filtres
  temps réel (le panneau consomme déjà `subscribeRealtime`).
- `apps/mcp/src/mcp/tools.ts` : `author_id` aux trois insertions ; `TASK_COLS` aligné.
  L'agent voit désormais les matrices partagées — c'est cohérent, la RLS décide.
- `packages/shared/src/test-fixtures.ts` : colonnes renommées.

---

## Vérification

### Portes de qualité
```
npm run lint && npm run typecheck && npm run test
```

### Suite RLS à deux comptes
Supabase local démarré, deux comptes de test :
```
npm run test -- partage.live
```
Elle doit passer **avant** que les écrans soient jugés finis — c'est elle qui prouve le
cloisonnement, pas l'interface.

### Validation manuelle (deux navigateurs, deux comptes)

1. A crée une matrice, l'ouvre en partage, génère un lien, le donne à B → B accepte,
   la matrice apparaît chez B **sans rechargement**.
2. B la range dans un de SES univers → A ne voit aucun changement de son côté.
3. B en `lecture` : la matrice s'affiche, l'ajout et le glisser-déposer sont refusés.
4. A passe B en `ecriture` → B ajoute une tâche, A la voit apparaître.
5. B coche une tâche → A voit « coché par B ».
6. A et B tapent en même temps dans deux champs d'ajout → **aucune saisie n'est vidée**.
7. A révoque B → chez B, la matrice disparaît en quelques secondes, sans rechargement.
8. A supprime une tâche d'une matrice **non** partagée → rien n'arrive chez B
   (à vérifier dans l'onglet réseau, pas seulement à l'écran).
9. Invitation vers une adresse sans compte : le lien mène à l'inscription, puis à
   l'adhésion, sans repasser par l'accueil.
10. Statistiques chez A : elles ne comptent que ce qu'A a coché.

---

## Ce qui reste hors périmètre

- Partage d'un **univers** entier (#17) — on partage une matrice.
- Rotation des jetons de rafraîchissement — verrouillée par `work/session.md`.
- E-mail d'invitation automatique — le lien se partage à la main, par décision.
