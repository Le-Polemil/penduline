---
story: "Vue globale : toutes matrices ou par univers"
story_code: "vue-globale"
issues: [18]
created: 2026-08-16
---

# Contexte

## Description fonctionnelle

La vue globale répond à un effet de bord direct du modèle produit : Penduline
encourage une matrice par contexte, si bien que personne ne voit jamais
l'ensemble de ses tâches au même endroit. Aujourd'hui, savoir ce qui est urgent
partout oblige à ouvrir les matrices une par une et à recomposer la synthèse de
tête. L'écran agrège les tâches de plusieurs matrices dans une seule grille
d'Eisenhower, sur deux portées : toutes les matrices, ou celles d'un univers.
Les univers, livrés en #17, trouvent ici l'écran qui les lit.

Le périmètre est celui d'un écran de lecture et d'arbitrage, pas de saisie. Une
contrainte du modèle le structure entièrement : `tasks.position` est scopé à
`(board_id, quadrant)`, donc deux tâches de matrices différentes peuvent porter
la même position et **aucun ordre global cohérent n'existe**. Plutôt que
d'inventer un ordre arbitraire, chaque case regroupe ses tâches par matrice, dans
l'ordre d'affichage de l'accueil (univers, puis position, non rangées en
dernier), et l'ordre manuel propre à chaque matrice est préservé tel quel. Le
réordonnancement est donc retiré de cette vue, explicitement et non par accident :
pas d'interstices de dépôt, pas d'appairage par dépôt.

Ce qui survit du geste habituel, c'est ce qui ne dépend d'aucun ordre global.
Glisser une carte vers une autre case reste possible : elle change de quadrant et
se pose en fin de case **dans sa propre matrice**, jamais ailleurs. Le menu `⋯`
conserve toutes ses actions (renommer, déplacer vers une case ou une autre
matrice, épingler, dissocier, supprimer), la complétion garde son toast
d'annulation et son archivage différé, et la corbeille s'ouvre sur la portée
courante. En revanche, l'ajout de tâche est désactivé en v1 : créer depuis la vue
globale imposerait de désigner une matrice cible, c'est-à-dire exactement la
friction que l'écran cherche à supprimer.

Côté acceptation, le comportement se vérifie sur ces points. Sans aucun univers,
le sélecteur de portée est une étiquette inerte « Toutes les matrices » — même
règle que l'accueil, qui n'affiche pas d'en-tête de groupe dans ce cas. Une
matrice qui n'a rien à montrer dans une case n'y laisse aucun cadre vide. Une
paire s'affiche sur une seule ligne, à l'intérieur du cadre de sa matrice ; un
`pair_id` à cheval sur deux matrices — donnée incohérente, inatteignable par
l'interface — dégrade en deux cartes simples sans perte ni erreur. Une portée
dont l'univers a été supprimé ailleurs retombe sur « toutes les matrices » plutôt
que d'afficher un écran vide. Enfin, l'appartenance à une matrice doit rester
lisible sans concurrencer la couleur de la case, qui reste le signal dominant :
le nom de matrice est une étiquette, subordonnée visuellement au libellé de
quadrant.

Un dernier critère porte sur ce qui ne doit **pas** changer. L'écran matrice
existant est refactorisé au préalable — carte, corbeille et logique de complétion
extraites de `Matrix.tsx` pour être partagées plutôt que recopiées — et cette
extraction doit être strictement sans effet visible. Aucune migration
n'accompagne la story : la vue globale ne lit que des données existantes.

## Vue architecturale

La vue globale n'ajoute pas de couche de données : elle ajoute une **portée**
au-dessus de celles qui existent. `useStore` charge déjà l'intégralité des
univers, matrices et tâches du compte en trois requêtes non filtrées ; l'écran
matrice ne fait que restreindre cet ensemble à un `board_id`. La vue globale
relâche cette restriction et la remplace par un ensemble de matrices. Aucune
migration, aucun nouvel appel réseau, aucune notion de portée dans le store : la
portée est un état d'écran, résolu en liste de matrices avant d'atteindre
`packages/shared`.

```
App.tsx ─ View = home | board(id) | global(scope)
   │                                   │
   │                          scope ─ orderedBoards(universes, boards) ─ Board[]
   ▼                                   ▼
Store (universes, boards, tasks : le compte entier, non filtré)
   │                                   │
   │ visibleTasks / pinnedTasks        │ groupTasksByBoard(tasks, boards, quad)
   │ buildRows                         │   └── réemploie visibleTasks/pinnedTasks/buildRows
   ▼                                   ▼
Matrix.tsx : case = lignes         Global.tsx : case = groupes ─ lignes
   └──────────── TaskCard / BinModal / useCompletion ────────────┘
```

Le point structurant est le refus d'un ordre global. `tasks.position` étant scopé
à `(board_id, quadrant)`, la seule agrégation honnête est un regroupement : une
case de la grille devient une liste de `BoardGroup`, chacun portant ses lignes
épinglées et ordinaires calculées **par matrice**. Ce choix a deux conséquences
qui se paient d'elles-mêmes. D'abord `buildRows`, appliqué groupe par groupe,
maintient l'invariant d'appairage sans une ligne supplémentaire : une paire étant
toujours intra-matrice (`planPairMove` emmène la partenaire, y compris lors d'un
changement de matrice), elle retombe naturellement dans un seul cadre ; le cas
incohérent d'un `pair_id` à cheval dégrade en deux cartes simples, jamais en
crash. Ensuite les gestes qui présupposent un ordre — insertion à un interstice,
appairage par dépôt sur une carte — disparaissent, et le seul geste survivant
s'exprime dans le référentiel local : `dépôt sur case → planPairMove(tâche,
{quadrant}, endPosition(visibleTasks(tasks, tâche.board_id, quad)))`, où la
position se calcule dans la matrice d'origine, jamais dans l'agrégat.

La décision de conception qui évite la dette est la façon dont cette différence
de gestes est portée. Plutôt qu'un drapeau `mode` traversant les composants,
`TaskCard` reçoit ses affordances de glisser en props optionnelles : absentes, la
carte n'est ni source ni cible. La vue globale retire donc deux gestes par
omission, pas par conditionnelle. C'est ce qui rend viable la refacto préalable —
sortir de `Matrix.tsx` (769 lignes) la carte et son menu, la corbeille et le cycle
cocher/annuler/archiver — au lieu de dupliquer ces règles. Le précédent est
documenté : la règle d'appairage a déjà vécu en deux copies (web et popup),
corrigée d'un côté et oubliée de l'autre. Cette extraction doit être un commit
distinct, à comportement identique, et son filet de sécurité est la vérification
que l'écran matrice reste inchangé.

Les impacts sur l'existant sont contenus mais réels. `App.tsx` passe d'un
`boardId: string | null` — un booléen déguisé — à une vue explicite à trois
formes, ce qui déplace la logique du fil d'Ariane d'une comparaison de nullité
vers un test de variante ; les deux points d'entrée (accueil et menu de bascule)
réutilisent les conventions existantes plutôt que d'en créer. Deux dégradations
doivent être traitées côté écran et non côté fonctions pures : une portée dont
l'univers a disparu retombe sur « toutes les matrices », et sans aucun univers le
sélecteur devient une étiquette inerte — même règle que l'accueil. Enfin,
`BinModal` change de contrat sémantique (`boardName` → `title`) : la corbeille
cesse d'être celle d'une matrice pour devenir celle d'une portée, ce qui est le
seul endroit où l'agrégation touche une écriture destructive et mérite donc
l'attention du test manuel. Le typecheck ne couvrant pas les données Supabase (le
client rend `any`), c'est bien le plan manuel qui fait foi sur ces points.

## Impacts UX

L'écran global reprend la grille des cinq zones à l'identique — mêmes couleurs,
mêmes titres, même corbeille, même en-tête — pour qu'il se lise sans
apprentissage : ce qui change n'est pas la lecture d'une case, c'est ce qu'elle
contient. Le seul élément neuf est le sélecteur de portée, qui occupe la place du
nom de matrice dans `.matrix-head` et réutilise `.board-switch` / `.board-menu` :
le geste « ouvrir le menu et choisir » est déjà connu, on n'en introduit pas un
second. Sans univers, le sélecteur devient une étiquette inerte, cohérent avec
l'accueil qui n'affiche pas d'en-tête de groupe dans ce cas — un menu à une seule
entrée coûterait un clic pour rien. La deuxième nouveauté est le regroupement par
matrice à l'intérieur de chaque case : sans lui, la vue agrège des tâches dont on
ne sait plus d'où elles viennent, et « urgent partout » redevient une devinette.
Une matrice sans tâche visible dans la case ne pose pas de cadre : sur quatre
cases plus « À trier » et six matrices, l'alternative serait trente cadres dont
la plupart vides.

```
┌─ Faire ─────────── urgent + important ──── (7) ─┐
│ ┌ MAISON ───────────────────────────────────┐   │
│ │ ⚑ ▢ Rappeler le plombier            ⋯     │   │
│ │ ⠿ ▢ Sortir les poubelles            ⋯     │   │
│ └───────────────────────────────────────────┘   │
│ ┌ CLIENT ELAO ──────────────────────────────┐   │
│ │ ⠿ ▢ Relire le devis ⋯ ┄┄ ▢ L'envoyer  ⋯   │   │  ← paire : une ligne, intra-matrice
│ └───────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
        (pas d'interstice pointillé, pas de « ＋ ajouter »)
```

Deux gestes disparaissent, et c'est le point à assumer explicitement. Le
réordonnancement à l'intérieur d'une case n'a aucun sens ici — `position` est
scopé à `(board_id, quadrant)`, il n'existe pas d'ordre global à manipuler — donc
les interstices `.row-gap` ne s'affichent pas pendant le glisser, plutôt que
d'apparaître et de produire un résultat arbitraire. L'appairage par dépôt sur une
carte tombe avec eux : il repose sur `position + 0.001`, et à cheval sur deux
matrices il n'aurait pas de référent. Reste le seul geste indépendant de tout
ordre — déposer sur une autre case, la carte changeant de quadrant et se posant en
fin de liste **dans sa propre matrice**. La création de tâche est elle aussi
retirée : elle exigerait de désigner une matrice avant d'écrire, soit exactement
la friction que l'écran supprime. Le risque UX est qu'un utilisateur habitué à
l'écran matrice croie à une régression. Deux choses le contiennent : l'absence de
`.add-row` et d'interstice est visible avant même de tenter le geste (rien ne
clignote, rien ne s'ouvre), et le menu `⋯` conserve la totalité des actions —
renommer, déplacer vers une case, vers une autre matrice, épingler, dissocier,
supprimer. Le glisser n'y perd que ce que la structure de données ne peut pas
honorer.

```
┌──────────────────────────────────────────────────────────┐
│ [ Toutes les matrices ▾ ]   23 tâches ouvertes    🗑 4    │
└──────────────────────────────────────────────────────────┘
```

Côté accessibilité, l'écran est plutôt en meilleure posture que l'existant : le
glisser n'a jamais été utilisable au clavier, et comme la vue globale en retire
deux usages sur trois, le menu `⋯` — atteignable au `Tab`, déjà seul chemin
clavier vers toutes les actions — couvre ici la quasi-totalité des gestes
disponibles à la souris. La parité clavier/souris s'améliore mécaniquement. Le
point à surveiller est la longueur du parcours : en portée « toutes les
matrices », le nombre d'arrêts de tabulation dans une case est la somme de toutes
les matrices ; l'étiquette de cadre doit donc rester inerte (pas de bouton, pas
d'arrêt supplémentaire), et l'en-tête — sélecteur, total, corbeille — précéder la
grille dans l'ordre du DOM comme sur l'écran matrice. Pour les lecteurs d'écran,
l'appartenance ne doit pas reposer sur la seule mise en page : chaque cadre est un
`role="group"` avec `aria-label` portant le nom de la matrice, sinon la case
s'annonce comme une liste plate de cartes venues de nulle part — c'est le cas
d'usage même de l'écran qui disparaît. Le compteur `.quad-count` continue de
désigner le total de la case, tous groupes confondus. Sur le contraste enfin, les
cinq fonds ne se comportent pas pareil : le cadre dérive de `--q-ink`, donc il se
dilue proportionnellement à la saturation de la case, et « À trier » est le cas
limite — fond transparent sur le beige de page, `ink` gris chaud `#7b756a`, le
moins contrasté des cinq. Le filet ne doit pas être le seul porteur de
l'information : c'est le **nom** qui identifie la matrice, et lui doit tenir le
rapport texte sur les cinq fonds — donc `--q-dark`, pas `--q-ink` dilué, malgré
la petite taille et les capitales espacées de la variante A. Le trait, doublé par
le nom, peut alors rester décoratif et descendre assez bas pour ne pas
concurrencer la couleur de case, qui reste le signal dominant. Aucune matrice ne
se voit attribuer une couleur propre : l'information « de quelle matrice » passe
par le texte, jamais par la teinte, qui est déjà prise par le quadrant.
