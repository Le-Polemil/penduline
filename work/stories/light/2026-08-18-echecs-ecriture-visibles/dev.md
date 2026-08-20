---
slug: "echecs-ecriture-visibles"
title: "Les échecs d'écriture sont invisibles pour l'utilisateur"
issue: 34
created: 2026-08-18
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. `packages/shared/src/write.ts` + `write.test.ts` + export dans `index.ts` | Terminé | 2026-08-20 |
| 2. `apps/web/src/components/Toast.tsx` + CSS `.toast-stack` / `.toast--error`, monté dans `AppRoot` | Terminé | 2026-08-20 |
| 3. Migrer le toast d'annulation dans l'hôte (`useCompletion`, `Matrix.tsx`, `Global.tsx`) | Terminé | 2026-08-20 |
| 4. `apps/web/src/data/persist.ts` | Terminé | 2026-08-20 |
| 5. Réécrire les 10 chemins de `apps/web/src/data/store.ts` sur `persist` | Terminé | 2026-08-20 |
| 6. Session expirée : `view` en `sessionStorage`, `signOut({ scope: 'local' })` | Terminé | 2026-08-20 |
| 7. Extension : `toast.tsx` + les 3 chemins de `apps/extension/src/store.ts` | Terminé | 2026-08-20 |
| 8. Vérifier qu'aucun `console.error` ne subsiste seul sur un chemin d'écriture | Terminé | 2026-08-20 |

## Journal

### 2026-08-20 : `classifyWriteFailure` dans le paquet partagé

**Statut** : Terminé

**Actions réalisées** :
- Créé `classifyWriteFailure(error, status, label)` → `WriteFailure { kind, message, retryable }`,
  avec les quatre familles prévues (`offline` / `session` / `denied` / `unknown`).
- Exposé un type `WriteErrorLike` plutôt que de dépendre de `PostgrestError` : la fonction
  reste appelable depuis un test avec un objet littéral, et le paquet partagé ne gagne pas
  une dépendance de type sur `postgrest-js`.
- Écrit 7 tests qui verrouillent surtout `retryable` — le libellé peut bouger, pas la
  décision de proposer « Réessayer ».
- Ajouté `export * from './write'` dans `index.ts`.

**Fichiers modifiés** :
- `packages/shared/src/write.ts` (nouveau)
- `packages/shared/src/write.test.ts` (nouveau)
- `packages/shared/src/index.ts`

**Notes** : l'ordre des tests est celui de la fonction, et il est significatif — le `status`
tranche avant le `code`, parce qu'une coupure réseau remonte un message trompeur
(`Failed to fetch`) avec un code vide. Deux tests couvrent le cas « bon code, mauvais
statut » (`PGRST303` sur un 500, `42501` sur un 400) : c'est ce qui arrive derrière un proxy
qui réécrit le statut. `npm test` : 89 tests verts (3 fichiers shared). `npm run typecheck` : OK.

### 2026-08-20 : hôte de toasts unique

**Statut** : Terminé

**Actions réalisées** :
- `ToastProvider` + `useToast()` sur le modèle d'`AnnounceProvider` : `show(input)` /
  `dismiss(key)`, pile en colonne, la plus récente en bas, déduplication par clé.
- CSS : le placement `position: fixed` passe de `.toast` à `.toast-stack` ; `.toast` ne garde
  que son apparence. Ajout de `.toast--error` et `.toast__close`.
- `AppRoot` scindé : il ne porte plus que les fournisseurs, la logique store + vue part dans
  un nouveau `Workspace`.

**Fichiers modifiés** :
- `apps/web/src/components/Toast.tsx` (nouveau)
- `apps/web/src/styles.css`
- `apps/web/src/App.tsx`

**Notes** — trois écarts au plan, tous forcés par l'implémentation :

1. **`AppRoot` scindé en `AppRoot` + `Workspace`.** Le plan disait « monté dans `AppRoot` », mais
   `AppRoot` appelait `useStore(userId)` *avant* de rendre `AnnounceProvider`. Or c'est le store
   qui devra consommer `useToast` (tâches 4-5) : il doit donc se rendre **sous** le fournisseur.
   D'où `Workspace`, qui reprend store + `view` à l'identique. Effet de bord bienvenu : les
   fournisseurs sont désormais montés pendant le chargement, plus seulement après.
2. **Bouton de fermeture ajouté** (`.toast__close`). Le plan prévoyait « `durationMs` absent =
   persistant jusqu'au clic », mais un `denied` n'offre pas de « Réessayer » : sans croix, le
   toast restait à l'écran indéfiniment. Règle retenue : tout toast qui ne part pas de lui-même
   est refermable.
3. **`@keyframes mm-slideup` réécrit.** Il translatait de `-50%` en X pour se centrer lui-même ;
   le centrage vivant maintenant sur le conteneur, chaque toast partait de travers d'une
   demi-largeur. Il ne translate plus qu'en Y. Ce keyframe n'avait pas d'autre consommateur.
   Ajout au passage d'un `prefers-reduced-motion` (le toast apparaît sans glisser) — il n'y en
   avait pas.

Autre point : `.toast-stack` est monté en permanence, même vide, pour qu'un lecteur d'écran
restitue l'insertion dans un nœud préexistant — d'où le `pointer-events: none` sur la pile,
sans quoi un conteneur vide intercepterait les clics en bas de l'écran. Le rouge d'erreur est
`#7d2a19` et non le `#a63d2a` du produit : ce dernier est fait pour du texte sur fond clair et
ne donne pas 4,5:1 au texte blanc ; `#7d2a19` donne 9,5:1.

`npm run typecheck` : OK.

### 2026-08-20 : le toast d'annulation passe par l'hôte

**Statut** : Terminé

**Actions réalisées** :
- `useCompletion` publie sous la clé `'completion'` au lieu de retourner `pending`, et
  `dismiss` sur les trois sorties du cycle (archivage, annulation, décochage).
- Supprimé le markup dupliqué de `Matrix.tsx` et `Global.tsx` ; les deux ne destructurent
  plus que `{ onCheck }`.

**Fichiers modifiés** :
- `apps/web/src/data/useCompletion.ts`
- `apps/web/src/screens/Matrix.tsx`
- `apps/web/src/screens/Global.tsx`

**Notes** : `undo()` prend désormais un `id` en argument au lieu de lire l'état `pending`. Ce
n'est pas cosmétique — la fermeture est capturée par le toast au moment du `show()`, donc dans
le rendu où `setPending` n'a **pas encore** pris effet : `undo()` y aurait lu la tâche
précédente (ou `null` au premier coup), et l'annulation aurait décoché la mauvaise tâche.
`pending` reste un état interne, toujours nécessaire à la règle « cocher une deuxième tâche
archive la première sur-le-champ ».

### 2026-08-20 : `usePersist()`

**Statut** : Terminé

**Actions réalisées** :
- `usePersist()` → `persist(op)` : `apply()` → `write()` → succès : `commit(data)` ;
  échec : `revert()`, `classifyWriteFailure`, `console.error` technique, toast avec
  « Réessayer » seulement si `retryable`, et `signOut({ scope: 'local' })` sur `session`.

**Fichiers modifiés** :
- `apps/web/src/data/persist.ts` (nouveau)

**Notes** — un champ ajouté à `WriteOp` par rapport au plan : **`commit(data)`**.

Le plan ne prévoyait qu'`apply` / `revert` / `write`, et laissait l'appelant exploiter la ligne
renvoyée après l'`await`. Ça casse le réessai des créations : « Réessayer » rappelle
`persist(op)`, qui aurait bien inséré en base — mais le `setBoards([...rs, data])` de l'appelant,
lui, ne serait jamais rejoué. La matrice existerait côté serveur et pas à l'écran. `commit`
ramène l'usage de la ligne *dans* l'op, donc dans ce qui est rejoué. Le test manuel n°4 du plan
(« En ligne, "Réessayer" → elle est créée ») en dépend directement.

Deux points de forme :
- La condition d'échec est `error !== null`, pas `error || !data`. Les `update` / `delete` sans
  `.select()` renvoient légitimement `data: null` en cas de succès ; et sur les créations,
  `.single()` produit déjà une erreur (`PGRST116`) quand aucune ligne ne revient. Le cas
  « ni erreur ni ligne » reste couvert par `classifyWriteFailure(null, …)`.
- `persist` est une expression de fonction **nommée** : elle se rappelle elle-même pour le
  « Réessayer ».

`npm run typecheck` : OK.

### 2026-08-20 : les 10 chemins du store sur `persist`

**Statut** : Terminé

**Actions réalisées** :
- Les 10 méthodes d'écriture passent par `persist`. Plus un seul `console.error` nu dans
  `store.ts` : la trace technique vit dans `persist`, le retour arrière et le toast avec.
- Aucune signature n'a changé — les écrans n'ont pas été touchés.
- Ajouté trois helpers locaux : `byPosition`, `previousValues`, `taskLabel`.

**Fichiers modifiés** :
- `apps/web/src/data/store.ts`

**Notes**

**Capture de l'état d'avant : dans `apply`, pas depuis le rendu.** C'est la décision
structurante de cette tâche. Les `revert` ont besoin de la valeur d'avant la mutation ; la lire
depuis `boards` / `tasks` / `universes` du rendu obligeait à ajouter ces tableaux aux
dépendances des `useCallback`, et surtout exposait à une capture périmée : `useCompletion`
appelle `patchTask` depuis un `setTimeout` de 4 s, avec le `patchTask` — et donc le `tasks` —
du rendu d'il y a 4 secondes. La capture se fait donc *dans la fonction de mise à jour*, qui
reçoit l'état réellement courant. Les dépendances des `useCallback` restent inchangées.

Ça repose sur une hypothèse, explicitée en commentaire dans le fichier : React a joué la
fonction de mise à jour avant que `revert` ne lise la capture. Elle tient largement — entre
`apply` et `revert` il y a l'aller-retour réseau de `write()`, là où le rendu est vidé dès la
microtâche suivante. Les `revert` se gardent tout de même contre une capture vide plutôt que
de restaurer un `null`.

**`taskLabel(patch)`** : le libellé du geste est dérivé des clés du patch (« Cocher la tâche »,
« Déplacer la tâche », « Renommer la tâche »…). Non prévu au plan, qui donnait un libellé fixe
par chemin — mais `patchTask` porte la moitié des interactions du produit, et un « Modifier la
tâche » générique n'aurait rien dit à personne. Effet de bord voulu : les deux `patchTask` d'un
geste sur une paire produisent le même libellé, donc le même message, donc la même clé de
toast — c'est exactement le mécanisme de déduplication prévu par le plan.

**`previousValues(task, patch)`** : le retour arrière de `patchTask` ne remet que les clés que
le patch touche, comme prévu. Remettre la tâche entière écraserait une modification concurrente
sur un autre champ.

**Limite ajoutée à celles du plan** : `deleteUniverse` déroule N `update` puis un `delete`. Si
l'échec survient sur le `update` n°2, les n°1 sont déjà passés côté serveur. Le `revert` remet
l'état local complet, mais le serveur garde une matrice déliée sous un univers qui existe
encore — divergence jusqu'au prochain chargement, sans perte de donnée. Corriger demanderait
une RPC transactionnelle, hors calibre ici (le plan fait le même constat pour les paires).

Deux gardes ajoutées au passage : `deleteUniverse` sort si l'univers n'est pas trouvé (le
`revert` a besoin de la ligne pour la réinsérer), et `addBoard` / `addUniverse` renvoient
`row?.id ?? null` — `Home.tsx:128` teste déjà ce `null` et ne navigue pas.

`npm run typecheck` : OK. `npm test` : 97 tests verts.

### 2026-08-20 : session expirée sans perte de contexte

**Statut** : Terminé

**Actions réalisées** :
- `Workspace` persiste `view` dans `sessionStorage` (`penduline:view`) et la relit à
  l'initialisation, via un `readView()` pur et défensif.
- Ajouté `lib/session-notice.ts` : le message d'expiration est déposé avant la déconnexion et
  repris par `SignIn`.
- `signOut({ scope: 'local' })` était déjà en place dans `persist.ts` (tâche 4).

**Fichiers modifiés** :
- `apps/web/src/App.tsx`
- `apps/web/src/lib/session-notice.ts` (nouveau)
- `apps/web/src/data/persist.ts`

**Notes**

**Le relais `session-notice` n'était pas au plan, et il est nécessaire.** Le plan attend du test
manuel n°5 « toast "session a expiré" […] retour à l'écran de connexion » — mais les deux
s'excluent : `signOut` fait retomber `App` sur `SignIn` en quelques millisecondes, ce qui démonte
`ToastProvider` et le toast avec. L'utilisateur aurait atterri devant l'écran de connexion sans
la moindre explication, c'est-à-dire exactement le symptôme que la story corrige. Le message est
donc aussi déposé en `sessionStorage` et repris par le `notice` déjà existant de `SignIn` (celui
des liens de récupération périmés). Le toast reste publié : il sert pour le cas où la
déconnexion tarderait.

**Piège StrictMode.** Première version : `takeSessionNotice()` (lecture destructive) appelée
directement dans l'initialiseur de `useState`. StrictMode invoque l'initialiseur deux fois : le
premier appel consommait le message, le second rendait `null`, et l'état retenu était le
mauvais. Le message disparaissait en développement. Scindé en `readSessionNotice()` (pure,
initialiseur paresseux) + `clearSessionNotice()` dans un effet. C'est la mise en garde que porte
déjà `readAuthHash` en haut d'`App.tsx`.

`readView()` valide la forme relue et ne fait pas confiance au JSON stocké : une version
antérieure du type `View` retombe sur l'accueil plutôt que de rendre une vue impossible. Les
accès `sessionStorage` sont tous protégés (navigation privée verrouillée).

`npm run typecheck` : OK.

### 2026-08-20 : extension

**Statut** : Terminé

**Actions réalisées** :
- `apps/extension/src/toast.tsx` : hôte à **un seul emplacement**, même API que le web
  (`show` / `dismiss`).
- `usePersist()` local dans `store.ts`, et les 3 chemins (`addBoard`, `addTask`, `patchTask`)
  réécrits dessus. Plus aucun `console.error` nu.
- CSS `.toast` / `.toast--error` / `.toast__act` / `.toast__close` ajouté ; deux variables de
  ramp reprises du web (`--color-neutral-900`, `--color-accent-300`).
- `ToastProvider` monté autour du contenu de `.popup`.

**Fichiers modifiés** :
- `apps/extension/src/toast.tsx` (nouveau)
- `apps/extension/src/store.ts`
- `apps/extension/src/App.tsx`
- `apps/extension/src/styles.css`

**Notes**

**Un seul emplacement, pas une pile.** Le popup n'a pas de toast concurrent : cocher y archive
tout de suite (`{ done: true, archived: true }`), il n'y a pas de délai d'annulation à annoncer.
Un nouveau message remplace donc le précédent — ce qui déduplique gratuitement les deux
écritures d'un geste sur une paire, là où le web a besoin d'une clé pour le même résultat.

**Le code de `persist` est dupliqué, pas partagé** — décision assumée. Ce qui *devait* être
commun, la classification, l'est déjà dans `@penduline/shared`. Partager le reste imposerait à
`@penduline/shared` une dépendance à React qu'il n'a pas, pour trois appels et deux hôtes de
toast volontairement différents. Le libellé de `patchTask` reste fixe côté extension
(« Modifier la tâche ») : le popup n'a pas la variété de gestes qui justifiait `taskLabel` sur
le web.

Le `signOut({ scope: 'local' })` est repris malgré le « pas de gestion session élaborée » du
plan : sans lui, rien ne déclenche l'`onAuthStateChange` sur lequel le plan compte pour retomber
sur `SignIn`, et chaque écriture rejouerait le même échec sur une session morte. Une ligne.

`.toast` est en `position: fixed` dans un `.popup` en `overflow: hidden` — sans conséquence, le
popup ne crée pas de bloc conteneur (ni `transform` ni `filter`), un descendant `fixed` s'y
échappe. `npm run build:ext` : OK.

### 2026-08-20 : audit des chemins d'écriture + vérifications qualité

**Statut** : Terminé

**Actions réalisées** : recensement de tous les `.insert(` / `.update(` / `.delete()` /
`.upsert(` et de tous les `console.` des trois workspaces. Aucune modification nécessaire.

**Résultat** — 16 appels d'écriture, tous couverts :

| Emplacement | Couverture |
|---|---|
| `apps/web/src/data/store.ts` (12 appels, 10 chemins) | dans un `write:` de `persist` |
| `apps/extension/src/store.ts` (3 appels) | dans un `write:` du `persist` local |
| `apps/extension/src/background.ts:133` | son `flash('!', …)` — hors périmètre, comme prévu au plan |

Il ne reste que trois `console.` dans le code applicatif, tous délibérés :
- `persist.ts:66` et `extension/store.ts:56` — la trace **technique**, doublée d'un toast.
  C'est le contraire d'un échec muet.
- `App.tsx:272` (`resetPasswordForEmail`) — silence anti-énumération, déjà documenté sur place
  comme « exception assumée au principe général de remontée des échecs ». Pas une écriture de
  donnée, hors périmètre.
- `background.ts:144` — doublé de son `flash`.

**Vérifications qualité** (pas de linter dans ce dépôt) :
- `npm run typecheck` : ✅ les 3 workspaces
- `npm test` : ✅ 97 tests (89 shared + 8 web)
- `npm run build` : ✅ shared + web + extension

### 2026-08-20 : validation manuelle pilotée dans Chrome — 2 défauts trouvés et corrigés

**Statut** : Terminé

Tests déroulés dans un Chrome contrôlé (profil neuf, compte de test créé pour l'occasion,
données supprimées après coup), coupure réseau via l'émulation DevTools.

| Test | Résultat |
|---|---|
| 1. Renommer hors-ligne → revert + toast + « Réessayer » → persiste | ✅ |
| 2. Cocher hors-ligne → toast neutre et toast d'erreur **empilés**, pas superposés | ✅ |
| 3. Supprimer une matrice hors-ligne → revient avec sa tâche ouverte **et** son archivée | ✅ |
| 4. Créer hors-ligne → pas de matrice fantôme, pas de navigation ; « Réessayer » la crée | ✅ |
| 5. Session expirée → pas de « Réessayer », notice sur l'écran de connexion, retour à la vue quittée | ✅ |
| 6. Refus RLS | pas de chemin UI — couvert par les tests unitaires |
| 7. Extension | à valider hors pilotage (popup) |

Deux vérifications ciblées valent d'être notées :
- **`commit` fait son travail** : après « Réessayer » sur une création, la matrice apparaît
  **sans rechargement**. C'est la justification concrète du champ ajouté à `WriteOp`.
- **La classification tient sur du réel** : le log confirme `[penduline] Cocher la tâche 0
  TypeError: Failed to fetch` hors-ligne, et `[penduline] Créer la matrice 401 PGRST301
  Expected 3 parts in JWT; got 1` sur session morte. Les repères
  (status 0 / 401+PGRST3xx) sont ceux qu'on attendait.

---

#### Défaut 1 — l'archivage fantôme après un cochage qui a échoué (corrigé)

**Symptôme observé** : hors-ligne, cocher une tâche produisait **deux** toasts d'erreur —
« Cocher la tâche », puis « Archiver la tâche » quatre secondes plus tard.

**Cause** : `patchTask` ne rendait pas de verdict, donc `useCompletion` ne pouvait pas savoir
que le cochage avait échoué. Le revert affichait la tâche décochée, mais le minuteur
d'annulation partait quand même et tentait l'archivage.

**Pourquoi ce n'était pas qu'un bruit** : si le réseau revient entre les deux, l'archivage
**réussit** — une tâche affichée comme ouverte part à la corbeille. C'est une incohérence que
le revert introduit : avant cette story, l'échec était muet mais cohérent.

**Correctif** :
- `persist` renvoie désormais `{ ok, data }` et non `T | null`. `ok` est nécessaire parce que
  les `update` / `delete` renvoient légitimement `data: null` quand ils réussissent — le seul
  `data` ne permettait pas de distinguer succès et échec. Ça lève au passage l'ambiguïté que
  j'avais notée à la tâche 4.
- `Store.patchTask` renvoie `Promise<boolean>` (additif : les `void store.patchTask(…)` des
  écrans restent valides).
- `useCompletion.complete` annule le minuteur, vide `pending` et referme le toast quand le
  cochage n'a pas tenu.

**Après correctif** : un seul toast, et plus rien à t+6 s. Le cycle en ligne est intact
(coché → toast « Annuler » → archivé à 4 s, corbeille incrémentée).

#### Défaut 2 — un commentaire faux sur `signOut` (corrigé)

Le log réseau montre `POST /auth/v1/logout?scope=local` → **403**. Or mon commentaire dans
`persist.ts` justifiait le choix de `local` par « un appel distant échouerait ». Lecture de
`GoTrueClient._signOut` : l'appel serveur a lieu **quel que soit le scope**, et auth-js tolère
explicitement les 401/403/404 pour vider quand même la session locale.

Le choix de `local` reste bon, mais pour une autre raison : le scope dit au serveur *quelles*
sessions révoquer, et une session morte sur cet onglet n'est pas une raison de déconnecter
l'utilisateur de ses autres appareils. Commentaire réécrit en ce sens. Le 403 dans la console
est attendu et sans conséquence.

#### Observation hors périmètre

Avec un jeton invalide, les **lectures** échouent aussi (trois `GET` en 401) et l'accueil
affiche « Aucune matrice pour l'instant » — un compte vide, pas une erreur. #34 ne porte que
sur les écritures ; le chemin de lecture mériterait le même traitement, mais c'est une autre
story.

**Vérifications qualité après correctifs** : `npm run typecheck` ✅ · `npm test` ✅ 97 tests ·
`npm run build` ✅ (shared + web + extension).

### 2026-08-20 : bouton « Nouvel univers » étiré à l'ouverture du formulaire (préexistant)

**Statut** : Terminé

**Signalé par l'utilisateur** pendant la validation : ouvrir « Nouvelle matrice » transformait
le bouton « Nouvel univers » voisin en grand ovale, et « Annuler » passait à la ligne.

**Pas une régression de cette story** — mon diff CSS ne touche que la section Toast et le
keyframe `mm-slideup`, qui n'a pas d'autre consommateur que `.toast`. `.home-actions`,
`.add-board-form` et `.add-board-input` sont inchangés depuis `main`. Corrigé quand même :
c'est trois lignes, et le défaut est en travers d'un des écrans de la validation.

**Trois causes qui s'additionnaient** (mesurées dans le navigateur, pas devinées) :

| Cause | Mesure | Correctif |
|---|---|---|
| `.home-actions` en `align-items: normal`, donc *stretch* | le bouton faisait **100 px** au lieu de 38 | `align-items: flex-start` |
| `.add-board-form` réappliquait `margin-top: 18px` alors que `.home-actions` en a déjà un | ligne à 316, formulaire à 334 — 18 px de creux et un décalage vertical | `margin-top` retiré (les deux seuls usages du formulaire sont dans `.home-actions`) |
| formulaire dimensionné au contenu : 317 px sur 712 disponibles | « Annuler » renvoyé à la ligne | `flex: 1 1 320px` sur le formulaire |

Un quatrième point trouvé en vérifiant les autres états : **les deux formulaires ouverts
simultanément** repassaient aussi « Annuler » à la ligne (352 px chacun, il en fallait 362).
Base du champ ramenée de 220 à 160 px — c'est le seuil de retour à la ligne, pas la largeur au
repos, que `flex-grow` continue de calculer sur la place disponible.

**États vérifiés après correctif** (hauteurs de ligne relevées au `getBoundingClientRect`) :
fermé 40 px · formulaire matrice seul 40 px · formulaire univers seul 40 px · les deux ouverts
38 px, chacun sur une ligne · mobile 390 px : le formulaire tient sur une ligne et le bouton
passe dessous à sa taille normale.

`npm run typecheck` ✅ · `npm test` ✅ 97 tests · `npm run build` ✅

<!-- Les entrées suivantes s'ajoutent ici -->
