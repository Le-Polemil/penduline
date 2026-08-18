---
story: "Le dépôt d'une matrice s'annule dès qu'on quitte l'interstice"
story_code: "drop-interstice"
created: 2026-08-18
---

# Contexte

> Rédigé directement plutôt que par agents PO / architecte / UX : la consigne de projet
> proscrit les sous-agents non demandés, et le cadrage tient dans l'issue #74.

## Description fonctionnelle

Réordonner ses matrices est le geste de rangement de l'accueil. Il est aujourd'hui
défaillant : le dépôt n'est accepté que sur un ruban de 10 px entre deux lignes, et tout
dépôt ailleurs **annule** le déplacement. L'utilisateur voit pourtant un trait pointillé
lui désigner une destination — qui ne recevra rien. Le geste paraît donc aléatoire, et la
seule façon de le réussir est d'apprendre à viser un élément qu'on ne voit pas.

Ce qui change : viser devient tolérant. Déposer n'importe où sur une ligne range la
matrice juste au-dessus ou juste en dessous d'elle, selon la moitié survolée. L'en-tête
d'un univers et un univers vide deviennent eux aussi déposables. Ce qui ne change pas :
l'interstice reste l'unité de rangement, et le trait pointillé désigne toujours la
destination réelle — c'est l'engagement central de ce correctif.

Ce qui reste hors périmètre : le confort du même geste sur l'écran matrice (ruban de
8 px), et le glisser au doigt, que le DnD HTML5 ne sert pas (les flèches ↑ ↓ et la feuille
d'appui long restent le chemin tactile et clavier, acquis avec #38).

## Vue architecturale

Trois couches, du plus stable au plus volatile :

```
packages/shared/layout.ts   positionBefore()          ← inchangé
apps/web/data/store.ts      moveBoard()               ← inchangé
apps/web/dnd/gap.ts         gapIndexAt()              ← nouveau, pur, testé
apps/web/screens/Home.tsx   zones de dépôt + indicateur
```

La règle de ciblage est extraite en fonction pure (`gapIndexAt`) plutôt que noyée dans un
gestionnaire d'événement : même motif que `planBoardReorder`, extrait vers `packages/shared`
pour #38 afin d'être testable. Elle reste dans `apps/web` et non dans `shared` — c'est une
décision d'écran, l'extension n'ayant pas de liste de matrices.

Le dépôt migre du ruban vers deux niveaux, ce qui supprime la zone morte :

```
<section class="uni">          repli → fin de groupe (rend l'en-tête et un groupe vide déposables)
  <div wrapper>                cible précise, stopPropagation
    <BoardGap/>                indicateur seul, plus aucun gestionnaire
    <div class="board-row"/>   curseur < milieu ⇒ interstice i, sinon i+1
```

Aucune écriture n'est touchée : `dropAt` → `store.moveBoard` → `positionBefore` restent
identiques, y compris la garde `id === beforeId` qui neutralise le dépôt sur soi-même.

## Impacts UX

Le pointeur ne vise plus une bande de 10 px mais une ligne entière, coupée en deux :

```
┌───────────────────────────────┐  ← curseur ici : interstice AU-DESSUS
│  Cuisine          3 tâches    │
└───────────────────────────────┘  ← curseur ici : interstice EN DESSOUS
- - - - - - - - - - - - - - - - -  ← le trait montre où ça tombera, en continu
```

Deux corollaires visuels : le trait est effacé dès qu'on sort de la liste (il ne survit
plus au geste), et le soulèvement au survol (`translateY(-2px)`) est neutralisé pendant un
déplacement — la cible ne doit pas bouger au moment où on la vise.

Accessibilité : aucun chemin clavier ni tactile n'est modifié. Le glisser-déposer reste un
geste souris, doublé par les flèches ↑ ↓ et la feuille d'appui long livrées avec #38.
