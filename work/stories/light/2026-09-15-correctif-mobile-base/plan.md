---
story: "Correctif Mobile 1/3 — la base"
story_code: "correctif-mobile-base"
created: 2026-09-15
status: "Done"
---

# #89 — Correctif Mobile 1/3 : la base

## Contexte

L'application est conçue et relue au clavier sur grand écran ; le mode mobile n'a
jamais été audité. Ce ticket couvre ce qui est cassé **avant toute interaction** :
dimensions, débordements, zones tactiles, lisibilité. Les états de survol collants
partent en #90, les animations en #91, le desktop en #92.

L'audit a été mené en émulation Chrome DevTools, 390 × 844, DPR 3, `hasTouch`, en
A/B avec 1440 × 900, sur une base locale enrichie de cas limites (titres longs,
échéances, paires, pièces jointes, étapes, corbeille remplie).

## Inventaire constaté

### A — Débordement horizontal

1. **En-tête de matrice** (`.matrix-head`, styles.css:330) — aucun `flex-wrap`, et
   `.board-switch__name` est en `white-space: nowrap`. Sur la vue globale :
   `scrollWidth` = 471 px pour 390. « 28 tâches ouvertes » est coupé et **le bouton
   corbeille est entièrement hors écran, donc inatteignable**. Sur une matrice au
   nom court ça passe de justesse — le défaut est donc invisible jusqu'à ce qu'un
   nom s'allonge.

2. **Ligne de paire** (`.card-row`, styles.css:451) — deux cartes côte à côte à
   390 px : `scrollWidth` = 400 px, le `⋯` de la seconde carte sort de la case.

### B — Contenu tronqué

3. **Le titre d'une carte reçoit 91 px sur 306** (30 %). Avec un badge d'échéance :
   13 px. Dans une paire : 0 px. Cause : sous `(hover: none)` les deux raccourcis
   `.task__act` passent à 44 × 44 (styles.css:1502-1507), soit 88 px, auxquels
   s'ajoutent la poignée, la case, le `⋯` et cinq gouttières. **Deux raccourcis
   occupent plus de largeur que le contenu.**

4. **Pastilles de compteur coupées** sur une ligne de matrice au nom long (accueil,
   « Déménagement »).

### C — Cibles tactiles sous 44 × 44 (mesurées)

| Famille | Éléments |
|---|---|
| Carte | `.task__check` 18×18 · `.task__more` 26×18 |
| Menu `⋯` | `.task-menu__action` h=28,5 (dont « Supprimer ») · `.move-btn` h=32,5 |
| En-tête | `.crumb` 60×18 · `.board-switch__name` h=30 · `.bin-btn` 58×32 |
| Barre du haut | `.searchbtn` · `.signout` h=29,5 |
| Accueil | `.uni-head__fold` 20×20 · `.uni-head__name` h=22,5 · `.home-global` h=40 · `.add-board` h=39,5 |
| Corbeille | `.bin-close` 31×26 · `.bin-check` 15×15 · `.bin-restore` h=22,5 · `.bin-foot__link` h=27 |
| Divers | `.att__link` h=19 · `.add-plus` 27×19 · `.sub__toggle` 41×20 |

### D — Champs de saisie : zoom automatique iOS

10 des 14 déclarations de champ sont sous 16 px (`.add-input` 12,5 · `.att__input`
12 · `.due-edit__input` 12 · `.sub__input` 12,5 · `.auth-card input` 14 · …). iOS
zoome la page à chaque mise au point, et n'en ressort pas seul.

### E — Marges de sécurité

`env(safe-area-inset-*)` n'apparaît **qu'une seule fois** dans tout le projet
(`.sheet`, styles.css:227), alors que `index.html` déclare `viewport-fit=cover`.
Conséquences : `.userbar` passe sous la barre d'état, `.toast-stack`
(`bottom: 26px`) sous la barre gestuelle, et en paysage rien ne tient compte des
encoches latérales.

### F — Unités de viewport

`.auth { min-height: 100vh }` (styles.css:816) déborde sous la barre d'URL mobile.

## Décisions prises

- **Le titre récupère sa place par un geste**, pas par la suppression d'une
  fonction : sous 720 px, la carte glisse vers la gauche et découvre un bandeau de
  trois boutons de 44 px — étape, aujourd'hui, échéance.
- **La poignée `⠿` disparaît sous 720 px**, pas sous `(hover: none)`. Le glisser
  HTML5 ne se déclenche pas depuis le tactile sur iPhone et Android, mais **il
  fonctionne sur iPad** (Safari, depuis iOS 11, par appui long). La largeur sépare
  les deux cas proprement — iPhone ≤ 430, iPad ≥ 768 — là où `(hover: none)` les
  confond.
- **Une paire s'empile** sous 720 px, et la marque de lien bascule à la verticale,
  **alignée sur la colonne des cases à cocher** et non au centre.

### Le conflit swipe / glisser-déposer, et pourquoi il n'a pas lieu

Les deux gestes sont bornés au **même seuil de 720 px, mais de part et d'autre** :

| | ≤ 720 px (téléphone) | > 720 px (iPad, desktop) |
|---|---|---|
| Poignée `⠿` | masquée | visible |
| Glisser HTML5 | ne se déclenche pas | seul geste horizontal |
| Balayage de carte | seul geste horizontal | non monté |

Ils ne coexistent donc jamais sur un même écran. Trois gardes s'y ajoutent :

- `touch-action: pan-y` sur la carte — le navigateur garde le défilement vertical
  et nous laisse l'axe horizontal, sans avoir à annuler un événement passif ;
- un seuil de 10 px avant d'armer le geste, et le `click` est avalé si la carte a
  bougé — sans quoi un balayage déclencherait le dépliage du titre
  (`useTitreDepliable`) ;
- `draggable` est désarmé sous 720 px, pour qu'aucune API ne se dispute l'axe.

## Travaux

### 1. Publier l'inventaire sur #89
Reporter la section « Inventaire constaté » dans le corps de l'issue, comme le
ticket le demande.

### 2. En-tête de matrice — `apps/web/src/styles.css`
`.matrix-head` en `flex-wrap: wrap`, `.board-switch` en `min-width: 0; flex: 1 1 auto`
pour que `.board-switch__label` puisse enfin ellipser (il porte déjà
`text-overflow`, mais son parent ne rétrécit jamais). Vérifier que le bouton
corbeille reste atteignable sur la vue globale à 390 px.

### 3. Paire empilée — `apps/web/src/styles.css`
Sous 720 px : `.card-row` en colonne, et `.card-row--paired::before` passe d'un
tiret horizontal centré à un tiret **vertical calé sur l'axe des cases à cocher**
(≈ 22 px du bord gauche de la carte), hauteur 10 px, `border-left` au lieu de
`border-top`.

### 4. Balayage de carte — nouveau `apps/web/src/data/useBalayage.ts`
Hook sur Pointer Events : `pointerdown` mémorise l'origine, `pointermove` suit le
doigt en `transform: translateX()` (propriété composée, pas de `left`), `pointerup`
décide. La décision est une **fonction pure exportée et testée**
(`apps/web/src/data/useBalayage.test.ts`), sur le modèle de `dnd/gap.ts` :
`etatApres(dx, largeur) → 'ouvert' | 'ferme'`, seuil à la moitié du bandeau.

Le retour de la carte à sa place honore `prefers-reduced-motion` (le suivi du
doigt, lui, est de la manipulation directe, pas une animation).

### 5. Bandeau d'actions — `apps/web/src/components/TaskCard.tsx`
Structure ajoutée **dans** `.task-anchor`, de sorte que `.task-menu` reste hors du
conteneur clippé :

```
.task-anchor
  ├── .task-swipe            position: relative; overflow: hidden
  │     ├── .task-swipe__actions   position: absolute; right: 0; inset-block: 0
  │     └── .task                  transform: translateX(dx)
  └── .task-menu             inchangé
```

L'ombre de la carte migre sur `.task-swipe` sous 720 px : un parent clippant
couperait le `box-shadow` de `.task`.

Une seule carte ouverte à la fois — état tenu par l'écran, exactement comme
`menuOpen` / `onMenu` (Matrix.tsx:407-408, Global.tsx). Les boutons du bandeau sont
`aria-hidden` et hors tabulation tant qu'il est fermé.

Attention : `.task` porte `viewTransitionName: vt-{id}` (TaskCard.tsx:270) — vérifier
qu'un balayage en cours pendant une transition de vue ne laisse pas la carte
décalée.

### 6. Carte tactile — `TaskCard.tsx` + `styles.css`
Sous 720 px : poignée `⠿` masquée, `.task__act` retirés de la carte (ils vivent dans
le bandeau), `.task__check` et `.task__more` gardent leur taille visuelle mais
gagnent une zone de frappe de 44 px. `.task__today--on` reste — c'est un marqueur
d'état, pas une commande — mais sans zone de frappe propre.

### 7. « Ajouter une étape » dans le menu `⋯` — `TaskCard.tsx`
L'action n'existe **que** sur la carte aujourd'hui (TaskCard.tsx:363-378). Elle
rejoint le menu, à côté de « Attacher un lien », pour qu'il reste un chemin sans
geste — une tablette avec clavier rapporte `hover: none` et n'a pas de doigt.

### 8. Cibles tactiles restantes — `styles.css`
Sous `(pointer: coarse)`, porter à 44 px les familles du tableau C. Technique :
`min-height` explicite là où l'élément est seul sur sa ligne (le projet le fait déjà,
styles.css:1274-1279), et extension de la zone de frappe par un `::after` en
`position: absolute; inset: -Npx` là où grossir déformerait le dessin (case à cocher,
`⋯`, chevron de repli, croix de corbeille). Ne pas toucher au rendu desktop.

### 9. Champs de saisie — `styles.css`
Sous `(pointer: coarse)` — et non sous une largeur : l'iPad zoome aussi — porter à
16 px les 10 déclarations concernées. La typographie desktop ne bouge pas.

### 10. Marges de sécurité et unités — `styles.css`
- `.userbar` : `padding-top: max(14px, env(safe-area-inset-top))`
- conteneurs d'écran (`.home`, `.matrix`, `.review`, `.stats`, `.focus`) :
  `padding-inline: max(24px, env(safe-area-inset-left/right))`
- `.toast-stack` : `bottom: calc(26px + env(safe-area-inset-bottom))`
- `.auth` : `min-height: 100dvh`

## Vérification

**Automatique** — `npm run typecheck` et `npm run test` à la racine (vitest sur les
trois workspaces), dont le nouveau `useBalayage.test.ts`.

**Manuelle, en A/B DevTools** (base locale de démo, `.env.local` pointant la stack
Supabase locale) :

1. **390 × 844, tactile** — accueil, matrice, vue globale, aujourd'hui, revue,
   rétrospective, corbeille, recherche : `document.scrollWidth` doit valoir 390 sur
   chacun, et plus aucun élément interactif visible sous 44 px.
2. **Vue globale à 390 px** — le bouton corbeille est visible et cliquable.
3. **Carte** — le titre d'une tâche à échéance se lit ; un balayage vers la gauche
   découvre les trois actions, un balayage inverse les referme, un tap ailleurs
   aussi. Un balayage ne déplie pas le titre.
4. **Défilement** — un geste vertical sur une carte fait défiler la page sans ouvrir
   le bandeau.
5. **Paire** — les deux cartes sont empilées, le trait de lien tombe dans l'axe des
   cases à cocher.
6. **1440 × 900, souris** — les six écrans sont inchangés : poignée présente,
   raccourcis sur la carte, paires côte à côte, aucun bandeau monté.
7. **834 × 1112 (iPad)** — poignée présente, aucun balayage, champs à 16 px.
8. **`prefers-reduced-motion`** — le retour de carte ne s'anime plus.

## Hors périmètre, constaté au passage

- **Case à cocher invisible sur « Aujourd'hui » et « Revue »** : `--q-ink` n'est posé
  que sur `.quad` (Matrix.tsx:588, Global.tsx:381), or ces deux écrans rendent des
  `TaskCard` hors quadrant. `border: 2px solid var(--q-ink)` devient alors invalide
  au calcul et **tout le raccourci `border` tombe** — la case n'a plus de trait du
  tout, sur mobile comme sur desktop. → #92.
- Le `⋯` du menu affiche les raccourcis `Alt+↑ / Alt+↓`, sans objet au doigt. → #90.
- Bouton d'effacement natif bleu dans le champ de recherche, hors palette. → #92.
