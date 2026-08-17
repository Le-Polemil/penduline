---
story: "Accessibilité : alternative clavier au glisser-déposer"
story_code: "accessibilite-clavier"
issues: [38]
created: 2026-08-17
---

# Contexte

## Description fonctionnelle

Réordonner une tâche ou une matrice passe aujourd'hui exclusivement par le
glisser-déposer : sans souris ni écran tactile, la fonction est absente. Le seul
chemin alternatif existant — la feuille d'actions ouverte par appui long sur
l'accueil — filtre sur `pointerType === 'touch'` et reste donc hors d'atteinte au
clavier. À cela s'ajoutent trois écarts mesurés en amont : les gris
`--color-neutral-500` et `-600` tombent sous le seuil AA de 4,5:1 pour du texte
(2,42:1 et 3,61:1 sur le fond de page), les anneaux de focus utilisent des teintes
à 1,1–1,3:1 là où 3:1 est requis, et le champ d'ajout de chaque case pose un
`outline: none` sans remplacement. La story est un jalon de mise en conformité
WCAG, pas un jalon de confort : elle conditionne tout usage professionnel ou
institutionnel du produit, et ferme des écarts qui sont aujourd'hui relevés
automatiquement par un audit.

Le périmètre couvre le réordonnancement au clavier des tâches dans une matrice et
des matrices sur l'accueil, plus le rangement d'une matrice dans un univers. Deux
chemins coexistent volontairement pour les tâches : des entrées « ↑ Monter » /
« ↓ Descendre » dans le menu `⋯`, qui rendent la fonction découvrable, et un
raccourci `Alt`+↑/↓ qui la rend praticable sur plusieurs déplacements consécutifs.
Sur l'accueil, les actions de ligne d'une matrice gagnent des boutons ↑ ↓ et un
`⋯` qui ouvre la feuille d'actions déjà écrite — réutilisée plutôt que remplacée,
mais désormais conforme à ce qu'un dialogue clavier exige (focus à l'ouverture,
`Échap`, focus rendu au déclencheur). S'y ajoutent une région `aria-live`
annonçant chaque déplacement, des noms accessibles pour les boutons aujourd'hui
nommés `⋯`, `✕` ou `0`, une règle `:focus-visible` globale, et les attributs
`name` / `autocomplete` sur les formulaires de connexion et de mot de passe.

Ce qui ne change pas : le glisser-déposer existant, le modèle de données (aucune
migration), et surtout la vue globale, où le réordonnancement a été retiré à
dessein — les entrées de menu et le raccourci ne doivent pas y apparaître, ce
qu'on obtient en n'y passant simplement pas la prop `reorder`. Les tokens de
couleur gardent leurs valeurs : seuls leurs usages textuels basculent vers
`--color-neutral-700`, la contrepartie assumée étant un aplatissement de la
hiérarchie typographique. L'extension Chrome est explicitement hors périmètre :
elle a son propre glisser, et la traiter ferait déborder une story déjà élargie
aux matrices — un ticket dédié est à ouvrir.

Côté implémentation, la logique de déplacement est centralisée dans
`packages/shared/src/layout.ts` sous forme de deux fonctions pures, `planReorder`
pour les tâches et `planBoardReorder` pour les matrices, afin que le clavier et le
pointeur partagent exactement le même code et que les bornes soient testées une
seule fois. Point d'attention non évident : `planReorder` raisonne en **lignes**,
pas en tâches — une paire appairée occupe une ligne, et franchir un cran doit
déplacer ses deux cartes ensemble. Le raccourci clavier est posé sur `.card-wrap`
et non sur la carte, pour capter l'événement remontant du contrôle qui a le focus
sans ajouter un arrêt de tabulation par tâche.

Critères d'acceptation : un déplacement au clavier produit le même résultat qu'un
glisser équivalent, y compris pour une paire ; les entrées de menu sont
désactivées aux extrémités ; chaque déplacement est annoncé avec le rang atteint
et le total (« déplacée en 2ᵉ position sur 5 »), le geste seul ne suffisant pas à
situer la tâche ; la vue globale n'offre ni entrées de menu ni raccourci ; ranger
une matrice dans un univers est faisable sans souris ; l'arbre d'accessibilité ne
contient plus aucun bouton nommé `⋯`, `✕` ou `0` ; chaque arrêt de tabulation de
l'accueil, de la matrice et de la vue globale affiche un anneau visible, champ
d'ajout compris. Deux verrous automatiques accompagnent le tout : les tests de
`planReorder` / `planBoardReorder`, et un test de contraste des cinq cases dans
`packages/shared`. Ce dernier est vert dès aujourd'hui — son rôle n'est pas de
corriger mais d'empêcher qu'un futur ajustement de teinte casse la conformité en
silence.

## Vue architecturale

```
packages/shared/src/layout.ts          ← la logique, sans React ni Supabase
  buildRows · insertPosition · positionBefore · planPairMove   (existants)
  planReorder(tasks, task, dir)                                (nouveau)
  planBoardReorder(boards, board, dir)                         (nouveau)
        │
        │  rendent des écritures, n'écrivent pas
        ▼
apps/web/src/screens/                   apps/web/src/App.tsx
  Matrix.tsx  ──┐                         AppRoot
  Global.tsx  ──┤ apply(writes)             └── région aria-live (polite)
  Home.tsx    ──┘ → store.patchTask               ▲
        │                                         │ annonce « rang / total »
        ▼                                         │
  components/TaskCard.tsx  ─────────────────────────┘
    props facultatives : drag? · split? · reorder?
```

Le point d'entrée est `packages/shared/src/layout.ts`, qui devient la seule
autorité sur « ce que déplacer d'un cran veut dire ». Les trois écrans y puisent
déjà — `Matrix.tsx` et `Global.tsx` par `planPairMove` / `planPairPatch` /
`planPairDetach`, `Home.tsx` par `groupByUniverse` — et la story ne fait
qu'étendre ce contrat à deux nouvelles opérations. `TaskCard.tsx` reste le
composant partagé entre l'écran matrice et la vue globale ; c'est lui qui porte
les entrées de menu et le conteneur qui capte le raccourci. `AppRoot` gagne une
région d'annonce unique, alimentée par un hook, que les trois écrans sollicitent
indirectement — c'est le seul élément vraiment transverse introduit ici, et le
mettre plus bas obligerait à en avoir plusieurs, ce qu'un lecteur d'écran gère mal.

La première décision structurante est que le déplacement d'un cran vit dans
`packages/shared` sous forme de fonction pure, exactement comme `planPairMove`.
Le commentaire de `TaskWrite` énonce déjà la raison : ces fonctions rendent ce
qu'il y a à écrire au lieu d'écrire, et c'est ce qui les sort de React et de
Supabase — donc ce qui les rend testables. Il y a ici un second motif, plus
contraignant : la même règle doit servir **deux gestes** (menu et `Alt`+flèches)
sur **deux écrans**, et un jour peut-être l'extension. La duplication n'est pas
hypothétique — l'historique de `planPairMove` montre l'invariant d'appairage
corrigé d'un côté et oublié de l'autre pendant plusieurs jours. La fonction
raisonne en **lignes** et non en tâches, ce qui la rend impossible à
réimplémenter correctement dans un composant :

```
planReorder(tasks, task, dir) :
    rows   ← buildRows(visibleTasks(tasks, task.board_id, task.quadrant))
    i      ← index de la ligne contenant `task`
    j      ← i + dir
    si j hors bornes  → rien                    # l'appelant ignore les bornes
    rest   ← visible privé de `task` ET de sa partenaire
    pos    ← insertPosition(buildRows(rest), j)
    → planPairMove(tasks, task, {}, pos)        # la partenaire suit
```

Trois propriétés en découlent gratuitement : une paire franchit une ligne d'un
seul saut (puisque `buildRows` la compte pour une), les épinglées sont hors du
calcul (`visibleTasks` les exclut déjà), et le retour vide aux extrémités permet à
l'appelant de dériver l'état désactivé de ses boutons sans connaître la structure.
`planBoardReorder` applique la même mécanique au `move(id, dir)` aujourd'hui
inline dans `Home.tsx`, y compris sa subtilité « avant le suivant du suivant »
pour exprimer *après* avec `positionBefore` — une règle qui n'a aujourd'hui aucun
test.

La seconde décision est que `TaskCard` reçoit `reorder` en prop **facultative**,
dans le prolongement exact de `drag` et `split`. Le composant documente déjà ce
parti pris : la différence entre l'écran matrice et la vue globale tient
entièrement dans des props absentes, pas dans un drapeau `mode`.

```
                     drag    split   reorder
  Matrix.tsx           ✓       ✓        ✓
  Global.tsx           ✓       ✗        ✗     ← omission, pas condition
```

Le principal impact sur l'existant est le raccourci `Alt`+↑/↓, posé sur
`.card-wrap` — le conteneur — et non sur la carte ni sur un élément focusable
ajouté pour l'occasion. Le raisonnement est budgétaire : le nombre d'arrêts de
tabulation d'une case est déjà la somme de ses tâches, chacune apportant sa case à
cocher et son `⋯` ; un arrêt supplémentaire par carte doublerait le parcours. En
posant l'écouteur sur le conteneur, on exploite la remontée d'événement depuis le
contrôle qui a réellement le focus :

```
  .card-wrap        ← onKeyDown : Alt+↑/↓ intercepté ici
    └ .task
        ├ .task__check   [focusable]  ─┐
        ├ .task__title                 ├─ l'événement remonte
        └ .task__more    [focusable]  ─┘
```

Deux conséquences à surveiller. D'une part, l'écouteur doit rester inerte quand le
focus est dans un champ (`.task__rename-input`) et quand `reorder` est absent —
sinon la vue globale réintroduirait le geste par la porte de derrière. D'autre
part, `Alt`+flèche est déjà interprété par certains navigateurs comme navigation
d'historique : l'événement doit être consommé quand il agit, laissé passer sinon.

Les autres impacts sont périphériques mais réels. `Home.tsx` voit sa feuille
d'actions changer de statut : écrite pour le tactile et filtrée sur
`pointerType !== 'touch'`, elle devient atteignable au clavier et doit donc
satisfaire le contrat d'un dialogue. C'est la seule brique de la story qui gagne
un vrai comportement nouveau plutôt qu'un câblage. Enfin les tâches de focus et de
contraste touchent `styles.css` de façon transverse : ce sont les changements les
plus larges de la story en surface d'affichage, alors qu'ils sont les plus simples
en logique.

## Impacts UX

L'interface gagne quatre choses, toutes en réutilisation de motifs déjà présents.
Dans le menu `⋯` d'une tâche, deux entrées « ↑ Monter » et « ↓ Descendre » ouvrent
la fonction de réordonnancement à qui ne peut pas glisser ; elles restent
**visibles mais grisées** aux extrémités, comme le fait déjà `.sheet__item:disabled`
— une liste dont les lignes disparaissent selon la position se relit à chaque
ouverture. Sur l'accueil, `.board-row__actions` reprend le motif exact de
`.uni-head__actions` : deux pastilles ↑ ↓, plus un `⋯` qui ouvre la feuille
d'actions existante — celle qui contient « Déplacer vers un univers » et qui,
filtrée sur `pointerType === 'touch'`, n'était atteignable qu'au doigt. Le `⋯`
n'est pas un troisième chemin, c'est la porte clavier d'un chemin déjà écrit ;
l'appui long tactile ne change pas. S'y ajoutent un anneau `:focus-visible` global
en `--color-accent-600` (3,77:1 sur la page, 4,18 sur la carte) en remplacement
des six anneaux en `accent-300` / `accent-100` invisibles, et surtout du
`outline: none` nu de `.add-input` — le champ d'ajout de chaque case ne montrait
aujourd'hui *aucun* focus.

```
Accueil, ligne de matrice — au repos la zone d'actions est repliée ;
elle se déplie au survol ET au focus clavier (:focus-within, déjà en place).

┌──────────────────────────────────────────────────────────────────┐
│ Maison                                            [3][1][2][0]  ›│   repos
└──────────────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────────────┐
│ Maison                   ( ↑ )( ↓ )( ⋯ )  Renommer   Supprimer   │   focus
└──────────────────────────────────────────────────────────────────┘
                            └──┬──┘   │
                    aria-label complet │ ouvre la feuille existante
                 « Monter « Maison » » │ (univers, monter, descendre…)
```

Le coût est réel et porte sur la hiérarchie typographique. Aujourd'hui le texte
secondaire se répartit sur deux gris : `--color-neutral-500` (#a19786) pour le
plus effacé — méta d'une matrice, corbeille vide, `⋯` d'une tâche — et
`--color-neutral-600` (#82796a) pour le reste. Les deux échouent (2,42:1 et
3,61:1 pour 4,5 requis) et, ramenés au seuil, ils **convergent sur la même
valeur** : tout passe en `--color-neutral-700` (5,53:1). On perd donc un cran de
lecture : le sous-titre de l'accueil, la méta d'une matrice et le nom d'un univers
seront de la même encre, et l'œil ne les triera plus par la clarté. Ce qui reste
pour compenser, sans réinventer une couleur non conforme : la **taille** (ces
textes sont déjà à 11–13 px contre 15 px pour le corps), la **graisse** (600 pour
ce qui structure, 400 pour ce qui commente), l'**espacement**, et les capitales à
`letter-spacing: 0.08em` déjà employées sur `.uni-head__name` et `.sheet__label`,
qui distinguent un libellé sans jouer sur la couleur. Le principe : la hiérarchie
descend d'un registre — de la couleur vers la forme.

Côté clavier et lecteur d'écran, trois points décident du résultat. **Un raccourci
que rien n'annonce n'existe pas** : `Alt`+↑/↓ n'a de valeur que parce que l'entrée
de menu le nomme, comme on apprend `Ctrl+S` en lisant le menu Fichier. L'entrée
porte donc son raccourci en clair. Les **annonces `aria-live`** disent la position
atteinte, jamais le geste — « « Sortir les poubelles » déplacée en 2ᵉ position sur
5 », pas « tâche montée » : sans le rang et le total, il faut relire la case
entière pour se resituer, ce qui annule le gain. Enfin, le **nombre d'arrêts de
tabulation** est le vrai budget de cet écran. Poser le raccourci sur `.card-wrap`
n'en ajoute **aucun** dans la matrice. L'accueil, lui, en assume trois de plus par
ligne (↑, ↓, `⋯`, portant la ligne de 3 à 6) : c'est le prix d'une fonction qui
n'existait pas au clavier, et il est contenu par le fait que les listes de
matrices sont courtes.

```
Menu ⋯ d'une tâche — le raccourci s'apprend en lisant le menu.

  ┌───────────────────────────────┐
  │ Renommer                      │
  │ ↑ Monter            Alt+↑     │  ← grisée si 1ʳᵉ ligne de la case
  │ ↓ Descendre         Alt+↓     │  ← grisée si dernière
  │ Déplacer vers                 │
  │ [Faire] [Planifier] …         │
  └───────────────────────────────┘

  Après action, région aria-live="polite" unique au niveau AppRoot :
  ▸ « « Sortir les poubelles » déplacée en 2ᵉ position sur 5. »
    (position atteinte, pas geste effectué)
```

Un point ne doit pas bouger : **la vue globale ne reçoit pas de
réordonnancement**. Elle l'a perdu à dessein en #18 — l'ordre y est celui d'une
lecture transversale, pas celui d'une case qu'on organise. Le moyen retenu est
structurel plutôt que conditionnel : la prop `reorder` est facultative, et
`Global.tsx` l'omet comme il omet déjà `split`. Les entrées n'existent pas, plutôt
que d'exister désactivées. Corollaire à vérifier explicitement : `Alt`+flèches doit
y rester **sans effet**, y compris silencieux côté `aria-live` — une annonce sans
déplacement serait pire qu'un raccourci inerte. Les contrastes des cinq cases, eux,
ne changent pas non plus : ils sont déjà conformes, et les arbitrages de teinte
documentés dans `quadrants.ts` — notamment le fond de « Déléguer », seule case de
la même famille que le beige de la page — ne se retouchent pas. Ils se verrouillent
par un test.
