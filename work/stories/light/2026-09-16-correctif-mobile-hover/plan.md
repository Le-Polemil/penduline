---
story: "Correctif Mobile 2/3 — les états de survol"
story_code: "correctif-mobile-hover"
created: 2026-09-16
status: "In Progress"
---

# #90 — Correctif Mobile 2/3 : les états de survol

## Contexte

Deuxième des trois passes mobile. Celle-ci ne traite qu'une cause, mais elle
produit beaucoup de symptômes : sur un écran tactile, `:hover` ne se comporte pas
comme à la souris — il se **colle**. Un tap le déclenche, et l'élément le garde
jusqu'au tap suivant ailleurs. Tout ce qui n'existe qu'au survol devient donc soit
figé en position ouverte, soit purement inatteignable.

#89 a corrigé la géométrie et les cibles ; il reste la cause.

## Inventaire constaté

Relevé statique sur `apps/web/src/styles.css` et vérifié en émulation
(390 × 844, tactile, `matchMedia('(hover: none)')` → vrai).

### A — 57 règles `:hover`, et **aucune** gardée

`grep -c ':hover'` donne 57 occurrences. `grep 'hover: hover'` en donne **zéro** :
pas une seule n'est conditionnée à un pointeur précis. Six blocs
`@media (hover: none)` existent, mais ils traitent des cas particuliers
(`.board-row__actions`, `.uni-head__*`, `.task__act`, la revue, les stats, le
flyout) — jamais la règle générale.

**Mesuré au doigt** : après un tap sur le `⋯` d'une carte, il garde
`background: rgb(255, 242, 235)` (`--color-accent-100`, son état de survol) alors
que son voisin non tapé est transparent. `document.querySelectorAll(':hover')`
renvoie 13 éléments **après** le tap — la pile survolée reste celle du dernier
contact.

Les plus visibles :

| Règle | Ce qui reste figé |
|---|---|
| `.board-row:hover` | La ligne reste soulevée de 2 px et ombrée |
| `.task__check:hover` | La case reste agrandie de 15 % |
| `.sub__check:hover` | Idem, 20 % |
| `.move-btn:hover` | Le bouton de case reste agrandi et ombré |
| `.sub__item:hover` | L'étape garde son ombre |
| `.att__link:hover` | Le lien reste souligné |
| ~30 fonds de survol | `.crumb`, `.bin-btn`, `.searchbtn`, `.signout`, `.board-act`, `.board-menu__item`, `.task-menu__action`, `.stats-period`, `.review-board`… |

### B — Deux actions sans aucune porte au doigt

| Action | Sélecteur | État tactile |
|---|---|---|
| Détacher un lien | `.att__del` | `opacity: 0`, révélé par `.att__chip:hover` |
| Supprimer une étape | `.sub__del` | `opacity: 0`, révélé par `.sub__item:hover` |

Les deux ont un repli `:focus-visible` — donc un chemin **clavier** — mais rien au
doigt. Mesuré : opacité `0` sous émulation tactile.

### C — Le sous-menu d'univers, piloté par la souris

`TaskCard.tsx:591-592` monte `onMouseEnter` / `onMouseLeave` sans condition. Un
repli au clic existe déjà (`onClick` sur `.task-menu__uni-head`), et le CSS
transforme le flyout en dépliage en place sous `(hover: none)` — mais les deux
gestionnaires de souris restent montés au doigt, où ils se superposent au clic.

### D — Les infobulles natives, jamais affichées au doigt

`title=` ne s'affiche pas sur un écran tactile. Deux usages portent de
l'information et non de la décoration :

- `focus.refusal` sur le bouton « Faire aujourd'hui » — **le motif du refus est
  perdu**. Le menu `⋯` porte bien le même motif dans `.task-menu__why`, donc
  l'information existe ailleurs : c'est le bouton du bandeau (#89) qui doit se
  taire proprement.
- le titre complet d'une tâche tronquée — couvert par le dépliage au tap (#95).

### E — Les raccourcis clavier affichés au doigt

`.task-menu__key` montre `Alt+↑` / `Alt+↓` dans le menu `⋯`. Sans clavier, deux
colonnes de texte sans objet (repéré pendant #89).

## Décisions prises

- **On ne supprime pas le survol, on le conditionne** —
  `@media (hover: hover) and (pointer: fine)`, comme le ticket le demande.
- **Les wrappers restent EN PLACE**, au contact de leur composant, plutôt que
  regroupés en fin de fichier. `styles.css` est organisé par composant et chaque
  règle porte son commentaire d'intention : les déplacer dissocierait les deux, et
  changerait l'ordre de cascade de 45 règles d'un coup.
- **Les deux croix cachées deviennent visibles au doigt**, atténuées à 55 % —
  exactement le traitement que `.task__act` reçoit déjà sous `(hover: none)`
  (styles.css:1502-1507). Elles se voient, donc on sait qu'elles existent.

## Travaux

### 1. Publier l'inventaire sur #90
Reporter la section « Inventaire constaté » dans le corps de l'issue.

### 2. Conditionner le survol — `apps/web/src/styles.css`
Envelopper chaque règle `:hover` d'un
`@media (hover: hover) and (pointer: fine) { … }`, en groupant les règles
adjacentes sous un même bloc pour ne pas gonfler le fichier.

**Trois exceptions à ne pas envelopper :**

- `a:hover` — changement de couleur d'un lien, sans effet de forme ; le garder
  hors garde ne coûte rien et évite de conditionner une règle de base du document.
- `:focus-visible` et `:focus-within` — ils ne sont pas du survol, et ce sont eux
  qui donnent le chemin clavier ; ils doivent **rester hors** de la garde, sans
  quoi le clavier perdrait ce que #38 lui avait rendu.
- `.board-list--dragging .board-row:hover:not(.board-row--dragging)` — c'est un
  contournement du survol FIGÉ pendant un glisser (styles.css:145-152), donc
  desktop par nature ; il tombe naturellement dans la garde avec sa règle de base.

**Piège** : plusieurs règles de survol n'existent que pour battre une règle de
base à spécificité égale (`.board-more:hover`, `.task__act:disabled:hover`). Les
envelopper ne change pas leur spécificité, donc pas leur priorité — mais il faut
vérifier qu'aucune n'est enveloppée **sans** sa règle jumelle.

### 3. Les deux croix, visibles au doigt — `styles.css`
Sous `(pointer: coarse)` : `.att__del` et `.sub__del` passent à `opacity: 0.55`.
Leur zone de frappe de 44 px existe déjà depuis #89.

### 4. Le sous-menu d'univers — `TaskCard.tsx`
Ne monter `onMouseEnter` / `onMouseLeave` que sur pointeur fin, en réutilisant
`useTelephone`… non : c'est une question de POINTEUR et non de largeur. Ajouter à
`data/useBalayage.ts` un `usePointeurFin()` bâti sur le même `matchMedia` que
`useTelephone` (`(hover: hover) and (pointer: fine)`), et le lire ici. Le repli au
clic existe déjà et devient le seul chemin au doigt.

### 5. Le bouton « aujourd'hui » du bandeau — `TaskCard.tsx`
Quand `focus.refusal` est posé, le bouton est désactivé et son seul porteur du
motif est un `title` que le doigt ne verra jamais. Son `aria-label` porte déjà le
motif — il faut que le **libellé accessible** reste le motif, et que le bouton se
lise comme inerte (il l'est déjà via `:disabled`). Vérifier qu'aucun motif ne
disparaît, et laisser le menu `⋯` porter l'explication écrite.

### 6. Les raccourcis clavier — `styles.css`
`.task-menu__key { display: none }` sous `(hover: none)`.

## Vérification

**Automatique** — `npm run typecheck`, `npm test`, `npm run build`.

**Manuelle, en A/B DevTools** :

1. **390 × 844, tactile** — taper une carte, puis vérifier que
   `document.querySelectorAll(':hover').length` retombe à 0 pour tout ce qui
   porte un effet visible ; le `⋯` tapé ne garde plus de fond.
2. **Taper une case à cocher** — elle ne reste pas agrandie.
3. **Accueil** — taper une ligne de matrice n'y laisse pas un soulèvement figé.
4. **Pastille de lien et étape** — les deux croix se voient, atténuées, et un tap
   dessus détache / supprime.
5. **Menu `⋯` au doigt** — plus de `Alt+↑ / Alt+↓` ; un univers se déplie et se
   replie au tap, sans état collé.
6. **1440 × 900, souris** — tout le survol est **inchangé** : c'est le seul vrai
   risque de ce lot, il faut repasser les six écrans.
7. **Clavier, desktop** — `Tab` révèle toujours les actions d'une ligne de matrice
   et d'un en-tête d'univers : `:focus-within` n'a pas été emporté par la garde.

## Hors périmètre

- Les animations et leurs durées → #91.
- La case à cocher sans contour sur « Aujourd'hui » et « Revue » → #92.
