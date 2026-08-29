---
slug: "entete-univers"
title: "En-tête d'univers : les trois gestes (#71, #72, #73)"
created: 2026-08-25
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. `packages/shared` : `summarizeUniverse` + tests dans `layout.test.ts` | Terminé | 2026-08-25 |
| 2. `apps/web/src/dnd/gap.ts` : `dropTarget` + tests dans `gap.test.ts` | Terminé | 2026-08-25 |
| 3. #71 — `onGlobal` prend une `Scope` (`App.tsx`, `Matrix.tsx`) ; le nom d'univers devient un bouton (+ CSS) | Terminé | 2026-08-25 |
| 4. #72 — chevron `aria-expanded`, repli, persistance `localStorage`, résumé de l'en-tête replié (+ CSS) | Terminé | 2026-08-25 |
| 5. #72 — dossier à ressort : dépliage au survol prolongé pendant un glisser de matrice | Terminé | 2026-08-25 |
| 6. #73 — `drag` en union discriminée + gardes `kind` sur toutes les zones de dépôt existantes | Terminé | 2026-08-25 |
| 7. #73 — poignée `.uni-head__grip`, interstices d'univers, réordonnancement au dépôt (+ CSS) | Terminé | 2026-08-25 |
| 8. Trou tactile — `sheet` en union discriminée, appui long sur l'en-tête d'univers (+ CSS) | Terminé | 2026-08-25 |
| 9. Trou tactile — `.uni-head__actions` : correctif `(hover: none)` sur le motif de #38 | Terminé | 2026-08-25 |
| 10. Portes qualité : `typecheck` + `test` + `build` sur les 3 workspaces | Terminé | 2026-08-25 |

## Journal

### 2026-08-25 : `summarizeUniverse` dans le paquet partagé

**Statut** : Terminé

**Actions réalisées** :
- `summarizeUniverse(boards, tasks) → { boards, tasks }` placée juste après `orderedBoards`,
  dans la zone « univers » de `layout.ts`.
- 6 tests : cas nominal, groupe vide, exclusion cochées / archivées / supprimées, tâches
  épinglées comptées, matrices hors groupe ignorées, toutes cases confondues.

**Fichiers modifiés** :
- `packages/shared/src/layout.ts`
- `packages/shared/src/layout.test.ts`

**Notes** : deux décisions de signature.

La fonction prend **les matrices du groupe**, pas un `universeId`. Le groupe « Sans
univers » n'a pas d'identifiant, et c'est justement celui qui accumule le plus de matrices
non rangées — donc celui qui a le plus besoin d'être replié. Un paramètre `universeId`
l'aurait exclu d'office.

« Ouverte » se dit `!done && !deleted`, comme dans `countOpen`, mais **sans filtre de
case** : un en-tête replié parle de l'univers entier. Un test verrouille explicitement
cette différence avec `countOpen`, sinon quelqu'un la refermera un jour par symétrie. Les
tâches épinglées comptent — elles restent à faire — et un test le dit aussi, parce que
`isVisible` les exclut, lui, et que la proximité des deux règles invite à la confusion.

`index.ts` fait déjà `export * from './layout'` : rien à y ajouter.
`npm test -w @penduline/shared` : 95 tests verts (89 avant).

### 2026-08-25 : `dropTarget` — de l'interstice au `beforeId`

**Statut** : Terminé

**Actions réalisées** :
- `dropTarget(list, draggedId, gapIndex)` dans `apps/web/src/dnd/gap.ts`, à côté de
  `gapIndexAt` dont elle consomme la sortie.
- 8 tests, dont un dédié à la seule confusion qui casse la fonction (cf. notes).

**Fichiers modifiés** :
- `apps/web/src/dnd/gap.ts`
- `apps/web/src/dnd/gap.test.ts`

**Notes** : trois retours, pas deux — `'x'` (insérer avant `x`), `null` (à la fin), `false`
(ne rien faire). `null` et `false` sont tous deux *falsy*, et c'est précisément le piège :
un `if (!target) return` avalerait « déposer en dernier ». Un test verrouille cette
distinction en opposant les deux cas sur le même interstice de fin — `dropTarget(list,
'a', 3)` vaut `null`, `dropTarget(list, 'c', 3)` vaut `false`.

La règle du déplacement nul : les **deux** interstices qui bordent l'élément déplacé
(`from` et `from + 1`) désignent sa place actuelle. Sans ce filtre, tout geste avorté
— on soulève un univers et on le repose — produirait une écriture réseau pour un ordre
inchangé à l'écran.

`list` reçoit la liste **affichée**, élément déplacé compris, et non une liste déjà
amputée : c'est ce qui permet de comparer `gapIndex` à `from`. Un élément absent de la
liste n'a pas de place à border — tous ses interstices sont alors de vrais déplacements,
et c'est le cas défensif testé.

Volontairement pas appliquée au dépôt des matrices (`dropAt`) : là le groupe d'arrivée
peut changer, et « même interstice » n'y veut pas dire « même place ».
`npm test -w @penduline/web` : 21 tests verts (13 avant).

### 2026-08-25 : #71 — le nom ouvre la vue de l'univers

**Statut** : Terminé

**Actions réalisées** :
- `onGlobal` passe de `() => void` à `(scope: Scope) => void` dans `Home` et `MatrixScreen` ;
  les deux appels de `App.tsx` transmettent la portée reçue au lieu de coder `{ kind: 'all' }`.
- Le menu de matrice et le bouton « Vue globale » de l'accueil passent explicitement
  `{ kind: 'all' }`.
- `.uni-head__name` devient un `<button>` quand l'univers existe, avec
  `aria-label={'Voir toutes les tâches de « X »'}`. Reste un `<span>` pour « Sans univers ».
- CSS : remise à zéro du bouton sur la classe commune, affordance au survol et
  `:focus-visible`, ciblées par `button.uni-head__name` pour ne pas toucher le `<span>`.

**Fichiers modifiés** :
- `apps/web/src/App.tsx`
- `apps/web/src/screens/Home.tsx`
- `apps/web/src/screens/Matrix.tsx`
- `apps/web/src/styles.css`

**Notes** : le ticket avait raison sur le diagnostic — il ne manquait qu'un chemin. La vue
scopée, son filtrage, son garde-fou sur l'univers supprimé et son sélecteur de portée
existaient déjà (#18) ; le 2ᵉ critère d'acceptation (« le sélecteur affiche bien cet
univers ») est satisfait sans une ligne, `scopeLabel` lisant déjà `universe?.name`.

Trois décisions au passage :

- **Une seule classe CSS pour les deux formes** (`<button>` / `<span>`) plutôt qu'un
  modificateur. La remise à zéro du bouton (`border`, `background`, `padding`) est inerte
  sur un `<span>`, et les règles propres au bouton sont ciblées par `button.uni-head__name`.
  Un modificateur aurait dupliqué la typographie.
- **Le menu de matrice ouvre `{ kind: 'all' }`, pas l'univers de la matrice courante.**
  Ce menu sert à élargir le regard ; resserrer sur un univers est le rôle du sélecteur de
  portée, une fois dans la vue.
- **`Scope` importé depuis `./Global`** en import de type, comme `App.tsx` le fait déjà.
  Le déplacer dans un module de types aurait été un chantier hors périmètre.

`npm run typecheck` : vert sur les 3 workspaces.

### 2026-08-25 : #72 — le chevron replie

**Statut** : Terminé

**Actions réalisées** :
- `readCollapsed()` pure + état `collapsed: Set<string>` + `useEffect` d'écriture sur
  `penduline:universes-collapsed`, sur le patron de `readView` / `VIEW_KEY` d'`App.tsx`.
- `toggleCollapse(key)` ; clé = identifiant d'univers, ou `LOOSE = 'none'` pour
  « Sans univers ».
- Chevron `<button aria-expanded>` avant le nom, hors de `.uni-head__actions`.
- Replié : ni les lignes de matrices, ni l'interstice de fin ; à la place,
  `.uni-head__summary` alimenté par `summarizeUniverse` et mis en mots par `foldLabel`.
- CSS du chevron et du résumé.

**Fichiers modifiés** :
- `apps/web/src/screens/Home.tsx`
- `apps/web/src/styles.css`

**Notes** : quatre points qui ne se devinent pas à la lecture du ticket.

**Le garde-fou `grouped`.** `folded` vaut `grouped && collapsed.has(foldKey)`, pas
`collapsed.has(foldKey)` seul. Sans aucun univers, l'accueil ne rend aucun en-tête — donc
aucun chevron. Un repli hérité d'un état antérieur (l'utilisateur avait des univers, il les
a supprimés) enfermerait ses matrices sans aucun moyen de les rouvrir. Le `localStorage`
survit à la suppression des univers ; le rendu, non.

**« Sans univers » se replie aussi.** Il n'a pas d'identifiant en base, d'où la clé
sentinelle `LOOSE = 'none'` — sans risque de collision, les identifiants d'univers étant des
UUID. C'est le groupe qui accumule les matrices non rangées, donc celui qui a le plus besoin
d'être replié ; l'exclure aurait été un choix par défaut, pas une décision.

**Pas d'`aria-controls` sur le chevron.** Replié, la région contrôlée n'existe plus dans le
DOM : un `aria-controls` pointant vers un identifiant absent renseigne moins bien que son
absence. `aria-expanded` seul sur le déclencheur est valide et correctement restitué.

**Le repli ne masque pas le dépôt.** Les lignes disparaissent, mais le `onDrop` qui capte le
dépôt de fin vit sur la `<section class="uni">`, pas sur les lignes : déposer une matrice sur
un en-tête replié la range donc déjà en fin de groupe, sans une ligne de code
supplémentaire. Le dossier à ressort (tâche 5) n'ajoute que le retour visuel.

`foldLabel` dit « vide » plutôt que « 0 matrice », et « rien à faire » plutôt que
« 0 tâche » — même parti que le `meta` par matrice de l'accueil.

`npm run typecheck` vert ; `npm test` : 95 shared + 21 web.

### 2026-08-25 : #72 — le dossier à ressort

**Statut** : Terminé

**Actions réalisées** :
- `SPRING_MS = 700`, `armSpring(key)` / `disarmSpring()`, deux `useRef` (le minuteur et la
  clé pour laquelle il est armé).
- Armement dans le `onDragOver` de la `<section class="uni">` quand le groupe est replié ;
  désarmement au `onDragLeave` de la section, à celui de `.board-list`, dans `dropAt` et
  dans le `onDragEnd` de la ligne.

**Fichiers modifiés** :
- `apps/web/src/screens/Home.tsx`

**Notes** : deux pièges, et une décision.

**`dragover` se répète.** Tant que le curseur reste sur la cible, l'événement refire toutes
les quelques centaines de millisecondes. Un `setTimeout` réarmé à chaque passage n'arrive
jamais à échéance : le dépliage ne se serait jamais produit, et rien dans le typage ne
l'aurait dit. D'où `springFor`, qui retient POUR QUEL groupe on attend — même clé, on laisse
courir ; autre clé, on désarme et on réarme.

**Un seul point d'armement suffit.** Replié, la section ne contient plus que son en-tête :
survoler l'un revient à survoler l'autre, et le `onDragOver` de la section capte déjà tout.
Poser un second gestionnaire sur `.uni-head` aurait dupliqué la règle pour rien.

**700 ms, plus long que l'appui long (500 ms).** On traverse un en-tête replié pour
atteindre le groupe d'en dessous ; à 500 ms, la page se déplierait sous le curseur à chaque
passage et la cible visée sauterait.

**Le dépliage est persisté, il ne se refait pas.** Les explorateurs de fichiers referment
souvent le dossier après le dépôt. Ici non : le repli est écrit dans `localStorage` comme
tout autre repli. Après avoir déposé une matrice dans un univers, on veut voir où elle a
atterri — un repli automatique cacherait le résultat de son propre geste. Un clic sur le
chevron suffit à refermer.

### 2026-08-25 : #73 — deux couches de glisser, un discriminant

**Statut** : Terminé

**Actions réalisées** :
- `type Drag = { kind: 'board' | 'universe'; id: string }` ; `drag` passe de
  `string | null` à `Drag | null`.
- Garde `drag?.kind !== 'board'` sur les sept endroits qui lisaient `drag` : `dropAt`, le
  `dragover`/`drop` de la ligne, le `dragover`/`drop` de la section, la classe
  `.board-list--dragging`, la classe `.board-row--dragging`, et l'affichage du groupe
  « Sans univers » vide.
- `onDragStart` d'une ligne publie `{ kind: 'board', id }`.

**Fichiers modifiés** :
- `apps/web/src/screens/Home.tsx`

**Notes** : le ticket #73 proposait deux types MIME maison sur le `dataTransfer`, avec
inspection de `e.dataTransfer.types` au `dragover`. Écarté au profit de l'union discriminée
dans l'état, pour trois raisons.

Les deux glissers naissent dans ce composant : l'information est déjà en mémoire, la faire
transiter par le DOM n'ajoute qu'un aller-retour. Ensuite, un `dataTransfer` ne livre pas
ses **données** au `dragover` — seuls les *types* y sont lisibles, `getData()` rendant `""`
par sécurité : l'identifiant serait de toute façon resté dans l'état, et on aurait porté
deux sources de vérité au lieu d'une. Enfin, et c'est l'argument décisif, une zone de dépôt
qui oublie sa garde se fait signaler à la compilation — `drag.id` sur un `Drag | null` ne
passe pas — alors qu'une chaîne MIME mal orthographiée échoue en silence à l'exécution.

Le cas que le typage MIME visait — un glisser venu d'une autre fenêtre — n'existe pas dans
l'application.

Deux gardes méritent leur mention, parce qu'elles ne sont pas de simples recopies :

- **`.board-list--dragging`** ne concerne que le glisser de matrices (elle neutralise le
  survol des lignes). Pendant un glisser d'univers, la laisser active aurait figé les lignes
  sans raison.
- **Le groupe « Sans univers » vide** ne s'affiche que pendant un glisser de matrice : c'est
  la cible qui permet de SORTIR une matrice de son univers. Pendant un glisser d'univers, ce
  serait un titre sans contenu ni usage.

`npm run typecheck` : vert sur les 3 workspaces.

### 2026-08-25 : #73 — la poignée et les interstices d'univers

**Statut** : Terminé

**Actions réalisées** :
- `uniOrder` (les univers dans l'ordre affiché), `uniGapAt()`, `dropUniverse()`, état
  `hoverUniGap`.
- `.uni-head__grip` : `<span draggable aria-hidden>` en tête de `.uni-head__actions`,
  publiant `{ kind: 'universe', id }`.
- L'**en-tête** capte `dragover`/`drop` pour les univers, avec `stopPropagation` pour que
  la section n'y voie pas un dépôt de matrice.
- Composant `UniGap` + CSS `.uni-gap` ; `.uni--dragging` sur la section déplacée.
- CSS de la poignée, masquée sous `(hover: none)`.

**Fichiers modifiés** :
- `apps/web/src/screens/Home.tsx`
- `apps/web/src/styles.css`

**Notes** : trois choses que le plan n'avait pas vues, et une qu'il avait bien vue.

**`BoardGap` ne convenait pas.** Le plan disait « sur le modèle de `BoardGap` » ; le
réutiliser tel quel aurait ajouté ses **10 px de hauteur au repos** avant chaque en-tête
d'univers — soit un accueil plus aéré pour tout le monde, y compris pour qui ne glisse
jamais rien. D'où `UniGap`, identique en apparence mais de hauteur **nulle** au repos : il
ne prend de la place qu'une fois désigné. C'est le même choix que `.board-gap` a fait pour
ses lignes, avec un plancher différent parce que le contexte l'est.

**L'interstice de fin n'est pas après la boucle.** « Sans univers » ferme toujours la liste
(`groupByUniverse`), donc la fin de la liste d'**univers** se situe *avant* ce groupe, pas
après tout l'accueil. L'interstice de fin est donc porté par l'en-tête « Sans univers ».
Reste le cas où ce groupe est masqué — vide, et aucune matrice en déplacement : d'où
`looseHidden`, qui rend alors l'interstice après la boucle. Sans ça, déposer un univers en
dernier n'aurait eu aucun repère visuel dans la moitié des cas.

**L'en-tête « Sans univers » vaut « à la fin ».** `uniGapAt` prend un indice négatif pour
ce groupe et rend `uniOrder.length` sans consulter la moitié survolée : il n'y a pas
d'« après » lui, couper son en-tête en deux n'aurait décrit aucune destination.

**Le `stopPropagation` était bien nécessaire.** L'en-tête est un enfant de la section, qui
porte déjà le dépôt de fin de groupe pour les matrices. Sans lui, un `dragover` d'univers
sur l'en-tête aurait aussi armé le dossier à ressort et le `hoverGap` de matrices —
exactement le croisement des deux couches que #73 voulait empêcher.

Ajouté hors plan, parce que le geste est illisible sans : `.uni--dragging` (opacité réduite
sur la section déplacée), le pendant de `.board-row--dragging`. Sans retour visuel, on ne
sait pas quel univers on tient.

`npm run typecheck` vert, `npm run build` vert, 95 + 21 tests.

### 2026-08-25 : la feuille d'appui long sur un univers

**Statut** : Terminé

**Actions réalisées** :
- `type SheetTarget = { kind: 'board' | 'universe'; id: string }` ; `sheet`, `openSheet` et
  `pressStart` prennent une cible au lieu d'un identifiant nu.
- Appui long branché sur le **bouton du nom**, avec `swallowClick`, `pressEnd` sur les
  trois sorties de pointeur et `onContextMenu` neutralisé.
- Feuille d'univers : Monter · Descendre · Renommer · Supprimer · Annuler, bornes inertes
  mais visibles.

**Fichiers modifiés** :
- `apps/web/src/screens/Home.tsx`

**Notes** : **l'appui long vit sur le nom, pas sur l'en-tête.** Le plan disait
« `onPointerDown` sur `.uni-head` » ; posé là, il aurait armé la feuille depuis le chevron
et depuis les actions, qui portent déjà leur propre geste — un appui long sur le chevron
aurait ouvert la feuille *et* replié l'univers au relâchement. Le nom est le grand
rectangle de l'en-tête, et c'est exactement où `.board-card` porte le même geste pour les
matrices. Corollaire nécessaire : le `onClick` du nom teste `swallowClick`, sinon le
relâchement de l'appui long ouvrait aussi la vue globale.

**Pas de bouton `⋯` sur l'en-tête.** Les matrices en ont un pour offrir au clavier une
entrée absente de leurs actions au survol (« Déplacer vers un univers »). Pour un univers,
la feuille ne contient rien que `.uni-head__actions` n'ait déjà : la porte clavier existe,
un troisième bouton n'aurait rien ouvert.

**Pas d'entrée « Replier ».** Le chevron est le seul contrôle de l'en-tête volontairement
visible au doigt : la feuille n'a pas à doubler ce qui est déjà à portée.

`uniOrder` sert aussi à borner « Monter » / « Descendre » — même source que le glisser et
que les flèches, donc pas de troisième idée de ce qu'est « le premier univers ».

### 2026-08-25 : `.uni-head__actions` sous `(hover: none)` — le défaut de #38, resté ouvert

**Statut** : Terminé

**Actions réalisées** :
- `display: none` remplacé par le motif de `.board-row__actions` : le survol ne révèle
  plus, le focus si.

**Fichiers modifiés** :
- `apps/web/src/styles.css`

**Notes** : le commentaire en place disait « au doigt, ces actions sont inatteignables :
l'appui long prend le relais » — sauf qu'aucun appui long n'existait sur l'en-tête. Les
actions étaient donc simplement perdues, et #38 avait déjà jugé ce raisonnement faux pour
les matrices : **une tablette munie d'un clavier rapporte elle aussi `hover: none`**, et un
`display: none` lui retire les actions de l'arbre d'accessibilité. Elle perdait son seul
chemin vers le réordonnancement, le renommage et la suppression d'un univers.

Une différence assumée avec la version `.board-row` : mes règles portent sur
`.uni-head__actions .board-act`, pas sur `.uni-head .board-act`. Les boutons OK / Annuler du
formulaire de renommage sont eux aussi des `.board-act` ; les inclure dans le calcul les
aurait rendus invisibles sous un survol rémanent tactile. La version des matrices ne s'en
sauve que par l'ordre des règles et le focus de son champ de saisie — un équilibre qu'il
valait mieux ne pas reproduire.

### 2026-08-25 : portes qualité

**Statut** : Terminé

**Actions réalisées** :
- `npm run typecheck` : vert sur `shared`, `web` et `extension`.
- `npm test` : 95 tests `shared` + 21 tests `web` (89 + 13 avant la story).
- `npm run build` : vert sur les 3 workspaces.
- Relecture du diff : aucun `console.`, aucun `any`, aucun `TODO` introduit.

**Notes** : un oubli trouvé à la relecture, corrigé — le `onDragLeave` de `.board-list`
nettoyait `hoverGap` et désarmait le ressort, mais laissait `hoverUniGap` en place. Sortir
de la liste en tenant un univers laissait donc le trait pointillé désigner une destination
qu'on avait quittée : exactement le défaut que #74 venait de corriger pour les matrices.

Pas de linter dans ce dépôt.

### 2026-08-25 : retours de validation — l'en-tête retravaillé

**Statut** : Terminé

**Actions réalisées** (trois retours) :
- **Poignée à gauche du chevron.** Elle quitte `.uni-head__actions` pour ouvrir l'en-tête.
  Nouvel ordre : poignée · chevron · nom · résumé · actions.
- **Chevron aligné.** Les glyphes `⌄` / `›` remplacés par un SVG unique qui pivote de -90°
  à l'état replié.
- **Survol du nom.** Le soulignement laisse place à un fond `--color-accent-100`, comme
  `.board-act` et tous les autres boutons.

**Fichiers modifiés** :
- `apps/web/src/screens/Home.tsx`
- `apps/web/src/styles.css`

**Notes** : le désalignement vertical venait bien des glyphes. `⌄` (U+2304) et `›` (U+203A)
n'ont ni la même hauteur d'œil ni le même centre optique dans Figtree : l'en-tête se
décalait **selon l'état du repli**, ce qu'un padding n'aurait pas rattrapé. Un seul dessin
qui pivote supprime la cause au lieu de la compenser — et le pivot donne au passage la
transition que deux caractères ne pouvaient pas avoir.

Deux conséquences du déplacement de la poignée qu'il a fallu traiter :

- **Sa largeur est désormais réservée en permanence** (`opacity` et non `display`). Placée
  avant le chevron et le nom, la révéler au survol aurait décalé tout l'en-tête vers la
  droite au moment précis où le curseur y arrive.
- **« Sans univers » reçoit un emplacement vide** (`.uni-head__grip--void`). Ce groupe ne se
  réordonne pas, mais sans réservation son nom se serait aligné 23 px à gauche de celui des
  autres groupes.

Le nom se retrouve en retrait (~68 px, contre 20 px pour les noms de matrices) : c'est le
retrait d'une ligne de dépliage, et il fait lire la hiérarchie. `.uni-head` porte les
valeurs (`padding`, `gap`) si on veut le resserrer.

Le fond au survol a demandé de donner au nom un rembourrage permanent (`4px 8px`) — un fond
collé au texte se lit mal. Le `<span>` de « Sans univers » le partage, ce qui aligne les
deux formes.

`npm run typecheck` vert, `npm test` 95 + 21, `npm run build` vert.

### 2026-08-25 : la poignée passe en marge, et le sujet des icônes est sorti du périmètre

**Statut** : Terminé

**Actions réalisées** :
- `.uni-head` retrouve `padding-left: 20px` ; `.uni-head__grip` porte `margin-left: -23px`
  (sa largeur + le `gap`) et pend dans le rembourrage de `.home`.
- Suppression du `<span>` placeholder `.uni-head__grip--void` et de sa règle CSS.
- Issue #79 ouverte : « Système d'icônes : remplacer les glyphes Unicode par Lucide ».

**Fichiers modifiés** :
- `apps/web/src/screens/Home.tsx`
- `apps/web/src/styles.css`

**Notes** : l'ancre de l'en-tête est désormais **le chevron**, posé à 20 px comme les noms
de matrices en dessous. La poignée sort entièrement de l'alignement — `.home` a 24 px de
rembourrage, elle n'en dépasse donc pas.

Effet de bord : le placeholder pour « Sans univers » devient **inutile**. Hors du flux, la
poignée ne décale plus rien par son absence, et le chevron tombe à 20 px avec ou sans elle.
Un élément DOM et une règle CSS en moins.

Second bénéfice, non recherché : la largeur n'a plus besoin d'être « réservée » puisqu'elle
est négative. La révélation au survol ne peut plus rien décaler, par construction et non
par réglage.

**Le chevron reste un SVG en ligne, et c'est un choix daté.** La question « pourquoi pas
Lucide ? » est juste, mais le dépôt n'a aucune librairie d'icônes et **52 glyphes Unicode
en service** sur 10 fichiers, dans les deux workspaces (`↑`×12, `↓`×11, `⋯`×9, `＋`×9,
`✕`×5, `›`×4, `⠿`×3, `✓`×1). Ajouter la dépendance pour une seule icône laisserait 1 icône
Lucide contre 51 glyphes — et le `ChevronDown` de Lucide est exactement le `<path>` écrit
ici. Le gain n'arrive qu'avec la migration complète : d'où #79, avec son inventaire, ses
deux décisions ouvertes (où vit la dépendance, quelle épaisseur de trait aux petites
tailles) et le vrai coût identifié — relire l'alignement optique bouton par bouton, un
`<svg>` se centrant dans sa boîte là où un glyphe s'assied sur sa ligne de base.

À signaler : `TaskCard.tsx` utilise déjà `⠿` comme poignée. La poignée d'univers reprend
donc un idiome présent, elle n'en introduit pas un.

`npm run typecheck` vert, `npm test` 95 + 21, `npm run build` vert.
