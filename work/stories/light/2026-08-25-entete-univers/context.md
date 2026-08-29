---
slug: "entete-univers"
title: "En-tête d'univers : les trois gestes (#71, #72, #73)"
created: 2026-08-25
---

# Contexte

## Description fonctionnelle

L'univers est aujourd'hui un simple en-tête de groupe sur l'accueil : il rassemble des
matrices sans rien offrir d'autre. Trois manques s'y superposent. Impossible de demander
« montre-moi tout ce qu'il y a dans cet univers » sans passer par la vue globale et son
sélecteur — alors que cette vue existe déjà et n'attend qu'un chemin d'accès depuis
l'univers lui-même. Un univers ne réduit rien non plus : avec quatre ou cinq univers,
l'accueil redevient la longue liste que le regroupement était censé éviter, faute de
pouvoir replier ce qu'on ne consulte pas. Et il ne se réordonne qu'aux flèches ↑ ↓ de son
en-tête, sans glisser-déposer — ce qui, combiné à l'absence totale d'appui long sur cet
élément, laisse un univers ni réordonnable, ni renommable, ni supprimable sur mobile. Ce
sont trois manques distincts, mais qui portent sur le même élément d'interface :
l'en-tête d'univers.

La proposition retenue est de doter cet en-tête de trois gestes clairement séparés plutôt
que de les traiter isolément : le **nom** de l'univers l'ouvre en vue globale filtrée,
exactement comme le nom d'une matrice l'ouvre déjà ; un **chevron** replie et déplie le
groupe ; une **poignée** dédiée porte le glisser-déposer pour le réordonner. Cette
séparation évite l'ambiguïté d'un en-tête où le même geste ferait plusieurs choses à la
fois, et permet de traiter en une seule passe ce qui, livré séparément, laisserait à
chaque étape un en-tête à moitié pensé.

**Ce qui change** : le nom devient cliquable et ouvre la vue globale sur l'univers
concerné, avec le sélecteur de portée de cette vue reflétant bien l'univers choisi ; un
chevron permet de replier un univers, l'en-tête replié affichant alors un résumé (nombre
de matrices et de tâches restant à faire) plutôt qu'un simple vide ; cet état de repli est
mémorisé par appareil et retrouvé après rechargement ; les univers deviennent
réordonnables au glisser-déposer via leur poignée, en plus des flèches existantes, avec
une distinction stricte vis-à-vis du glisser d'une matrice pour qu'aucun des deux ne
puisse être déposé sur les emplacements de l'autre ; et sur mobile, un appui long sur
l'en-tête ouvre une feuille d'actions (monter, descendre, renommer, supprimer), comblant
l'absence actuelle de tout geste tactile sur cet élément.

**Ce qui ne change pas** : le renommage et la suppression d'un univers restent accessibles
comme avant (dans les actions de l'en-tête sur desktop, désormais aussi via la feuille
tactile) ; le groupe « Sans univers » n'est pas cliquable pour ouvrir une vue puisqu'il n'y
a rien à cibler, mais il reste repliable et reste la destination par défaut d'un dépôt ; un
compte sans aucun univers ne voit apparaître aucun nouvel élément d'interface. L'extension
Chrome, qui se contente d'afficher les univers en lecture, n'est pas concernée.

**Critères d'acceptation clés** : un clic (ou un appui) sur le nom d'un univers ouvre la
vue globale filtrée sur cet univers, avec le sélecteur de portée qui l'affiche
correctement ; le nom reste renommable malgré ce nouveau geste ; replier un univers masque
ses matrices et affiche à la place un résumé chiffré, cet état survit à un rechargement et
reste indépendant par appareil ; un univers replié reste une cible de dépôt valide pour
une matrice ; les univers se réordonnent au glisser-déposer et cet ordre est persisté et
retrouvé dans la vue globale, sans qu'un univers puisse être mélangé avec les emplacements
de dépôt des matrices (et inversement) ; sur mobile, un appui long sur l'en-tête ouvre la
feuille d'actions complète (monter, descendre, renommer, supprimer) et le chevron de repli
reste atteignable au doigt ; enfin, l'ensemble des gestes reste utilisable au clavier, avec
les annonces d'accessibilité déjà en place qui continuent de fonctionner.

## Vue architecturale

Le geste s'ajoute à un écran unique — `apps/web/src/screens/Home.tsx` — sans faire naître
de nouveau composant d'affichage : `.uni-head` s'enrichit d'un chevron, d'une poignée et
d'un nom cliquable, et la feuille d'appui long existante (désormais partagée avec les
matrices via `sheet: { kind; id } | null`) apprend à porter les actions d'un univers. Trois
autres fichiers bougent en périphérie sans changer de rôle : `App.tsx` cesse de coder en
dur `{ kind: 'all' }` à ses trois points d'entrée vers la vue globale et laisse
`Home`/`Matrix` lui transmettre la `Scope` réellement visée ; `packages/shared/src/layout.ts`
gagne une fonction pure `summarizeUniverse` qui rejoint `groupByUniverse` et
`planBoardReorder` dans le même rôle de règle testable sans DOM ;
`apps/web/src/dnd/gap.ts` gagne `dropTarget`, qui traduit l'interstice brut de `gapIndexAt`
en `beforeId` pour `store.reorderUniverse`, ou en `false` quand la cible est déjà la
position courante. Le flux d'interaction se referme donc en boucle courte : geste DOM sur
`Home` → règle pure dans `shared` ou `dnd/gap` → écriture optimiste dans `store.ts`
(`reorderUniverse`, protégée par le motif `persist` existant : retour arrière + toast en cas
d'échec) → re-rendu. Aucun de ces trois fichiers ne connaît les deux autres directement ;
c'est `Home.tsx` qui les orchestre, ce qui confirme qu'il concentre « l'essentiel » de cette
story, comme l'annonce le plan.

```
        pointeur / clavier
              │
     ┌────────▼──────────┐        règle pure        ┌──────────────┐
     │   Home.tsx         │──── (aucun état, ──────▶│ layout.ts /  │
     │  (état d'écran :   │      aucun effet         │  gap.ts      │
     │  drag, sheet,      │      de bord)            │ (shared/dnd) │
     │  collapsed, hover) │◀─── retourne un plan ────┤              │
     └───────┬────────────┘     ou un beforeId       └──────────────┘
             │ appelle
             ▼
     store.reorderUniverse(id, beforeId)
             │
     ┌───────▼─────────┐
     │   persist()      │  optimiste → écrit → si échec : revert + toast
     └───────┬─────────┘
             ▼
        Supabase (colonne position)
```

Trois décisions structurent cette passe, et toutes trois déplacent une ambiguïté du runtime
vers le typecheck ou vers une frontière de couche déjà en place. La première fait du
glisser un état React discriminé — `drag: { kind: 'board' | 'universe'; id } | null` —
plutôt qu'une distinction portée par le `dataTransfer` HTML5 (type MIME personnalisé, lu au
`drop`). Les deux glissers naissent dans le même composant, donc l'information est déjà
disponible sans traverser le DOM ; encoder le discriminant dans le type fait que chaque
zone de dépôt qui oublie sa garde (`if (drag?.kind !== 'board') return;`) se voit signalée
à la compilation, alors qu'un type MIME mal renseigné ou mal lu échoue silencieusement à
l'exécution, seulement visible en testant à la main. C'est aussi la seule solution
cohérente avec le rejet explicite, documenté dans le plan, de faire venir un glisser
d'ailleurs que de l'écran lui-même — hypothèse pour laquelle le typage MIME avait été conçu
et qui ne correspond à aucun besoin réel de l'application.

La deuxième décision — persister le repli d'un univers en `localStorage` plutôt qu'en
colonne Supabase — trace une frontière entre donnée et préférence de lecture. Une colonne
`collapsed` en base ouvrirait un chemin d'écriture réseau supplémentaire à sécuriser (RLS,
migration, cas de conflit multi-appareil) pour une information qui n'a aucune valeur
métier : elle ne décrit pas *ce que contient* le compte, seulement *comment cet appareil-ci
le regarde en ce moment*. Le `localStorage`, lu par une fonction pure au même patron que
`readView` dans `App.tsx` (initialiseur de `useState`, secours silencieux vers « rien de
replié » sur JSON corrompu ou stockage verrouillé, écriture en `useEffect` avec échec
avalé), évite toute migration de schéma et laisse à chaque appareil son propre état de
repli — cohérent avec le fait qu'un onglet ou un appareil diffère dans ce qu'il choisit
d'afficher, sans que cela affecte les autres.

La troisième frontière, déjà posée par #74 et reconduite ici, sépare `packages/shared`
(règles pures, testables sans React ni réseau : `summarizeUniverse`, `groupByUniverse`,
`positionBefore`) de `apps/web` (décisions propres à cet écran web : `dropTarget`, le
ciblage `dragover`/`drop`, l'état `collapsed`). Le critère de placement n'est pas la
complexité mais l'audience : une règle qui vaudrait aussi pour l'extension Chrome (compter
des tâches ouvertes, ordonner des univers) va dans `shared` ; une règle qui suppose du DOM,
du `DragEvent` ou une notion d'écran (interstice visuel, repli d'un en-tête) reste dans
`apps/web` — précisément parce que `dropTarget` n'a pas d'équivalent pour les matrices
(`dropAt` gère un cas plus riche, le changement de groupe) et que l'extension ne fait que
lire les univers sans aucun geste sur eux. Cette frontière borne aussi la duplication :
`dropTarget` réutilise `gapIndexAt` sans le modifier, et `moveUniverse`/`reorderUniverse`
réutilisent `positionBefore` tel qu'écrit pour les matrices — aucune nouvelle primitive de
position n'est introduite.

Sur l'architecture existante, l'impact reste local et rétrocompatible : le changement de
signature `onGlobal: () => void` → `onGlobal: (scope: Scope) => void` se propage à trois
appelants connus (`App.tsx`, `Home.tsx`, `Matrix.tsx`), tous corrigés dans la même passe, et
le typecheck garantit qu'aucun quatrième site n'est oublié. Le remplacement de
`drag: string | null` par une union discriminée touche toutes les zones de dépôt de
`Home.tsx`, mais aucune autre partie de l'application ne lit cet état — le risque de
régression est contenu au fichier. Le seul point de vigilance transverse est le correctif
CSS de `.uni-head__actions` sous `(hover: none)` : passer de `display: none` à
`max-width: 0` + révélation au `:focus-within` corrige un défaut d'accessibilité déjà
identifié et corrigé ailleurs pour `.board-row__actions` (#38) — cette story referme la
même faille restée ouverte sur les univers, sans introduire de nouveau motif CSS à
maintenir. Aucun changement de schéma Supabase n'est requis ; l'extension Chrome, purement
lectrice des univers, n'a rien à absorber de cette évolution.

## Impacts UX

Trois gestes se partageaient jusqu'ici une seule ligne muette : un `<span>` figé au-dessus
d'une pile de matrices, sans chevron, sans poignée, sans clic possible. L'en-tête d'univers
devient un poste à quatre zones disjointes, chacune dédiée à une seule intention et
repérable sans lecture attentive. Le **chevron** ouvre la ligne en tête, toujours visible —
le pli est un état de lecture qu'on ne doit jamais chercher, contrairement aux actions
ponctuelles. Le **nom** passe de texte inerte à `<button>` : il ouvre la vue globale déjà
existante, filtrée sur cet univers — un raccourci auquel il manquait un chemin, pas une
fonctionnalité. La **poignée** est la seule zone `draggable` de l'en-tête : en isolant le
glisser sur un nœud unique, on évite qu'un clic sur le nom soit jamais interprété comme un
début de glisser, et réciproquement. Les **actions** historiques (↑ ↓, Renommer, Supprimer)
restent groupées à droite, révélées au survol ou au focus — même motif que les lignes de
matrices, pour ne pas réapprendre une deuxième convention. Un univers replié troque sa
liste de matrices contre un résumé chiffré (« 3 matrices · 12 tâches ») : sans lui,
refermer un groupe reviendrait à cacher son contenu sans dire ce qu'il y a dedans — un
repli qui perd de l'information n'est plus un rangement, c'est une amputation.

```
ÉTAT DÉPLIÉ — au repos (poignée et actions discrètes)
┌──────────────────────────────────────────────────────────────────┐
│  ⌄   PROJET ALPHA                                                │
│  ↑ chevron (replie)                                              │
│      ↑ nom = bouton « voir tout l'univers »                      │
├──────────────────────────────────────────────────────────────────┤
│      Matrice A                                                   │
│      Matrice B                                                   │
│      Matrice C                                                   │
└──────────────────────────────────────────────────────────────────┘

ÉTAT DÉPLIÉ — au survol / focus (poignée et actions révélées)
┌──────────────────────────────────────────────────────────────────┐
│  ⌄  PROJET ALPHA        ⠿   ↑  ↓  Renommer  Supprimer            │
│                         ↑ poignée                                │
│                             ↑ actions                            │
├──────────────────────────────────────────────────────────────────┤
│      Matrice A                                                   │
│      Matrice B                                                   │
│      Matrice C                                                   │
└──────────────────────────────────────────────────────────────────┘

ÉTAT REPLIÉ (résumé à la place de la liste)
┌──────────────────────────────────────────────────────────────────┐
│  ›  PROJET ALPHA · 3 matrices · 12 tâches                        │
└──────────────────────────────────────────────────────────────────┘
```

La cohabitation des trois gestes ne se résout pas par une infobulle qu'on ne lit jamais,
mais par la géométrie : trois zones de clic disjointes qui ne se recouvrent à aucun moment,
la poignée étant la seule à porter `draggable`, donc la seule capable de déclencher un
glisser — cliquer le nom ou le chevron ne peut jamais être mal interprété comme une saisie.
Sur tactile, où le glisser HTML5 n'existe pas, la poignée disparaît purement et simplement
plutôt que de rester une cible morte : l'appui long sur l'en-tête prend seul le relais et
ouvre la feuille (↑ Monter · ↓ Descendre · Renommer · Supprimer), avec un `swallowClick` qui
empêche le relâchement de l'appui long de déclencher aussi l'ouverture de la vue globale —
sans cette suppression, l'appui long sur le nom ferait involontairement les deux choses à
la fois. Le clavier n'a pas besoin d'un équivalent à la poignée : le réordonnancement lui
est déjà offert par les flèches ↑ ↓, donc la parité tactile/souris/clavier se construit sans
ajouter une zone supplémentaire dans l'ordre de tabulation qui n'aurait aucun comportement
propre.

Côté accessibilité, le chevron porte `aria-expanded` reflétant l'état réel du groupe — un
lecteur d'écran doit pouvoir annoncer « replié » / « déplié » sans dépendre d'un indice
visuel seul. Le nom, devenu point d'entrée cliquable, a besoin d'un nom accessible qui dit
l'action et pas seulement l'identité (« Voir toutes les tâches de « Projet Alpha » » plutôt
que le seul nom de l'univers, qui ne renseigne pas sur ce que fait le clic). La poignée, à
l'inverse, est volontairement `aria-hidden` et **jamais** focusable : un élément qu'on peut
atteindre au Tab mais qui n'offre aucune action clavier serait un piège de focus, alors que
le réordonnancement existe déjà par les flèches. Enfin, les actions (↑ ↓, Renommer,
Supprimer) doivent se révéler au `:focus-within` et pas seulement au survol, et ne jamais
passer par `display: none` — un `display: none` les retirerait de l'arbre d'accessibilité,
ce qui priverait d'action toute tablette équipée d'un clavier physique, laquelle rapporte
elle aussi `hover: none` sans pour autant renoncer au clavier comme chemin d'interaction.
