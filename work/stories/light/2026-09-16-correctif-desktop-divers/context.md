---
story: "Correctif Desktop — divers"
story_code: "correctif-desktop-divers"
created: 2026-09-16
---

# Contexte

## Description fonctionnelle

Le desktop est le mode le plus regardé de Penduline, et c'est aussi celui qu'on n'avait jamais relu d'un bloc. #92 est volontairement fourre-tout — on ne savait pas ce qu'on allait trouver — mais un fourre-tout n'est pas une absence de priorité : ce que la passe a trouvé se hiérarchise très proprement. **Deux vrais bugs** d'abord — une case à cocher totalement invisible sur « Aujourd'hui » et « Revue », et des cartes qui passent devant le panneau de corbeille pendant son ouverture. **Un trou d'accessibilité** ensuite : aucune des trois modales ne retient le focus, et corbeille ouverte, 100 éléments focusables restent atteignables derrière elle au clavier. **Un geste manquant** : dissocier une paire oblige à ouvrir le menu `⋯` alors que le lien d'appairage est là, à l'écran, sous les yeux. Et de la finition, enfin. Rien de tout cela ne concerne une minorité de configurations : ce lot répare des choses vues par **tous** les utilisateurs desktop, sur les écrans qu'ils ouvrent en premier.

Les deux bugs méritent d'être nommés pour ce qu'ils sont. La case à cocher n'a pas « une couleur un peu pâle » : elle a `border-width: 0px`, une boîte de 18 × 18 px sans le moindre contour, sur deux écrans, depuis toujours — et sur les deux modes, desktop comme mobile. La cause est unique et vaut correctif de fond : la couleur du quadrant n'existe que dans un quadrant, ces deux écrans rendent des cartes hors quadrant, et un raccourci `border` qui dépend d'une variable manquante ne se contente pas de perdre sa couleur, il tombe en entier. Quant aux cartes qui passent devant la corbeille, l'issue les donnait pour « piste déduite, non reproduite » : elles sont désormais **reproduites**, animation ralentie et capture à mi-parcours à l'appui. Le trou d'accessibilité, lui, se répare une seule fois : les trois surfaces modales — confirmation, corbeille, recherche — passent toutes par le même point, et c'est là que `Tab` sera confiné.

Côté geste, la paire gagne ce que sa marque visuelle promettait déjà : le lien entre les deux cartes devient un vrai bouton, cliquable pour dissocier, annulable par `Ctrl+Z` comme le reste. Deux décisions l'accompagnent. Les cartes appairées sont **allégées plutôt qu'empilées** — elles perdent leur poignée de déplacement, qui mentait déjà puisque c'est la paire qui bouge d'un bloc, et leurs raccourcis, qui restent dans leur `⋯` ; leurs titres redeviennent lisibles sans sacrifier la lecture côte à côte, qui est tout l'intérêt de la paire. Et **`Ctrl+Z` devient inerte quand une modale est ouverte**, exactement comme il l'est déjà dans un champ de saisie : annuler une écriture qu'on ne voit pas, avec un toast qui s'affiche derrière la modale, n'est pas annuler. S'y ajoute la finition : le curseur « main qui saisit » disparaît des cartes qui ne se déplacent pas, le chevron de la revue — seul indice qu'un signal se déplie, aujourd'hui large de 5,7 px — redevient lisible, et la croix bleue native du champ de recherche cesse de trouer la palette beige et terracotta.

Le périmètre s'arrête là : aucune donnée, aucun parcours, aucun écran nouveau. On ne touche ni au modèle des tâches, ni à l'appairage lui-même — la logique de dissociation existe déjà entièrement, ce lot ne fait que lui donner un bouton —, ni au rendu mobile au-delà de ce que la case à cocher corrige mécaniquement des deux côtés. Restent explicitement hors périmètre, chacun renvoyé à son propre ticket : le glisser tactile réel, toujours absent ; et le menu `⋯` devenu haut au doigt depuis #89, atteignable mais qui mériterait une feuille par le bas.

Critères d'acceptation :

- Sur « Aujourd'hui » et sur « Revue », la case à cocher a de nouveau un contour visible — `border-width` non nul —, et les autres composants rendus hors quadrant ne présentent plus le même défaut latent.
- Corbeille ouverte avec l'animation ralentie et capturée à mi-parcours : plus aucune carte n'est peinte devant le panneau, quel que soit le quadrant.
- Corbeille ouverte, `Tab` répété reste dans le panneau et revient à son premier élément ; `Maj+Tab` depuis le premier va au dernier ; `Échap` ferme et rend le focus au bouton corbeille. Même comportement sur la confirmation et sur la recherche.
- Les deux titres d'une paire se lisent à 1440 px ; un clic sur le lien entre les deux cartes dissocie la paire, et `Ctrl+Z` la rétablit.
- À 390 px la paire reste empilée, le lien est vertical, et le bouton de dissociation y est atteignable au doigt avec une cible de 44 px — sans dépendre du survol.
- Le curseur de saisie n'apparaît que sur une carte réellement déplaçable : ni sur « Revue », ni sur une tâche cochée, ni sur une tâche en cours de renommage.
- Le champ de recherche n'affiche plus la croix bleue native ; le chevron de la revue est lisible et aligné sur la ligne du titre.
- `Ctrl+Z` reste sans effet tant qu'une modale est ouverte, et retrouve son effet dès qu'elle est fermée.
- Aucune régression de mise en page à 1024 × 768 ni à 2560 × 1440 ; `npm run typecheck`, `npm test` et `npm run build` passent.

## Vue architecturale

Les neuf correctifs ne forment pas un lot homogène : ils se répartissent sur quatre couches qui n'ont pas les mêmes règles de défaillance. `styles.css` porte l'essentiel (case à cocher, empilement des transitions, chevron de revue, bouton d'effacement natif, curseur) ; `TaskCard.tsx` reçoit deux nouvelles props facultatives, dans la lignée exacte de `drag`, `split` et `reorder` — absentes, rien ne change ; `Matrix.tsx` et `Global.tsx`, seuls composeurs de `.card-row`, gagnent le rendu du bouton de dissociation ; et deux hooks transverses, `useDialog.ts` et `useUndoShortcut.ts`, complètent le contrat modal. La ligne de partage utile n'est pas « CSS vs TSX » mais « ce qui échoue bruyamment vs ce qui échoue en silence » : `tsc` et les tests couvrent la première moitié, `styles.test.ts` (verrou introduit par #91) est aujourd'hui le seul filet de la seconde.

```
                       ┌──────────────────────────────┐
  Matrix.tsx ─────────▶│  .card-row[--paired]         │  ← le bouton « dissocier »
  Global.tsx ─────────▶│    └─ .card-wrap ─ TaskCard  │     naît ICI, plus dans ::before
                       └──────────────────────────────┘
        │                          │
        │ unpair(task) ── planPairDetach ── store.group ── Ctrl+Z
        │
        └─▶ useDialog() ◀── confirmation / corbeille / recherche  (point de passage UNIQUE)
              useUndoShortcut() ── window keydown ── garde : champ de saisie (+ modale)
```

Le défaut le plus instructif est la case à cocher sans contour, parce que son mode de défaillance n'est pas celui qu'on attend d'une variable manquante. `border: 2px solid var(--q-ink)` n'est pas une couleur qu'on perd : la substitution échoue, la déclaration devient invalide au calcul, et **le raccourci entier tombe** — largeur, style, couleur. Une boîte de 18 × 18 px sans aucune bordure, et rien nulle part pour le signaler. La cause est un contrat implicite jamais écrit : `--q-ink`, `--q-dark`, `--q-bg` et `--q-solid` sont posées sur `.quad` par `Matrix.tsx` et `Global.tsx`, et ne vivent donc que sous un quadrant — or « Aujourd'hui » et « Revue » rendent des `TaskCard` hors quadrant. La règle en découle et vaut au-delà de ce ticket : *toute lecture d'une variable de quadrant depuis un composant qui peut être rendu hors `.quad` porte un repli*. Le fichier en compte déjà un exemple isolé (`var(--q-ink, var(--color-accent))` sur le bandeau de balayage), ce qui confirme que la règle existait dans la tête de quelqu'un sans jamais être formulée. `styles.test.ts` est le bon endroit pour la rendre exécutable, à condition que la liste des exceptions reste lisible — un verrou illisible se contourne.

L'empilement des transitions de vue relève du même genre : un mécanisme qui invalide une intuition sans le dire. Pendant une transition, l'API extrait les éléments nommés de l'arbre de rendu normal et les projette dans une arborescence de pseudo-éléments parallèle ; le `z-index` du document n'y ordonne plus rien, et les `::view-transition-group` sont peints dans l'ordre de rencontre des noms. Trois choses portent un nom — le bouton corbeille, le panneau `bin`, et **chaque carte** via `vt-{id}` — d'où des cartes de « Planifier » et « Éliminer » peintes par-dessus le panneau. Le correctif doit donc se déclarer là où l'empilement existe encore, c'est-à-dire sur le pseudo-élément lui-même, à côté de la règle de durée déjà présente. C'est la même leçon que le commentaire déjà posé sur `.task-swipe > .task` : un `view-transition-name` crée un contexte d'empilement par effet de bord, et l'ordre de peinture cesse d'être déductible du DOM.

```
  hors transition                    pendant la transition
  ───────────────                    ─────────────────────
  document                           ::view-transition
   ├ .task  (z-index doc)             ├ group(vt-a) ─┐  ordre = rencontre des noms,
   ├ .task                            ├ group(vt-b) ─┤  PAS le z-index du document
   └ .bin   (z-index doc)             └ group(bin)  ─┘  → l'empilement se déclare ici
```

Deux décisions déplacent une responsabilité plutôt que d'ajouter du code. D'abord le piège de focus : `useDialog` est le point de passage unique des trois surfaces modales, il tient déjà la prise de focus, `Échap` et la restitution — y confiner `Tab` fait que **une seule implémentation couvre les trois**, et que toute modale future hérite du contrat complet sans le savoir. Le `onKeyDown` existant devient un aiguillage à deux touches (`si Échap → fermer ; si Tab → boucler du dernier focusable au premier, et l'inverse avec Maj`), ce qui aligne enfin le clavier sur ce que `aria-modal="true"` promettait déjà aux technologies d'assistance. Dans la même logique, `useUndoShortcut` gagne une seconde garde symétrique de celle sur les champs de saisie : la présence d'un `[role="dialog"]` — que `useDialog` pose sur chaque surface — suffit à rendre `Ctrl+Z` inerte, sans que les écrans aient à se coordonner.

Ensuite, et c'est le changement de nature le plus net du lot, la marque de paire remonte du CSS vers le rendu. `.card-row--paired::before` était un trait de 10 px sans existence dans le DOM : il pouvait dire qu'un lien existe, jamais offrir de le rompre. En devenant un vrai `<button>`, il quitte `styles.css` pour `Matrix.tsx` et `Global.tsx` — les deux seuls écrans qui composent des `card-row`, et qui savent déjà si une tâche est appairée puisqu'ils décident de la classe. Le coût est une duplication assumée entre deux écrans, à mettre en regard du bénéfice : `unpair(task)` existe déjà entièrement des deux côtés et passe par `store.group`, donc `Ctrl+Z` rétablit la paire sans une ligne de logique nouvelle. Trois acquis récents contraignent ce bouton et doivent être respectés d'emblée : 44 px de cible sous `(pointer: coarse)` (#89), pas d'apparition réservée au survol sous peine d'être inatteignable au doigt (#90), et la variante empilée sous 720 px où le lien est vertical. Même esprit pour le curseur : plutôt qu'une règle CSS qui devinerait la déplaçabilité, le composant expose ce qu'il calcule déjà (`!!drag && !task.done && !renaming`) sous forme de classe — la connaissance reste là où elle est établie, et le CSS cesse de promettre un geste qui n'existe pas.

## Impacts UX

Une case à cocher sans contour n'est pas une case à cocher discrète : c'est un trou. Sur « Aujourd'hui » et sur « Revue », `--q-ink` n'existe pas — ces deux écrans rendent des `TaskCard` hors quadrant — donc `border: 2px solid var(--q-ink)` est invalide au calcul et **tout le raccourci tombe**, largeur comprise. Il ne reste pas un contour pâle ou mal contrasté, il ne reste rien : 18 × 18 px de fond de carte, à gauche d'un titre. L'utilisateur qui arrive sur sa liste du jour perd deux choses d'un coup. Il perd la cible — il sait qu'on coche « quelque part à gauche », il vise au jugé, et quand il rate il tombe sur le titre, qui déplie le texte (#95) : le geste d'accomplissement produit une mise en page. Et il perd surtout l'**état** : sur ces écrans, le seul signal qu'une tâche est faite est le remplissage de cette case, doublé du barré du titre. Sans contour, une tâche non cochée et une zone vide se ressemblent exactement, et « où j'en suis » — la seule question que « Aujourd'hui » existe pour répondre — n'a plus de réponse visuelle. Le repli `var(--q-ink, var(--color-neutral-600))` n'est pas un pansement de couleur : il empêche qu'une variable manquante emporte une *géométrie*. Le principe se généralise à toutes les lectures de `--q-ink`, `--q-dark`, `--q-bg` et `--q-solid` hors `.quad`, qui portent le même défaut latent, et c'est ce qu'un test de `styles.test.ts` verrouillerait.

```
Dans un quadrant (--q-ink défini)      « Aujourd'hui » / « Revue » (hors quadrant)
┌──────────────────────────────┐       ┌──────────────────────────────┐
│ ⠿  ◯  Relancer le fourn…  ⚑⋯ │       │ ⠿     Relancer le fourn…  ⚑⋯ │
│    ↑ 18 px, contour 2 px     │       │   ↑ 18 px de rien du tout :  │
│ ⠿  ◉  Préparer le point   ⚑⋯ │       │ ⠿     Préparer le point   ⚑⋯ │
│    ↑ cochée, sans ambiguïté  │       │   ↑ cochée ? pas cochée ?    │
└──────────────────────────────┘       └──────────────────────────────┘
```

La paire pose le problème inverse : la marque est là, c'est le geste qui manque. `.card-row--paired::before` est un trait pointillé de 10 px, `content: ''`, sans aucune existence dans le DOM — on ne peut ni le cliquer, ni le tabuler, ni même le désigner. Il *annonce* un lien et le seul moyen de le rompre est d'ouvrir `⋯` → « Dissocier », c'est-à-dire de chercher dans un menu ce qu'on voit à l'écran. Le transformer en vrai `<button>` change sa nature : un trait décoratif devient une commande, et une commande doit **avoir l'air** d'une commande. D'où trois exigences qui ne sont pas des détails de finition. Elle ne peut pas n'apparaître qu'au survol (#90), sinon on remplace une action cachée dans un menu par une action qui n'existe nulle part au doigt. Elle a besoin de 44 px de cible sous `(pointer: coarse)` sur un trait de 10 px (#89), et sous 720 px, où la paire s'empile, le lien devient vertical et le bouton doit s'y poser aussi. Et parce que dissocier détruit un lien que rien ne reconstitue au regard, la réversibilité prime sur la confirmation : `unpair` passe déjà par `store.group` → `planPairDetach`, donc **`Ctrl+Z` rétablit la paire**. Un dialogue « êtes-vous sûr ? » coûterait un arrêt à chaque geste juste pour couvrir le geste rare ; l'annulation ne coûte rien à ceux qui visaient juste. Dans le même mouvement, les cartes appairées sont **allégées** plutôt qu'empilées : elles perdent leur poignée — c'est la PAIRE qui se déplace d'un bloc, la poignée individuelle promettait un geste faux — et leurs deux raccourcis (étape, aujourd'hui), qui restent accessibles dans le `⋯`. On échange trois affordances, dont une mensongère, contre ~90 px rendus au titre. C'est l'écart entre « [AUDIT]… » et un titre qu'on lit, et la lecture côte à côte — tout l'intérêt de la paire — est enfin ce qu'elle prétend être, même à 2560 px où rien n'avait jamais changé.

```
Avant — une paire dans un quadrant (2 × ~186 px)
┌───────────────────────┐ ╌╌╌╌ ┌───────────────────────┐
│ ⠿ ◯ [AUDIT]…    ⚑ ⋯ │      │ ⠿ ◯ [AUDIT]…    ⚑ ⋯ │
└───────────────────────┘      └───────────────────────┘
    ↑ ment       ↑ ~80 px de titre    ↑ 10 px, zéro DOM :
    (la paire se déplace d'un bloc)     rien à cliquer, rien à tabuler

Après — poignée et raccourcis repliés dans le ⋯, le lien devient un bouton
┌───────────────────────┐ ╭───╮ ┌───────────────────────┐
│ ◯ [AUDIT] Relire l… ⋯│ │ ⊗ │ │ ◯ [AUDIT] Corriger… ⋯│
└───────────────────────┘ ╰───╯ └───────────────────────┘
              ↑ ~170 px lisibles  ↑ « Dissocier », visible sans survol,
                                    44 px de cible, Ctrl+Z rétablit
```

Reste ce qu'on ne voit pas, et c'est précisément le problème. Corbeille ouverte, **100 éléments focusables restent atteignables derrière le panneau** : `useDialog` donne bien le focus, ferme sur `Échap` et rend le focus en partant, `aria-modal="true"` déclare la modalité aux technologies d'assistance — mais le clavier, lui, n'en sait rien, et le fond ne porte ni `inert` ni `aria-hidden`. Concrètement, quelqu'un qui tabule dans la corbeille atteint son dernier bouton, appuie encore, et **l'anneau de focus disparaît**. Il n'est pas perdu : il est sur une carte de la matrice, sous une surface opaque. L'utilisateur, lui, voit une modale qui ne réagit plus — il tape `Entrée` sur ce qu'il croit être le bouton en cours et déclenche une action sur l'écran du dessous, ou il tabule vingt fois dans le vide pour retrouver la sortie. Et s'il utilise un lecteur d'écran, il est dans le pire cas : `aria-modal` lui promet un contenu clos pendant que `Tab` l'en fait sortir — la promesse et le comportement se contredisent. Confiner `Tab` dans le `onKeyDown` qui intercepte déjà `Échap` couvre d'un coup les trois surfaces modales, puisque `useDialog` en est le point de passage unique. Le même principe gouverne `Ctrl+Z` : aujourd'hui il reste actif derrière une modale et annule une écriture **invisible**, avec un toast peint sous le panneau — annuler ce qu'on ne voit pas n'est pas annuler, c'est perdre. Il devient inerte dès qu'un `[role="dialog"]` est présent, exactement comme il l'est déjà dans un champ de saisie. Trois correctifs plus petits obéissent à la même règle — *ne rien promettre qu'on ne tienne* : `cursor: grab` ne s'affiche plus que là où la carte est réellement déplaçable (`!!drag && !task.done && !renaming`, l'expression même de `draggable`), le chevron de la revue quitte ses 5,7 × 15 px pour redevenir le signe lisible qu'un signal se déplie, et le `::-webkit-search-cancel-button` bleu système sort d'une palette beige et terracotta où il ne dit rien que `Échap` et la croix ne disent déjà.

```
Corbeille ouverte — Tab, aujourd'hui
┌─ page ─────────────────────────────────────┐
│  [ matrice : 100 éléments focusables ]     │        ⑤ ⑥ ⑦ …
│         ┌─ corbeille ───────────┐          │   ↘ le focus sort DERRIÈRE
│         │  ① ② ③ ④        [ ✕ ] │          │     le panneau : plus d'anneau
│         └───────────────────────┘          │     visible, Entrée agit à l'aveugle
│    ◯ Relancer…   ◯ Préparer…   ◯ Archi…    │  ← aria-modal dit « clos » ;
└────────────────────────────────────────────┘     Tab dit le contraire

Après — ④ puis Tab revient à ①, Maj+Tab depuis ① va à ④, Échap rend le focus
au bouton corbeille. La page derrière n'est plus jamais atteinte.
```
