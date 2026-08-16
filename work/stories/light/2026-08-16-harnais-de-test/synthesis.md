---
story: "Harnais de test"
story_code: "harnais-de-test"
issues: [31]
pr: 59
created: 2026-08-16
completed: 2026-08-16
status: "Done"
---

# Synthèse

## Résumé

Le dépôt n'avait aucun test. Cette story pose l'outillage (Vitest, `npm test`,
étape CI) et couvre en priorité la logique dont les défaillances sont
**silencieuses** — 24 tests sur `packages/shared`.

Aucune modification du code de production. C'était le pari : si un test avait
échoué, c'eût été une découverte. Rien n'a échoué.

## Ce que la mesure a donné

La story posait une question à laquelle aucune relecture ne pouvait répondre :
**combien d'insertions consécutives au même interstice le schéma supporte-t-il ?**

**53.** Chaque insertion divise l'écart par deux, et un `double` a 52 bits de
mantisse. À la 54ᵉ, la moyenne de deux voisins **égale** l'une d'elles : deux
positions deviennent identiques et l'ordre cesse d'être défini, sans erreur ni
exception.

C'est confortable — il faudrait réordonner 53 fois d'affilée au même endroit sans
jamais rien faire d'autre — donc **pas de ticket de renumérotation à ouvrir**. Mais
le plafond est désormais écrit plutôt que supposé.

## Décisions et leur raison

**La base de configuration vit à la racine, en `.mts`.** Une base commune ne doit
pas appartenir à l'un de ses consommateurs : le jour où `apps/web` testera sa
logique non-React, il n'aura pas à importer depuis `packages/shared`.

L'extension `.mts` n'est pas cosmétique. Vite se plaignait d'ESM dans un fichier lu
comme CommonJS, le `package.json` racine n'ayant pas `"type": "module"`. Le poser
aurait changé l'interprétation de **tout `.js` du dépôt** non couvert par un
`package.json` plus proche — `.mts` règle le problème sans ce risque. Et un harnais
qui crache un avertissement à chaque exécution finit par être ignoré.

**`npm test` reprend le motif exact de `typecheck`** (`--workspaces --if-present`) :
aucune liste à tenir à jour, donc aucune liste à oublier de mettre à jour.

**`passWithNoTests: false`** : un workspace qui déclare un script `test` sans avoir
de test est une erreur de configuration, pas un succès. Sans cela, le harnais peut
devenir silencieusement vide — l'échec le plus discret possible.

**La fabrique ne dérive pas `position` de son compteur d'appel.** La tentation
était réelle (les listes seraient ordonnées « gratuitement »), mais un test qui
dépend de l'ordre doit le dire, pas l'hériter de son rang d'appel dans le fichier.

## Ce que les tests figent, au-delà du code

La table d'états est le **seul endroit du dépôt** où certaines règles sont énoncées
explicitement, et l'une d'elles est une décision produit : qu'une tâche cochée
reste visible tant qu'elle n'est pas archivée, c'est le délai d'annulation de
quatre secondes, pas un détail d'implémentation.

Un comportement est figé tel quel sans être défendu : `archived` sans `done` laisse
la tâche **visible**, parce que `isVisible` ne les exclut que conjointement. Cet
état ne devrait pas exister ; le test le documente plutôt que de prétendre qu'il
est impossible.

## Fichiers modifiés

- `vitest.base.mts` *(nouveau)*, `package.json`, `.github/workflows/ci.yml`
- `packages/shared/vitest.config.ts`, `packages/shared/package.json`
- `packages/shared/src/layout.test.ts`, `src/test-fixtures.ts` *(nouveaux)*
- `README.md` — section Qualité

## Tests et validation

- **Tests automatiques** : ✅ 24 tests, 1 fichier
- **Typecheck / build** : ✅ trois workspaces
- **Le harnais mord** : ✅ assertion cassée → code 1 (1 échec / 23 succès) ;
  rétablie → code 0. Un harnais incapable d'échouer ne protège de rien.
- **CI** : ✅ l'étape `Test` s'exécute et rapporte sur la PR

## Ce qui reste sans filet

**La préservation des paires vit dans `Matrix.tsx` et dans `App.tsx` de
l'extension**, pas dans `packages/shared` — donc hors d'atteinte de ce harnais. Ces
deux copies de l'invariant « une paire reste ensemble » restent sans test, et rien
ne garantit qu'elles restent d'accord.

Les extraire dans `shared` les rendrait testables d'un coup. C'est le prochain pas
naturel, et il vaut probablement un ticket : la duplication est récente (#12/#13),
c'est le meilleur moment pour la résorber.

Pas de test de composant React ni d'E2E, délibérément : le rendu se vérifie à
l'œil, contrairement à la logique.
