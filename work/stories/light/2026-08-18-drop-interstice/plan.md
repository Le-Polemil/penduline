---
story: "Le dépôt d'une matrice s'annule dès qu'on quitte l'interstice"
story_code: "drop-interstice"
created: 2026-08-18
status: "In Progress"
---

# #74 — Le dépôt d'une matrice s'annule dès qu'on quitte l'interstice

**story-code** : `drop-interstice`

## Contexte

Sur l'accueil, déplacer une matrice au glisser ne fonctionne qu'en visant un ruban de
10 px. Dès que le curseur passe sur une ligne voisine, le dépôt **annule le déplacement**
— alors que le trait pointillé continue d'afficher une cible. L'indicateur et la zone
réellement active ne sont pas au même endroit : c'est le geste principal de
réorganisation de l'accueil qui devient une loterie.

## Cause

Deux défauts qui se renforcent.

1. **La cible est un ruban de 10 px.** `.board-gap` fait `height: 10px` au repos et ne
   passe à `24px` qu'une fois déjà survolé (`apps/web/src/styles.css:123-124`). Il faut
   atteindre la bande de 10 px pour ouvrir celle de 24. `.board-row:hover` ajoute un
   `translateY(-2px)` (`styles.css:136`) qui déplace la géométrie sous le curseur pendant
   qu'on vise.

2. **Rien d'autre n'accepte le dépôt.** `onDragOver` / `onDrop` ne vivent que sur
   `BoardGap` (`apps/web/src/screens/Home.tsx:651-681`). Ni `.board-row`, ni
   `<section class="uni">`, ni `.board-list` n'appellent `preventDefault()` : au-dessus
   d'une ligne, le navigateur considère la zone comme non déposable et annule le glisser.
   Pendant ce temps `hoverGap` (`Home.tsx:45`) n'est jamais remis à zéro en quittant
   l'interstice — l'écran annonce une cible qui ne recevra rien.

## Principe du correctif

**L'interstice reste l'unité de dépôt ; c'est le ciblage qui devient tolérant.**

Chaque ligne devient une zone de dépôt qui se résout en un interstice selon la position
verticale du curseur : moitié haute ⇒ interstice au-dessus, moitié basse ⇒ interstice en
dessous. Le groupe entier sert de repli (fin de groupe), ce qui rend un univers vide ou
son en-tête atteignables. `BoardGap` redevient ce qu'il aurait dû rester : un indicateur.

```
<section class="uni">                 ← repli : fin de groupe
  .uni-head
  <div wrapper>                       ← cible précise, stopPropagation
    <BoardGap index={i}/>             ← purement visuel
    <div class="board-row" draggable/>
  </div>                                curseur < milieu ⇒ i, sinon i+1
  ...
  <BoardGap index={n}/>               ← visuel ; le survol est capté par la section
</section>
```

## Tâches

### 1. Extraire la règle de ciblage et la tester

Nouveau `apps/web/src/dnd/gap.ts` — logique pure, testable sans DOM (la config Vitest
tourne en `environment: 'node'`, cf. `vitest.base.mts`) :

```ts
/** Moitié haute ⇒ l'interstice qui précède la ligne, moitié basse ⇒ celui qui suit. */
export function gapIndexAt(pointerY: number, rect: { top: number; height: number }, index: number): number
```

`apps/web/src/dnd/gap.test.ts` : moitié haute, moitié basse, pile au milieu (⇒ après,
comme un `<` strict), décalage correct selon `index`.

*Pourquoi un module :* même motif que `planBoardReorder` extrait vers `packages/shared`
pour #38. Ici la règle reste dans `apps/web` — c'est une décision d'écran, l'extension
n'a pas de liste de matrices (cf. le commentaire de portée dans `Global.tsx:88`).

### 2. Déplacer le dépôt du ruban vers la ligne — `Home.tsx`

- Sur le `<div>` qui enveloppe `BoardGap` + `.board-row` (`Home.tsx:277`) :
  `onDragOver` / `onDrop` avec `preventDefault()` + `stopPropagation()`, index résolu par
  `gapIndexAt(e.clientY, e.currentTarget.getBoundingClientRect(), index)`, puis
  `dropAt(universeId, group.boards[i]?.id ?? null)`.
- Sur `<section class="uni">` (`Home.tsx:196`) : mêmes gestionnaires en repli, résolus en
  fin de groupe (`index: group.boards.length`, `dropAt(universeId, null)`). C'est ce qui
  rend un groupe vide et l'en-tête d'univers déposables.
- Sur `.board-list` : `onDragLeave` qui remet `hoverGap` à `null` quand on sort vraiment
  de la liste (garde `e.currentTarget.contains(e.relatedTarget)` — sans quoi le passage
  d'un enfant à l'autre effacerait l'indicateur).
- `BoardGap` (`Home.tsx:651`) perd `dragging`, `onOver`, `onDrop` : il ne garde qu'`active`.

Inchangés : `dropAt`, `move`, `moveBoard`, les flèches clavier, la feuille d'appui long.
`moveBoard` protège déjà le dépôt sur soi-même (`if (id === beforeId) return`,
`store.ts:104`).

### 3. Stabiliser la géométrie pendant un déplacement — `styles.css`

`.board-list` reçoit `board-list--dragging` tant qu'un déplacement est en cours (même
motif que `quad--drag` sur l'écran matrice), et :

```css
.board-list--dragging .board-row:hover { transform: none; }
```

Le soulèvement au survol décale la cible au moment précis où on la vise.

### 4. Écran matrice — vérifié, pas de correctif

**Constat de l'exploration :** ce n'est pas la même panne. Le quadrant attrape le dépôt en
repli (`Matrix.tsx:413-424`), donc rien n'annule ; et le survol d'une carte n'est pas un
raté de visée mais **un troisième geste** — l'appairage (`split.over` / `split.drop`,
`Matrix.tsx:280-283`), avec son propre indicateur. L'indicateur y dit donc la vérité.

Reste le même ruban étroit (`.row-gap`, 8 px). Confort, pas correction : à traiter
séparément si le geste gêne à l'usage. Le constat sera reporté en commentaire sur #74.

## Vérification

**Automatique** — `npm run typecheck` et `npm run test` (pas de linter dans ce dépôt).

**Manuelle** (`npm run dev`, desktop) :

1. Glisser une matrice et la lâcher **au milieu d'une autre ligne** → elle se range à
   l'interstice indiqué. Moitié haute ⇒ au-dessus, moitié basse ⇒ en dessous.
2. Le trait pointillé suit le curseur **en continu**, y compris au-dessus d'une ligne, et
   désigne toujours la destination réelle.
3. Sortir de la liste pendant le déplacement → le trait disparaît.
4. Déposer sur une ligne d'un **autre univers**, puis sur son **en-tête** → la matrice
   change d'univers.
5. Créer un univers vide, y déposer une matrice → elle s'y range.
6. Sortir une matrice de son univers via le groupe « Sans univers » (visible seulement
   pendant un déplacement).
7. Déposer une matrice sur elle-même → aucun changement, aucune erreur.
8. Non-régression : flèches ↑ ↓ au clavier, feuille d'appui long au doigt (#38).
9. Non-régression écran matrice : dépôt sur une carte ⇒ appairage ; sur le fond ⇒ fin de
   case.
