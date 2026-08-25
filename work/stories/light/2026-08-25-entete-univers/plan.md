---
slug: "entete-univers"
title: "En-tête d'univers : les trois gestes (#71, #72, #73)"
created: 2026-08-25
status: "In Progress"
---

# En-tête d'univers : les trois gestes (#71, #72, #73)

## Contexte

Sur l'accueil, un univers n'est qu'un **en-tête de groupe**. Trois manques convergent
sur ce même élément, et trois tickets les décrivent séparément :

- **#71** — on ne peut pas demander « montre-moi tout ce qu'il y a là-dedans ». La vue
  existe pourtant déjà (`Scope = { kind: 'universe'; id }`, `Global.tsx:25`), avec son
  filtrage, son garde-fou sur l'univers supprimé et son sélecteur de portée. Elle n'est
  atteignable que **depuis elle-même** : tous les points d'entrée extérieurs passent
  `{ kind: 'all' }` en dur (`App.tsx:196` et `:208`). Il manque un chemin, pas une vue.
- **#72** — un univers regroupe mais ne réduit rien. Avec quatre ou cinq univers,
  l'accueil redevient la longue liste que les univers devaient rendre lisible.
- **#73** — les univers ne se réordonnent qu'aux flèches ↑ ↓ de leur en-tête. Et
  surtout : `.uni-head__actions` est en `display: none` sous `(hover: none)`
  (`styles.css:763`), sans aucun appui long branché sur l'en-tête — donc **sur mobile,
  un univers n'est aujourd'hui ni réordonnable, ni renommable, ni supprimable**.

Les trois se traitent en une passe parce que la conception du geste a été tranchée le
18/08 pour les trois à la fois, et qu'elle n'a de sens que complète : **le nom ouvre la
vue de l'univers, le chevron replie, une poignée dédiée porte le glisser**. Les livrer
séparément voudrait dire trois passes sur le même composant, avec à chaque étape un
en-tête à moitié conçu — un chevron sans poignée, un nom cliquable sans repli.

La dépendance de #73 sur #74 est levée : la PR #76 est mergée, le dépôt d'une matrice
cible désormais la ligne entière.

**Résultat visé** : un en-tête d'univers qui porte trois gestes non ambigus, tous
disponibles au doigt comme au clavier, et le trou tactile de #73 refermé au passage.

## Décisions prises en amont

| Point | Décision | Pourquoi |
|---|---|---|
| Séparation des deux couches de glisser | **État React typé**, pas de types MIME | `drag` devient `{ kind: 'board' \| 'universe'; id }`. Les deux glissers naissent dans le même composant : l'état suffit, et le typecheck le vérifie — ce qu'une chaîne MIME n'est pas. Écarte la proposition de #73, qui visait un glisser venu d'ailleurs — cas inexistant dans l'app. |
| Univers replié comme cible de dépôt | **Dossier à ressort** | Survol prolongé pendant un glisser ⇒ dépliage automatique. Motif des explorateurs de fichiers, privilégié par #72. Le minimum (déposer à l'aveugle) laissait l'utilisateur sans retour visuel. |
| Persistance du repli | **`localStorage`, par appareil** | Décidé dans #72 : un repli est un état de lecture, pas une donnée. Aucune migration, aucune écriture réseau par clic, aucun chemin d'écriture de plus à sécuriser (cf. #34). |

## Ce que le code offre déjà — à réutiliser, pas à réécrire

- **`gapIndexAt(pointerY, rect, index)`** (`apps/web/src/dnd/gap.ts`) — le ciblage
  « moitié haute / moitié basse » livré par #74. Sa signature ne sait rien des matrices :
  elle se transpose telle quelle à l'en-tête d'univers.
- **`store.reorderUniverse(id, beforeId)`** (`store.ts:257`) et **`positionBefore`**
  (`packages/shared/src/layout.ts:395`) — la persistance de l'ordre est écrite, testée,
  et déjà protégée par `persist` (revert + toast d'échec, #34). `null` = fin de liste.
- **`groupByUniverse`** (`layout.ts:80`) — l'ordre des groupes, le groupe `null` fermant
  la liste, la matrice orpheline qui y retombe.
- **`.sheet` / `.sheet__item` / `.sheet__label`** (`styles.css:188+`) et l'appui long
  (`pressStart`, `LONG_PRESS_MS`, `swallowClick`) — toute la mécanique tactile existe
  pour les matrices ; il s'agit de l'étendre, pas de l'écrire.
- **Le sélecteur de portée de la vue globale** (`Global.tsx:226`, `scopeLabel:94`) —
  affiche déjà le nom de l'univers courant. Le 2ᵉ critère d'acceptation de #71 est
  satisfait sans une ligne.
- **`useAnnounce` / `ordinal`** (`a11y/announce.tsx`) — les annonces des flèches ↑ ↓
  existent (`moveUniverse`, `Home.tsx:158`) et doivent continuer de fonctionner.

## Plan

### 1. `packages/shared` — le résumé d'un groupe replié

Un en-tête replié doit dire ce qu'il cache, sinon le repli devient un trou (#72).

- `summarizeUniverse(boards: Board[], tasks: Task[]): { boards: number; tasks: number }`
  dans `packages/shared/src/layout.ts` — compte les matrices, et les tâches **ouvertes**
  (`!done && !deleted`, la même règle que le `meta` par matrice de `Home.tsx:311`).
- Tests dans `layout.test.ts` : groupe vide, tâches cochées et supprimées exclues,
  tâches d'une matrice hors groupe ignorées.

Pourquoi dans `shared` et pas en ligne dans l'accueil : c'est le pli du dépôt pour toute
règle d'agrégation (`countOpen`, `orderedBoards`, `planBoardReorder`), et ça lui donne
des tests.

### 2. `apps/web/src/dnd/gap.ts` — la cible de dépôt d'un univers

`gapIndexAt` donne l'**interstice** survolé ; reste à en déduire l'`beforeId` attendu par
`reorderUniverse`, et à reconnaître le déplacement nul.

- `dropTarget<T extends { id: string }>(list, draggedId, gapIndex): string | null | false`
  — `false` quand l'interstice borde la position actuelle (`gapIndex === from` ou
  `from + 1`) : déposer un univers juste au-dessus ou juste en-dessous de lui-même ne
  doit pas produire d'écriture. Sinon `list[gapIndex]?.id ?? null`.
- Tests dans `gap.test.ts`, à côté de ceux de `gapIndexAt`.

Volontairement **pas** appliqué au dépôt des matrices (`dropAt`, `Home.tsx:71`) : là le
groupe d'arrivée peut changer, et le raccourci « déplacement nul » n'y est pas valide.

### 3. #71 — le nom ouvre la vue de l'univers

- `onGlobal` prend une portée : `(scope: Scope) => void` dans `Home.tsx` et
  `Matrix.tsx:55`. Les trois appels de `App.tsx` (`:196`, `:202`, `:208`) passent
  explicitement leur portée ; le bouton « Vue globale » de l'accueil et celui de la
  matrice passent `{ kind: 'all' }`.
- `.uni-head__name` passe de `<span>` à `<button>`, avec un nom accessible explicite
  (`aria-label={'Voir toutes les tâches de « X »'}`) — le nom seul ne dit pas ce que le
  clic fait.
- Le groupe **« Sans univers » reste un `<span>`** : `Scope` ne sait pas le représenter,
  et il n'y a rien à ouvrir.
- Le renommage n'est pas mangé : il vit dans `.uni-head__actions`, pas sur le nom.
- CSS : réinitialisation de bouton sur `.uni-head__name` (typographie inchangée),
  affordance au survol et `:focus-visible`.

### 4. #72 — le chevron replie

- État `collapsed: Set<string>`, clé = id d'univers, ou `'none'` pour « Sans univers » —
  ce groupe se replie aussi : c'est celui qui accumule le plus de matrices non rangées,
  donc celui qui en a le plus besoin.
- Persistance `localStorage`, clé `penduline:universes-collapsed` (tableau d'ids JSON).
  Lecture par une fonction pure sur le modèle de `readView` (`App.tsx:120`) : elle sert
  d'initialiseur à `useState` et **retombe sur « rien de replié »** à la moindre anomalie
  (storage verrouillé en navigation privée, JSON corrompu, forme inconnue). Écriture dans
  un `useEffect`, `try/catch` muet — perdre la mémoire d'un repli est un désagrément, pas
  une panne.
- Chevron `<button aria-expanded={!isCollapsed}>` **avant** le nom, hors de
  `.uni-head__actions` : ce groupe est masqué au survol, or le chevron doit exister au
  doigt (#71 le signale explicitement).
- Replié : ni `group.boards.map(...)`, ni l'interstice de fin. À la place,
  `.uni-head__summary` — « 3 matrices · 12 tâches », via `summarizeUniverse`.
- **Dossier à ressort** : pendant un glisser de matrice, un `dragover` prolongé
  (~700 ms) sur un en-tête replié le déplie. Minuteur annulé au `dragleave`, au `drop`
  et au `dragend`, sur le modèle de `pressTimer`.
- Déposer sur un en-tête replié range déjà la matrice en fin de groupe : le
  gestionnaire de la section `.uni` (`Home.tsx:213`) capte ce cas sans modification.
- Pas de garde « ne pas replier pendant un glisser » demandé par #72 : pendant un
  glisser HTML5 le navigateur supprime les événements de souris, aucun `click` ne peut
  atteindre le chevron. À vérifier à la validation plutôt qu'à coder à l'aveugle.

### 5. #73 — la poignée et les interstices d'univers

- `drag` passe de `string | null` à `{ kind: 'board' | 'universe'; id: string } | null`.
  Chaque zone de dépôt existante gagne sa garde `if (drag?.kind !== 'board') return;` —
  la ligne de matrice (`:317`, `:326`), la section `.uni` (`:205`, `:211`), le
  `onDragLeave` de `.board-list` (`:196`).
- `.uni-head__grip` — seule zone `draggable` de l'en-tête, `aria-hidden="true"` (le
  clavier est servi par les flèches ↑ ↓, une poignée focusable ne lui offrirait rien),
  masquée sous `(hover: none)` où le glisser HTML5 ne fonctionne pas.
- Nouvel état `hoverUniGap: number | null` et composant `UniGap` sur le modèle de
  `BoardGap` (`Home.tsx:687`) — un repère, pas une cible.
- Ciblage : l'**en-tête** capte `dragover`/`drop` quand `drag.kind === 'universe'`,
  via `gapIndexAt` sur son propre rectangle, puis `dropTarget` → `reorderUniverse`.
  Même geste que pour les matrices depuis #74 : on vise une ligne, pas un ruban.
- L'en-tête « Sans univers » accepte le dépôt et signifie « à la fin »
  (`beforeId = null`) : il ferme toujours la liste, il n'y a pas d'après.
- Aucune annonce sur le glisser, comme pour les matrices : le retour est visuel. Les
  annonces restent sur les flèches et la feuille.

### 6. Le trou tactile — feuille d'appui long et actions au focus

- `sheet` passe de `string | null` à `{ kind: 'board' | 'universe'; id: string } | null` ;
  `pressStart` prend le `kind`. `onPointerDown`/`onPointerUp` sur `.uni-head`,
  `swallowClick` neutralisant le clic que l'appui long déclenche — sinon l'appui long sur
  le nom ouvrirait aussi la vue globale.
- Feuille d'univers : ↑ Monter · ↓ Descendre · Renommer · Supprimer · Annuler, avec les
  mêmes entrées inertes-mais-visibles aux bornes (`sheet__item:disabled`) que celle des
  matrices. Pas d'entrée « Replier » : le chevron est atteignable au doigt.
- Pas de bouton `⋯` sur l'en-tête : contrairement aux matrices, rien dans cette feuille
  n'est absent de `.uni-head__actions` — la porte clavier existe déjà.
- **`.uni-head__actions` sous `(hover: none)`** : remplacer `display: none` par le motif
  déjà corrigé pour `.board-row__actions` (`styles.css:180`) — `max-width: 0` au survol,
  révélation au `:focus-within`. Un `display: none` retire les actions de l'arbre
  d'accessibilité, or une tablette munie d'un clavier rapporte elle aussi `hover: none`
  et perdait ainsi son seul chemin clavier. C'est le même défaut que #38 avait jugé
  faux pour les matrices, resté en place ici.
- CSS de la feuille, du chevron, de la poignée et du résumé ; `prefers-reduced-motion`
  déjà couvert par les règles existantes de `.sheet`.

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `packages/shared/src/layout.ts` + `layout.test.ts` | `summarizeUniverse` |
| `apps/web/src/dnd/gap.ts` + `gap.test.ts` | `dropTarget` |
| `apps/web/src/screens/Home.tsx` | l'essentiel : en-tête, repli, deux couches de glisser, feuille |
| `apps/web/src/App.tsx` | `onGlobal` prend une `Scope` (3 appels) |
| `apps/web/src/screens/Matrix.tsx` | signature `onGlobal` |
| `apps/web/src/styles.css` | `.uni-head__*`, `.uni-gap`, correctif `(hover: none)` |

Hors périmètre : l'extension ne fait que **lire** les univers
(`apps/extension/src/App.tsx:214`, groupes filtrés, aucun geste) — rien à y changer.

## Vérification

**Portes qualité** — `npm run typecheck`, `npm test` (97 tests aujourd'hui, + ceux de
`summarizeUniverse` et `dropTarget`), `npm run build` sur les 3 workspaces. Pas de
linter dans ce dépôt.

**Validation manuelle** — à faire dans le navigateur (le MCP chrome-devtools s'est
déconnecté, la validation ne peut pas être pilotée depuis ici comme sur #34) :

1. **Compte sans aucun univers** : l'accueil se lit exactement comme avant — aucun
   en-tête, aucun chevron.
2. Clic sur le nom d'un univers ⇒ vue globale filtrée, le sélecteur de portée affichant
   cet univers.
3. « Renommer » sur ce même en-tête fonctionne toujours : le nouveau geste n'a pas mangé
   l'ancien.
4. Chevron : replie et déplie ; l'en-tête replié annonce « N matrices · M tâches » ;
   `aria-expanded` bascule.
5. Rechargement ⇒ le repli survit. Autre navigateur ou navigation privée ⇒ repli
   indépendant, et rien ne casse si `localStorage` est refusé.
6. Glisser une matrice sur un univers **replié** ⇒ dépliage après ~0,7 s, puis dépôt en
   fin de groupe. Sans attendre le dépliage, le dépôt range quand même.
7. Glisser un univers par sa poignée ⇒ réordonnancement persisté, retrouvé après
   rechargement et dans l'ordre de la vue globale (`orderedBoards`). Déposer un univers
   dans un interstice de matrices, et une matrice dans un interstice d'univers :
   **les deux doivent être refusés**.
8. Clavier seul : tabulation révèle les actions de l'en-tête, ↑ ↓ réordonnent, l'annonce
   au lecteur d'écran est toujours émise.
9. **Mobile (390 px)** : appui long sur un en-tête d'univers ⇒ feuille avec monter,
   descendre, renommer, supprimer. Le chevron est atteignable au doigt. L'appui long sur
   le nom n'ouvre **pas** la vue globale au relâchement.
10. `prefers-reduced-motion` : aucune animation de feuille ni de repli.
