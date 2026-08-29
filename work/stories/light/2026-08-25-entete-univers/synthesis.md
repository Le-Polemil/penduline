---
slug: "entete-univers"
title: "En-tête d'univers : les trois gestes (#71, #72, #73)"
issues: [71, 72, 73]
created: 2026-08-25
completed: 2026-08-25
status: "Done"
---

# Synthèse

## Résumé

Un univers n'était qu'un titre de groupe. Il porte désormais trois gestes non
ambigus : **le nom ouvre la vue de l'univers, le chevron replie, une poignée
dédiée porte le glisser**.

Trois tickets en une passe, parce que le geste avait été conçu pour les trois à
la fois et n'a de sens que complet — un chevron sans poignée, ou un nom cliquable
sans repli, aurait laissé un en-tête à moitié pensé à chaque étape.

## Décisions et leur raison

**#71 ne manquait qu'un chemin, pas une vue.** La portée par univers existait
déjà, avec son filtrage et son garde-fou ; elle n'était atteignable que
depuis elle-même, tous les points d'entrée extérieurs passant `{ kind: 'all' }`
en dur. `onGlobal` prend une `Scope`.

**Le repli vit dans `localStorage`, par appareil.** C'est un état de lecture, pas
une donnée : aucune migration, aucune écriture réseau par clic, aucun chemin
d'écriture de plus à sécuriser.

**Deux couches de glisser, séparées par un discriminant — pas par des types
MIME.** `drag` devient `{ kind: 'board' | 'universe'; id }`. Les deux glissers
naissent dans le même composant : l'état suffit, et le typecheck le vérifie, ce
qu'une chaîne MIME ne fait pas. Le ticket proposait des types MIME maison ; ils
visaient un glisser venu d'ailleurs, cas qui n'existe pas dans l'application.

**Dossier à ressort plutôt que dépôt à l'aveugle.** Un univers replié reste une
cible : survol prolongé pendant un glisser, il se déplie. Le minimum laissait
l'utilisateur sans retour visuel.

**Et le dépliage est persisté, il ne se refait pas.** Les explorateurs referment
souvent le dossier après le dépôt ; ici non. Après avoir déposé une matrice, on
veut voir où elle a atterri — un repli automatique cacherait le résultat de son
propre geste.

## Ce que le travail a mis au jour

**Le trou tactile de #73 était plus large que son ticket.** `.uni-head__actions`
était en `display: none` sous `(hover: none)`, sans appui long branché sur
l'en-tête : **sur mobile, un univers n'était ni réordonnable, ni renommable, ni
supprimable.** C'est le défaut exact corrigé pour les matrices en #38, resté
ouvert un cran au-dessus.

**`dragover` se répète.** Tant que le curseur reste sur la cible, l'événement
refire toutes les quelques centaines de millisecondes : un `setTimeout` réarmé à
chaque passage n'arrive jamais à échéance. Le dépliage ne se serait **jamais**
produit, et rien dans le typage ne l'aurait dit. D'où `springFor`, qui retient
*pour quel groupe* on attend.

**700 ms, et non les 500 ms de l'appui long.** On traverse un en-tête replié pour
atteindre le groupe d'en dessous ; à 500 ms, la page se déplierait sous le curseur
à chaque passage et la cible visée sauterait.

**Le désalignement de l'en-tête venait des glyphes, pas d'un padding.** `⌄`
(U+2304) et `›` (U+203A) n'ont ni la même hauteur d'œil ni le même centre optique
dans Figtree : l'en-tête se décalait **selon l'état du repli**. Un seul dessin qui
pivote supprime la cause au lieu de la compenser — et donne au passage la
transition que deux caractères ne pouvaient pas avoir.

**L'appui long vit sur le nom, pas sur l'en-tête.** Posé sur `.uni-head`, il
aurait armé la feuille depuis le chevron et depuis les actions, qui portent déjà
leur propre geste : un appui long sur le chevron aurait ouvert la feuille *et*
replié l'univers au relâchement.

**Un garde-fou non évident** : `folded` vaut `grouped && collapsed.has(key)`. Le
`localStorage` survit à la suppression des univers, le rendu non — un repli hérité
enfermerait ses matrices sans aucun moyen de les rouvrir.

**Un oubli trouvé à la relecture** : le `onDragLeave` de `.board-list` nettoyait
`hoverGap` mais laissait `hoverUniGap`. Sortir de la liste en tenant un univers
laissait le trait pointillé désigner une destination quittée — le défaut que #74
venait de corriger pour les matrices.

**Effet de bord bienvenu** : la poignée passée en marge, le placeholder de « Sans
univers » devient inutile, et la largeur n'a plus besoin d'être réservée. La
révélation au survol ne peut plus rien décaler **par construction**, non par
réglage. Un élément DOM et une règle CSS en moins.

## Ce qui a été sorti du périmètre

**Les icônes.** Le chevron reste un SVG en ligne. Le dépôt n'a aucune librairie
d'icônes et **52 glyphes Unicode en service** sur 10 fichiers : ajouter la
dépendance pour une seule icône laisserait 1 icône contre 51 glyphes. Le gain
n'arrive qu'avec la migration complète — d'où **#79**, avec son inventaire et son
vrai coût identifié : relire l'alignement optique bouton par bouton, un `<svg>` se
centrant dans sa boîte là où un glyphe s'assied sur sa ligne de base.

## Fichiers modifiés

- `packages/shared/src/layout.ts` + `.test.ts` — `summarizeUniverse`
- `apps/web/src/dnd/gap.ts` + `.test.ts` — `dropTarget`
- `apps/web/src/screens/Home.tsx` *(l'essentiel du changement)*
- `apps/web/src/App.tsx`, `screens/Matrix.tsx`, `styles.css`

Aucune migration.

## Tests et validation

- **Tests automatiques** : ✅ **95** partagés + **21** web
- **Typecheck / build** : ✅ trois workspaces
- **Validation manuelle** : ✅ faite, avec deux retours incorporés — l'alignement
  de l'en-tête (chevron pivotant) et la poignée passée en marge

## Et après

**#79** — migration complète vers une librairie d'icônes, avec ses deux décisions
ouvertes : où vit la dépendance, et quelle épaisseur de trait aux petites tailles.
