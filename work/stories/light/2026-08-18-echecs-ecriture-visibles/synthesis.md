---
slug: "echecs-ecriture-visibles"
title: "Les échecs d'écriture sont invisibles pour l'utilisateur"
issue: 34
created: 2026-08-18
completed: 2026-08-20
status: "Done"
---

# Synthèse

## Résumé

Les 13 chemins d'écriture du produit (10 web + 3 extension) passent désormais par une couche
commune : mise à jour optimiste, persistance, et — si la persistance échoue — **retour arrière
ciblé + message visible**, avec « Réessayer » quand rejouer a une chance d'aboutir. Avant, au
mieux un `console.error`, au pire un `return` muet : le geste réussissait à l'écran et
disparaissait au rechargement suivant.

Aucune signature d'appelant n'a changé : les écrans continuent d'appeler `void store.x()`.

## Architecture livrée

```
packages/shared/src/write.ts          classifyWriteFailure()  ← pur, 7 tests
        ↑                        ↑
apps/web/src/data/persist.ts    apps/extension/src/store.ts (persist local)
        ↑         ↓                      ↑          ↓
   store.ts   components/Toast.tsx    store.ts   toast.tsx
  (10 chemins)  ToastProvider        (3 chemins)  hôte 1 slot
```

Trois familles d'échec sont distinguées sur des repères vérifiés dans `postgrest-js` **et
confirmés en production pendant la validation** : `status 0` → coupure réseau (rejouable),
`401` / `PGRST3xx` → session morte (non rejouable), `403` / `42501` → refus de policy (non
rejouable — un refus RLS est un bug, pas quelque chose que l'utilisateur répare en cliquant).

## Décisions notables

**Retour arrière ciblé, pas de `reload()`.** Recharger écraserait une écriture concurrente
encore en vol, et échouerait de toute façon quand la cause est justement la coupure réseau.

**L'état d'avant est capturé dans `apply`**, depuis la fonction de mise à jour, pas depuis les
tableaux du rendu. Plusieurs méthodes du store sont appelées depuis des fermetures vieilles de
plusieurs secondes (le minuteur d'annulation) : lire le rendu de l'époque restaurerait des
valeurs périmées. Les dépendances des `useCallback` restent inchangées.

**Un hôte de toasts unique, qui empile.** `Matrix` et `Global` dupliquaient le même markup, et
surtout la même place en bas de l'écran — or cocher une tâche hors-ligne déclenche le toast
d'annulation ET le toast d'échec. La déduplication par clé fait qu'un geste sur une paire, qui
produit deux écritures, ne produit qu'un message.

**Trois ajouts au plan, chacun rendu nécessaire par l'implémentation :**

1. **`commit(data)` dans `WriteOp`** — sans lui, « Réessayer » sur une création écrivait bien en
   base sans que rien n'apparaisse à l'écran. Vérifié dans le navigateur : la matrice apparaît
   au réessai, sans rechargement.
2. **`lib/session-notice.ts`** — le toast « session expirée » ne survit pas à l'événement qu'il
   annonce : la déconnexion démonte l'hôte en quelques millisecondes. Sans relais vers l'écran
   de connexion, l'utilisateur atterrissait sans explication — le symptôme même que la story
   corrige.
3. **Bouton de fermeture sur les toasts persistants** — un `denied` n'offre pas de « Réessayer »
   et serait resté à l'écran indéfiniment.

## Changements réalisés

| Fichier | Nature |
|---|---|
| `packages/shared/src/write.ts` + `write.test.ts` | nouveau — classification, 7 tests |
| `packages/shared/src/index.ts` | export |
| `apps/web/src/components/Toast.tsx` | nouveau — `ToastProvider` / `useToast`, pile |
| `apps/web/src/data/persist.ts` | nouveau — `usePersist()` |
| `apps/web/src/lib/session-notice.ts` | nouveau — relais vers `SignIn` |
| `apps/web/src/data/store.ts` | les 10 chemins réécrits ; helpers `byPosition`, `previousValues`, `taskLabel` |
| `apps/web/src/data/useCompletion.ts` | publie dans l'hôte ; annule l'archivage si le cochage échoue |
| `apps/web/src/App.tsx` | `AppRoot` scindé en `AppRoot` + `Workspace` ; vue en `sessionStorage` ; notice sur `SignIn` |
| `apps/web/src/screens/{Matrix,Global}.tsx` | markup de toast dupliqué supprimé |
| `apps/web/src/styles.css` | `.toast-stack`, `.toast--error`, `.toast__close` ; keyframe ; correctif `.home-actions` |
| `apps/extension/src/toast.tsx` | nouveau — hôte à un seul emplacement |
| `apps/extension/src/store.ts` | `persist` local + les 3 chemins |
| `apps/extension/src/{App.tsx,styles.css}` | montage de l'hôte + CSS |

## Tests et validation

- **Linting** : ⚪️ pas de linter dans ce dépôt
- **Typecheck** : ✅ les 3 workspaces
- **Tests automatiques** : ✅ 97 (89 shared, 8 web)
- **Build** : ✅ shared + web + extension
- **Validation manuelle** : ✅ pilotée dans un Chrome contrôlé, tests 1 à 5 du plan
- **Test 6 (refus RLS)** : pas de chemin UI — couvert par les tests unitaires
- **Test 7 (extension)** : ⚠️ **reste à faire** — le popup n'est pas pilotable ici

## Défauts trouvés par la validation

Deux défauts introduits par cette story, corrigés :

1. **L'archivage fantôme.** Hors-ligne, cocher produisait deux toasts, et si le réseau revenait
   entre les deux, l'archivage **réussissait** : une tâche affichée comme ouverte partait à la
   corbeille. `patchTask` ne rendait pas de verdict, donc `useCompletion` ignorait l'échec.
   `persist` renvoie maintenant `{ ok, data }` — ce qui lève au passage l'ambiguïté du contrat
   initial, les `update` renvoyant légitimement `data: null` en cas de succès.
2. **Un commentaire faux sur `signOut`.** Le log réseau montre `POST /auth/v1/logout?scope=local`
   → 403. `GoTrueClient._signOut` appelle le serveur quel que soit le scope et tolère les
   401/403/404. Le choix de `local` reste bon, mais la raison est autre : ne pas déconnecter
   l'utilisateur de ses autres appareils.

Un défaut **préexistant**, signalé pendant la validation et corrigé au passage : le bouton
« Nouvel univers » s'étirait en grand ovale à l'ouverture du formulaire de création
(`.home-actions` en `align-items: stretch`, `margin-top` cumulé, formulaire dimensionné au
contenu).

## Limites assumées

- **Pas de file d'attente ni de rejeu différé** — c'est #28.
- **Pas de transaction.** Un geste sur une paire produit deux écritures qui s'annulent
  indépendamment. En pratique elles échouent ensemble et se rétractent ensemble ; un échec sur
  une seule laisserait la paire à moitié appliquée à l'écran, sans conséquence côté serveur.
- **`deleteUniverse` est une séquence** (N `update` puis un `delete`). Un échec au milieu laisse
  le serveur avec une matrice déliée sous un univers qui existe encore — divergence jusqu'au
  prochain chargement, sans perte de donnée. Corriger demanderait une RPC transactionnelle.
- **Le chemin de lecture reste muet.** Avec un jeton invalide, les trois `GET` échouent en 401 et
  l'accueil affiche « Aucune matrice pour l'instant » — un compte vide, pas une erreur. #34 ne
  porte que sur les écritures ; le même traitement pour les lectures mérite sa propre story.
