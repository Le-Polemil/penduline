---
story: "Correctif Mobile 2/3 — les états de survol"
story_code: "correctif-mobile-hover"
created: 2026-09-16
---

# Contexte

## Description fonctionnelle

Penduline se manipule à la souris : chaque commande secondaire de l'application — actions d'une carte, croix de détachement, élévations, fonds de survol — a été dessinée pour un pointeur qui passe sans appuyer. Sur un écran tactile ce pointeur n'existe pas, et `:hover` s'y **colle** : un tap le déclenche, l'élément le garde jusqu'au tap suivant ailleurs. Mesuré en émulation, un simple appui sur le `⋯` d'une carte laisse 13 éléments en état survolé, la ligne de matrice touchée reste soulevée et ombrée, la case à cocher reste agrandie de 15 %. L'interface cesse alors de dire où l'on est : elle affiche où l'on a été. Ce lot lui rend ce langage — au doigt, l'application ne montre plus que ce qui est vrai maintenant, et les deux actions qui n'existaient qu'au survol redeviennent atteignables.

Le correctif ne supprime pas le survol, il le **conditionne**. Les 57 règles `:hover` de la feuille de styles — dont aucune n'était jusqu'ici réservée à un pointeur précis — passent sous `@media (hover: hover) and (pointer: fine)`, si bien qu'elles ne s'appliquent plus qu'à une souris ou un trackpad. Trois exceptions restent délibérément hors de la garde : la couleur d'un lien (`a:hover`), sans effet de forme, et surtout `:focus-visible` / `:focus-within`, qui ne relèvent pas du survol et portent tout le chemin clavier rendu par #38 — les emporter reviendrait à casser l'accessibilité en réparant le tactile. S'y ajoutent quatre corrections ciblées : les deux croix jusqu'ici invisibles au doigt (détacher un lien, supprimer une étape) apparaissent atténuées à 55 %, sur le modèle déjà appliqué aux raccourcis de carte ; le sous-menu d'univers ne monte ses gestionnaires de souris que sur pointeur fin, son repli au clic devenant le seul chemin tactile ; le motif de refus du bouton « Faire aujourd'hui », porté par une infobulle native que le doigt ne verra jamais, reste lisible via le libellé accessible et le menu `⋯` ; et les raccourcis `Alt+↑` / `Alt+↓` disparaissent du menu là où il n'y a pas de clavier.

Rien n'est retiré, ni au doigt ni à la souris : aucun écran, aucune donnée, aucun parcours ne change, et le rendu desktop doit être strictement identique après comme avant — c'est le seul vrai risque du lot, et donc le cœur de la vérification. Le périmètre reste celui d'une cause unique, conformément au découpage en trois passes : les animations et leurs durées partent en #91, les anomalies communes au desktop relevées au passage (case à cocher sans contour sur « Aujourd'hui » et « Revue ») en #92. Le dépliage du titre tronqué au tap reste couvert par #95.

Critères d'acceptation :

- À 390 × 844 en tactile, après un appui sur une carte, une ligne de matrice ou une case à cocher, plus aucun état de survol ne subsiste : le `⋯` tapé ne garde pas son fond, la ligne ne reste pas soulevée, la case ne reste pas agrandie.
- Sur une pastille de lien et sur une étape, la croix de suppression est visible (atténuée) sans geste préalable, et un appui dessus détache ou supprime.
- Le menu `⋯` au doigt n'affiche plus les raccourcis clavier, et un univers s'y déplie puis se replie au tap sans état collé ni double déclenchement.
- Quand un refus empêche de passer une tâche à « aujourd'hui », le motif reste accessible au doigt — par le libellé accessible du bouton et par le menu `⋯` — alors qu'il n'était jusqu'ici porté que par une infobulle native.
- À 1440 × 900 à la souris, le survol est inchangé sur les six écrans : aucune élévation, aucun fond, aucun agrandissement perdu.
- Au clavier sur desktop, `Tab` révèle toujours les actions d'une ligne de matrice et d'un en-tête d'univers : `:focus-within` et `:focus-visible` n'ont pas été emportés par la garde.
- `npm run typecheck`, `npm test` et `npm run build` passent.

## Vue architecturale

Le lot touche trois fichiers, dans trois rôles très inégaux. `apps/web/src/styles.css` porte l'essentiel : c'est là que vivent les 57 occurrences de `:hover`, dont ~45 règles à conditionner, les deux croix révélées au survol (`.att__del`, `.sub__del`) et les raccourcis clavier du menu `⋯`. `apps/web/src/components/TaskCard.tsx` n'est touché qu'en deux points — le sous-menu d'univers, qui monte aujourd'hui `onMouseEnter`/`onMouseLeave` sans condition, et le bouton « Faire aujourd'hui » du bandeau, dont le motif de refus ne tient qu'à un `title` invisible au doigt. `apps/web/src/data/useBalayage.ts` s'étoffe d'un `usePointeurFin()`, voisin direct de `useTelephone()` : le module devient le point unique où le projet interroge `matchMedia`, côté JS.

```
                 ┌──────────────────────────────┐
   CSS ─────────▶│ styles.css                   │ ~45 règles :hover gardées
                 │  (organisé PAR COMPOSANT)    │ + 2 croix visibles au doigt
                 └──────────────────────────────┘ + .task-menu__key masqué
                                ▲
                                │ même frontière, deux expressions
                                ▼
                 ┌──────────────────────────────┐
   JS  ─────────▶│ data/useBalayage.ts          │ useTelephone()   → largeur
                 │  (le seul hôte de matchMedia)│ usePointeurFin() → pointeur
                 └──────────────┬───────────────┘
                                │
                                ▼
                 ┌──────────────────────────────┐
                 │ TaskCard.tsx                 │ montage conditionnel du survol
                 └──────────────────────────────┘
```

La décision structurante du lot est de **garder les gardes en place** plutôt que de regrouper les règles conditionnées en fin de fichier. `styles.css` est organisé par composant et chaque règle porte son commentaire d'intention : les déplacer romprait ce couplage — le commentaire resterait avec le composant, la règle partirait ailleurs — et surtout déplacerait 45 règles d'un coup dans l'ordre de cascade. Or plusieurs de ces règles n'existent que pour battre une règle de base à spécificité égale (`.board-more:hover`, `.task__act:disabled:hover`) : à égalité, c'est la position dans le fichier qui tranche. Envelopper sur place ne change ni la spécificité ni la position, donc rien de la résolution ; regrouper changerait les deux. Le coût de ce choix est un fichier plus fragmenté, avec plusieurs dizaines de blocs `@media` courts au lieu d'un gros ; on l'amortit en groupant les règles adjacentes sous un même bloc, jamais des règles éloignées.

```
   EN PLACE (retenu)                    REGROUPÉ (écarté)
   ────────────────                     ─────────────────
   /* intention ligne */                /* intention ligne */
   .board-row { … }                     .board-row { … }
   @media (hover fin) {                 …
     .board-row:hover { … }             /* intention carte */
   }                                    .task__check { … }
   /* intention carte */                …
   .task__check { … }                   ── fin de fichier ──
   @media (hover fin) {                 @media (hover fin) {
     .task__check:hover { … }             .board-row:hover  ← intention perdue
   }                                      .task__check:hover ← cascade déplacée
                                        }
```

La frontière à ne pas franchir est celle qui sépare le survol du focus. `:hover` entre dans la garde ; `:focus-visible` et `:focus-within` restent **dehors**, sans exception. Ce ne sont pas des états de pointeur mais le chemin clavier, celui que #38 avait restauré : les enfermer dans une requête `hover: hover and pointer: fine` les couperait sur tout écran tactile — y compris un iPad muni d'un clavier externe, où le pointeur est grossier et le clavier bien réel. Deux règles du lot mêlent justement les deux dans une même déclaration (`.att__chip:hover .att__del, .att__del:focus-visible`, et son jumeau pour `.sub__item`) : elles doivent être scindées, la moitié survol sous garde, la moitié focus hors garde. Trois autres exceptions restent hors garde par nature — `a:hover`, simple changement de couleur sans effet de forme, et le contournement du survol figé pendant un glisser, qui tombe dans la garde avec sa règle de base sans qu'on ait à le décider.

```
   état visuel d'un élément
   ├── :hover          → SOUS garde  (hover: hover) and (pointer: fine)
   ├── :focus-visible  → HORS garde  ← chemin clavier (#38)
   ├── :focus-within   → HORS garde  ← chemin clavier (#38)
   └── :active         → inchangé    (le doigt le déclenche correctement)
```

Cela fait apparaître un **troisième axe de requête média**, et c'est le vrai apport architectural du lot. #89 en avait posé deux, orthogonaux et assumés comme tels : la largeur (`max-width: 720px`) pour la **géométrie** — combien de colonnes, quelle mise en page — et `pointer: coarse` pour l'**ergonomie** — quelle taille de cible. Arrive ici `hover: hover and pointer: fine` pour les **affordances** : ce qui n'a le droit d'exister qu'au survol. Les trois ne se recouvrent pas, et l'iPad le prouve à lui seul : large (mise en page desktop), pointeur grossier (grosses cibles), sans survol (aucun effet de survol). Le commentaire existant devant le bloc `pointer: coarse` dit déjà pourquoi mélanger ces axes était l'erreur du lot précédent ; le nouvel axe doit être documenté dans la même veine, faute de quoi le prochain arbitrage retombera sur `(hover: none)` comme approximation du téléphone. À noter : `(hover: none)`, déjà employé six fois, reste le complément légitime de la nouvelle garde — c'est lui qui porte les replis tactiles (croix atténuées à 55 %, masquage de `.task-menu__key`), quand la garde porte les enrichissements souris.

```
   axe 1 — LARGEUR          max-width: 720px      → géométrie   (#89)
   axe 2 — TAILLE DU DOIGT  pointer: coarse       → ergonomie   (#89)
   axe 3 — AFFORDANCES      hover+fine / hover:none → survol    (#90)

                    téléphone   tablette   desktop
   largeur ≤720     ✓           ✗          ✗
   pointer: coarse  ✓           ✓          ✗
   hover fin        ✗           ✗          ✓        ← les trois diffèrent
```

Dernier déplacement, plus discret mais de même nature : le survol piloté en JS devient un **montage conditionnel**. Le sous-menu d'univers ouvre aujourd'hui sur `mouseenter` et referme sur `mouseleave`, gestionnaires montés sans condition ; au doigt ils ne se déclenchent jamais proprement mais se superposent au clic, qui est déjà le repli prévu. Plutôt que d'arbitrer à l'exécution (tester le type de pointeur dans le gestionnaire), on n'attache les deux gestionnaires que si `usePointeurFin()` est vrai — la même exclusion à la construction que `useBalayage` applique déjà au balayage sous 720 px. Sur pointeur grossier, le clic devient le chemin unique, sans état concurrent à réconcilier. L'impact sur l'existant est de deux ordres : `useBalayage.ts` se confirme comme le module des requêtes média côté JS — il faudra tôt ou tard admettre que son nom ne dit plus ce qu'il contient — et un changement de pointeur en cours de session (clavier iPad branché, souris connectée) remonte le nouveau hook, donc démonte ou remonte les gestionnaires, ce qui suppose que l'état du sous-menu survive au changement.

```
   AVANT                            APRÈS
   ─────                            ─────
   <div onMouseEnter … onMouseLeave …>   pointeurFin ? gestionnaires : ∅
     ↑ toujours monté                      ↑ décidé au montage, pas dans le handler
   au doigt : mouseenter parasite         au doigt : le clic, seul chemin
              + clic, en concurrence                 (repli déjà en place)
```

Le risque résiduel du lot n'est pas tactile mais **desktop** : 45 règles déplacées d'un cran de profondeur, c'est 45 occasions de perdre un survol qui fonctionnait. Le garde-fou est mécanique — vérifier qu'aucune règle de survol n'entre dans une garde sans la règle de base qu'elle est censée battre — et la vérification manuelle des six écrans à la souris reste le seul filet réel, aucun test automatisé du dépôt ne couvrant l'état de survol.

## Impacts UX

L'écran tactile n'a pas de curseur, donc il n'a pas de « avant le clic » : le doigt touche, et le survol se colle là où il s'est posé. L'utilisateur tape une carte pour la cocher, l'action passe — et la ligne reste soulevée de 2 px, ombrée, plus claire que ses voisines. Rien dans l'application ne dit ce que cet état signifie, alors il se lit avec ce qu'on a sous la main : soit *cette ligne est sélectionnée* (et on cherche comment la désélectionner, ou on n'ose plus taper ailleurs de peur d'agir sur elle), soit *c'est cassé*. Les deux lectures sont fausses et les deux coûtent. Le pire cas est la case à cocher, qui reste agrandie de 15 % après le tap : un contrôle qui a changé de taille ressemble à un contrôle qui a changé d'état, et l'agrandissement se superpose exactement au signal qu'on vient de chercher — « est-ce que ma tâche est cochée ? ». On empile treize éléments dans cette situation après un seul tap. Mettre tout le survol sous `@media (hover: hover) and (pointer: fine)` ne retire rien à personne : ça rend simplement au doigt une interface où *rien n'est allumé tant que rien ne l'est vraiment*.

```
Avant (au doigt)                    Après (au doigt)
┌──────────────────────────────┐    ┌──────────────────────────────┐
│ ○  Relancer le fournisseur ⋯ │    │ ○  Relancer le fournisseur ⋯ │
├──────────────────────────────┤    ├──────────────────────────────┤
│▓◉▓ Préparer le point hebdo ▓⋯│ ←  │ ◉  Préparer le point hebdo ⋯ │  tapée,
│▓▓▓▓ soulevée, ombrée, case  ▓│    │    (cochée. et c'est tout)   │  puis relâchée
│▓▓▓▓ restée à 115 % ▓▓▓▓▓▓▓▓▓▓│    └──────────────────────────────┘
└──────────────────────────────┘
   « c'est sélectionné ? c'est bugué ? »
```

Le second volet est l'inverse du premier : deux actions n'existaient qu'au survol et n'étaient donc, au doigt, nulle part. Détacher un lien et supprimer une étape passent toutes deux par une croix à `opacity: 0`, révélée par le survol de sa pastille ou de sa ligne — sur mobile, une fonctionnalité qu'aucun geste ne peut découvrir. Elles passent à **55 % d'opacité sous `(pointer: coarse)`**, et l'atténuation est ici le dosage juste, pas un compromis. À pleine opacité, une croix noire sur chaque pastille de lien et chaque étape mettrait la *suppression* au même niveau visuel que le contenu qu'elle supprime, sur un écran déjà dense où la moitié de la surface est du texte de 11 px : on passerait d'une action introuvable à une action qu'on redoute de frôler, et une matrice de trente tâches deviendrait un champ de croix. À 55 %, la croix est franchement lisible — assez pour qu'on sache qu'elle existe et qu'on la vise — tout en restant clairement en second plan derrière le titre. C'est exactement le traitement que `.task__act` reçoit déjà sous `(hover: none)`, donc l'utilisateur ne découvre pas une convention de plus : il retrouve celle qu'il a déjà vue ailleurs dans l'app. La zone de frappe de 44 px, elle, existe depuis #89 — la croix devient visible, elle n'a pas besoin de devenir plus grosse.

```
Pastille de lien, au doigt                Étape, au doigt
avant :  ( devis-2026.pdf        )        avant :  │ ○  Appeler le notaire
          ↑ la croix est là, à 0 %                  ↑ la croix est là, à 0 %
après :  ( devis-2026.pdf     ×  )        après :  │ ○  Appeler le notaire    ×
                              ↑ 55 %                                          ↑ 55 %
                         ⌐ ‥ ‥ ¬ 44 px de zone de frappe (déjà acquis, #89)
```

Deux garde-fous encadrent le lot. Le premier est que **rien ne doit bouger à la souris** : c'est l'objectif — le survol desktop est un acquis du design system Organic, pas une dette — et c'est simultanément la seule vraie exposition du correctif, puisqu'on touche à 45 règles d'un coup. D'où la vérification en A/B sur les six écrans en 1440 × 900 : la bonne issue de cette story, côté desktop, est que personne ne remarque rien. Le second concerne le clavier. `:focus-visible` et `:focus-within` ressemblent syntaxiquement au survol, cohabitent avec lui dans les mêmes sélecteurs (`.att__chip:hover .att__del, .att__del:focus-visible`), et les emporter dans la garde serait l'erreur facile — elle rendrait `.att__del`, `.sub__del`, `.sub__toggle` et les actions révélées au focus invisibles au `Tab` sur toute machine à pointeur grossier (tablette avec clavier, écran tactile en poste fixe, navigation clavier sur portable tactile). Ces sélecteurs **restent hors de la garde** : ils ne décrivent pas un pointeur, ils décrivent une intention explicite de l'utilisateur, et ce sont eux qui portent le chemin clavier que #38 avait rendu au projet. Même logique pour `a:hover`, laissé tel quel — un changement de couleur de lien ne colle pas, ne se lit pas comme un état, et n'a rien à faire sous condition. Enfin, la disparition de `Alt+↑ / Alt+↓` du menu `⋯` au doigt et le fait que le motif de refus du bouton « Faire aujourd'hui » repasse par `aria-label` + le menu `⋯` plutôt que par un `title` invisible relèvent du même principe : **ce qui ne peut pas s'atteindre au doigt ne doit ni s'afficher, ni être le seul porteur d'une information.**
