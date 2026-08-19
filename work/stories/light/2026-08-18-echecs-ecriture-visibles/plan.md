---
slug: "echecs-ecriture-visibles"
title: "Les échecs d'écriture sont invisibles pour l'utilisateur"
issue: 34
created: 2026-08-18
status: "In Progress"
---

# #34 — Les échecs d'écriture sont invisibles pour l'utilisateur

## Contexte

Toutes les écritures de Penduline sont optimistes : l'état local change d'abord, la
persistance suit. Mais aucun chemin ne gère l'échec. Au mieux un `console.error`, au pire
un `return` muet. Réseau coupé, session expirée, policy RLS : l'utilisateur voit son geste
réussir, et il disparaît au rechargement suivant. À dix utilisateurs c'est un bug ; à mille,
c'est « l'application perd mes tâches ».

Objectif : **un échec d'écriture doit être visible et réversible immédiatement**. Pas de file
d'attente, pas de rejeu différé — ça relève de #28.

### Ce que l'exploration a corrigé du texte de l'issue

- **12 chemins concernés, pas 4.** 10 dans `apps/web/src/data/store.ts` (le CRUD univers est
  arrivé après la rédaction de l'issue), 2 dans `apps/extension/src/store.ts`.
  `background.ts:144` est déjà couvert par son `flash()` — hors périmètre.
- **3 chemins sont muets sans même un `console.error`** : `addBoard` (web), `addTask` (web et
  extension) font `if (error || !data) return;`.
- **Le « composant toast » n'existe pas.** `Matrix.tsx:554` et `Global.tsx:378` dupliquent le
  même markup, déjà occupé par le cycle cocher/annuler de `useCompletion`. Deux toasts en bas
  au centre se superposeraient — or cocher une tâche hors-ligne déclenche exactement les deux.
- **Classification fiable** (vérifiée dans `postgrest-js` 2.110.8, `dist/index.mjs:326-368`) :
  panne réseau → `status: 0`, `code: ''` ; JWT expiré → `status: 401` / `code: PGRST3xx` ;
  RLS → `403` / `42501`. RLS n'est **pas** rejouable — « Réessayer » ne doit donc pas
  s'afficher partout.

## Décisions prises

| Sujet | Choix |
|---|---|
| Retour arrière | Restauration **ciblée** : capturer les lignes touchées avant de muter, les remettre par id à l'échec. Pas de `reload()` : il écraserait une écriture concurrente encore en vol, et échouerait aussi hors-ligne. |
| Toast | **Un seul hôte** monté dans `AppRoot`, sur le modèle d'`AnnounceProvider`. Il empile, donc plus de superposition, et supprime la duplication `Matrix`/`Global`. |
| Périmètre | Les **12 chemins** (10 web + 2 extension). |

## Architecture

Trois couches, la logique testable isolée de React :

```
packages/shared/src/write.ts        classifyWriteFailure()  ← pur, testé
        ↑
apps/web/src/data/persist.ts        usePersist() → persist(op)   applique / écrit / annule / signale
        ↑                                    ↓
apps/web/src/data/store.ts          les 10 chemins        apps/web/src/components/Toast.tsx
                                                          ToastProvider + useToast()
apps/extension/src/{store,toast}.tsx  même schéma, hôte minimal
```

Point clé : **tout se joue à l'intérieur des méthodes du store**. Aucune signature ne change,
aucun appelant n'est touché (`Home.tsx`, `Matrix.tsx`, `Global.tsx` gardent leurs `void
store.x()` et leurs gardes sur `null`).

### 1. `packages/shared/src/write.ts` (nouveau)

```ts
export type WriteFailureKind = 'offline' | 'session' | 'denied' | 'unknown';
export interface WriteFailure { kind: WriteFailureKind; message: string; retryable: boolean }

/** `label` = le geste, à la première personne du produit : « Renommer la matrice ». */
export function classifyWriteFailure(
  error: { code?: string | null; message?: string } | null,
  status: number,
  label: string,
): WriteFailure
```

- `status === 0` → `offline`, rejouable — « « {label} » n'a pas pu être enregistré : connexion perdue. »
- `status === 401` ou `code` commençant par `PGRST3` → `session`, non rejouable — « Votre session a expiré. Reconnectez-vous pour continuer. »
- `status === 403` ou `code === '42501'` → `denied`, non rejouable — un refus RLS est un bug, pas quelque chose que l'utilisateur peut réparer en cliquant.
- sinon → `unknown`, rejouable.

Exporté depuis `packages/shared/src/index.ts`. Testé dans `write.test.ts` (environnement
`node`, cohérent avec `vitest.base.mts` : logique pure, pas de DOM).

### 2. `apps/web/src/components/Toast.tsx` (nouveau)

Sur le modèle exact d'`a11y/announce.tsx` (contexte + provider + hook).

```ts
interface ToastInput {
  message: string;
  tone?: 'neutral' | 'error';
  action?: { label: string; onClick: () => void };
  durationMs?: number;   // absent = persistant jusqu'au clic
  key?: string;          // remplace le toast de même clé ; défaut = message
}
show(t: ToastInput): void
dismiss(key: string): void
```

- La clé sert **à la fois** à dédupliquer (deux écritures d'une même paire qui échouent →
  un seul toast) et à remplacer (`useCompletion` republie sous la clé `'completion'`).
- Pile en colonne, la plus récente en bas. `role="alert"` pour `error` (annonce assertive,
  donc lue par un lecteur d'écran sans passer par `useAnnounce`), `role="status"` pour `neutral`.
- CSS : `.toast-stack` (conteneur `position: fixed` reprenant le placement actuel de `.toast`)
  et `.toast--error` dans `apps/web/src/styles.css`, section « Toast » (l. 557). `.toast`
  garde son apparence.

Monté dans `AppRoot` (`App.tsx:114`), à l'intérieur d'`AnnounceProvider`.

### 3. Migration du toast d'annulation

`useCompletion` reçoit le hook et publie au lieu de rendre :
`show({ key: 'completion', message: '« … » terminée', action: { label: 'Annuler', onClick: undo }, durationMs: UNDO_MS })`,
`dismiss('completion')` quand la tâche est archivée ou décochée. Le minuteur `UNDO_MS` existant
reste la source de vérité de l'archivage — le `durationMs` du toast ne fait que le refléter
visuellement.

Suppression du markup dupliqué : `Matrix.tsx:553-559`, `Global.tsx:377-383`, et le `pending`
retourné par `useCompletion` n'a plus de lecteur.

### 4. `apps/web/src/data/persist.ts` (nouveau)

```ts
interface WriteOp<T> {
  label: string;                       // « Renommer la matrice »
  apply?: () => void;                  // mise à jour optimiste — rejouée au réessai
  revert?: () => void;                 // obligatoire dès qu'`apply` mute l'état
  write: () => PromiseLike<{ data: T | null; error: PostgrestError | null; status: number }>;
}
/** Renvoie `data` en cas de succès, `null` en cas d'échec. */
persist<T>(op: WriteOp<T>): Promise<T | null>
```

Déroulé : `apply()` → `write()` → si échec : `revert()`, `classifyWriteFailure()`, puis
`show()` avec une action « Réessayer » **seulement si `retryable`**, dont le `onClick`
rappelle `persist(op)` — le même objet, donc le même geste rejoué depuis le début.

Cas `session` : pas de « Réessayer ». On mémorise la vue courante puis
`supabase.auth.signOut({ scope: 'local' })` — `local` parce que le jeton est déjà invalide
côté serveur et qu'un appel distant échouerait, laissant l'utilisateur coincé.
`onAuthStateChange` fait le reste : `App` retombe sur `SignIn`.

### 5. Les 12 chemins

| Chemin | Mutation optimiste | Retour arrière |
|---|---|---|
| `renameBoard` | `name` | ancien `name` |
| `moveBoard` | `universe_id` + `position` + tri | les deux champs, retri |
| `renameUniverse` | `name` | ancien `name` |
| `reorderUniverse` | `position` + tri | ancienne `position` |
| `deleteUniverse` | retire l'univers, renumérote les matrices libérées | ré-insère l'univers, remet `universe_id` + positions |
| `deleteBoard` | retire la matrice **et ses tâches** | ré-insère les deux |
| `patchTask` | les clés du patch | les valeurs d'avant, **pour ces seules clés** |
| `purgeTasks` | retire N tâches | ré-insère les N tâches |
| `addBoard`, `addUniverse`, `addTask` (web) | aucune — ils écrivent d'abord | rien à annuler ; message seul |
| `addBoard`, `addTask`, `patchTask` (extension) | idem web | idem web |

`deleteUniverse` est une séquence (N `update` puis un `delete`) : un seul `persist`, dont le
`write` déroule la séquence et renvoie le **premier** résultat en échec. Un `revert` unique
remet l'ensemble.

### 6. Session expirée sans perte de contexte

`AppRoot` (`App.tsx:100-102`) garde sa `view` en mémoire : après reconnexion, l'utilisateur
repartirait de l'accueil. On persiste `view` dans `sessionStorage` à chaque changement et on
la relit à l'initialisation. La garde existante (`App.tsx:108` : une matrice disparue
retombe sur l'accueil) couvre déjà une vue devenue invalide.

`sessionStorage` et non `localStorage` : la vue est un état d'onglet, pas une préférence.

### 7. Extension

`apps/extension/src/toast.tsx` : même API, hôte minimal ancré dans `.popup`
(400 × 600 px, `styles.css:60`). Les 3 chemins de `store.ts` passent par un `persist` local
qui réutilise `classifyWriteFailure`. Pas de gestion `session` élaborée : `App.tsx:105`
écoute déjà `onAuthStateChange` et retombe sur `SignIn`.

## Limite assumée

Un geste sur une paire produit deux `patchTask` (`Matrix.tsx:88`, `Global.tsx:103`,
`useCompletion.archive`). Chacun s'annule indépendamment ; il n'y a pas de transaction. En
pratique les deux échouent ensemble (même réseau, même instant) et se rétractent ensemble ;
la déduplication par clé garantit un seul toast. Un échec sur une seule des deux — un refus
RLS ciblé — laisserait la paire à moitié appliquée à l'écran. Une transaction demanderait une
fonction RPC côté base : hors calibre ici, et sans conséquence sur la donnée (le serveur, lui,
reste cohérent ; un rechargement suffit).

## Tâches

1. `packages/shared/src/write.ts` + `write.test.ts` + export dans `index.ts`
2. `apps/web/src/components/Toast.tsx` + CSS `.toast-stack` / `.toast--error`, monté dans `AppRoot`
3. Migrer le toast d'annulation dans l'hôte (`useCompletion`, `Matrix.tsx`, `Global.tsx`)
4. `apps/web/src/data/persist.ts`
5. Réécrire les 10 chemins de `apps/web/src/data/store.ts` sur `persist`
6. Session expirée : `view` en `sessionStorage`, `signOut({ scope: 'local' })`
7. Extension : `toast.tsx` + les 3 chemins de `apps/extension/src/store.ts`
8. Vérifier qu'aucun `console.error` ne subsiste seul sur un chemin d'écriture

## Plan de test manuel

Prérequis : `npm run dev`, connecté, une matrice peuplée.

1. **Réseau coupé, renommer** — DevTools › Network › Offline. Renommer une matrice.
   → le nom revient à l'ancien, toast « connexion perdue » + « Réessayer ». Repasser en ligne,
   cliquer « Réessayer » → le nom tient, et un rechargement le confirme.
2. **Pas de superposition** — hors-ligne, cocher une tâche appairée.
   → la case se décoche, **un seul** toast d'erreur (pas deux), et il ne recouvre pas le toast
   « terminée / Annuler ».
3. **Suppression annulée** — hors-ligne, supprimer une matrice.
   → elle réapparaît **avec ses tâches**.
4. **Création** — hors-ligne, créer une matrice. → toast, aucune navigation, aucune matrice
   fantôme. En ligne, « Réessayer » → elle est créée.
5. **Session expirée** — dans DevTools › Application › Local Storage, altérer
   `sb-<ref>-auth-token` : remplacer `access_token` par une chaîne quelconque et pousser
   `expires_at` loin dans le futur (sinon auth-js tente un rafraîchissement et masque le cas).
   Écrire quelque chose. → toast « session a expiré », **sans** « Réessayer », retour à l'écran
   de connexion. Se reconnecter → on retrouve **l'écran d'où on venait**, pas l'accueil.
6. **Refus RLS** — en console : `await supabase.from('tasks').update({ title: 'x' }).eq('id', '<id d'un autre compte>')`
   n'a pas de chemin UI ; à défaut, vérifier par le test unitaire que `42501` donne
   `retryable: false`. → un `denied` ne propose jamais « Réessayer ».
7. **Extension** — `npm run build:ext`, recharger l'extension, hors-ligne, cocher une tâche
   dans le popup. → décochée, message visible dans le popup.

## Vérifications qualité

Ce dépôt n'a pas de linter — les portes sont :

```
npm run typecheck   # tsc --noEmit sur les 3 workspaces
npm test            # vitest : shared (layout, contrast, write) + web (gap, manifest)
```
