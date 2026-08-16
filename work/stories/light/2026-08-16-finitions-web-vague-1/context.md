---
story: "Finitions web Vague 1"
story_code: "finitions-web-vague-1"
issues: [14, 51]
created: 2026-08-16
---

# Contexte

## Description fonctionnelle

Deux tickets qui achèvent la Vague 1 côté web. Ils n'ont rien en commun sur le
fond ; ce qui les réunit est négatif — ce sont les seuls qui **ne touchent pas
l'extension**, donc les seuls livrables pendant que la PR #56 est en revue au
Chrome Web Store. Les mélanger à #12, #13 ou #15 forcerait une seconde revue.

**#14** rend l'ordre des matrices modifiable. La colonne `boards.position` existe
depuis le premier jour et le tri est appliqué au chargement, mais rien ne permet
de la changer : l'ordre reste celui de la création, définitivement. Une matrice
créée en dernier reste en bas même quand elle devient la plus consultée. Le
réordonnancement doit fonctionner à la souris **et au doigt**, ce qui n'est pas la
même mécanique.

**#51** répare une fonctionnalité qui se sabote elle-même. Deux tâches peuvent
s'afficher côte à côte sur une ligne — c'est l'appairage. Mais le geste qui le crée
(glisser une tâche sur une autre) n'est annoncé nulle part, et surtout **tout
déplacement détruit l'association en silence**. L'utilisateur apparie, déplace, et
son lien disparaît sans un mot. La voie retenue est d'assumer le lien : il survit
aux déplacements, se voit, et ne se défait que volontairement.

Critères d'acceptation principaux : l'ordre des matrices se modifie et se conserve,
au doigt comme à la souris ; une paire reste ensemble quoi qu'on lui fasse ; on
peut la défaire explicitement ; et aucun `pair_id` ne subsiste sans partenaire en
base.

## Vue architecturale

Rien de structurel. Les deux tickets exploitent des colonnes déjà présentes
(`boards.position`, `tasks.pair_id`) et des helpers déjà écrits.

```
  packages/shared/src/layout.ts
    positionBefore()  ─┬─▶ apps/extension  (déjà)
                       └─▶ apps/web        (#14, nouveau)
    partnerOf()       ───▶ apps/web        (#51, nouveau)
    buildRows()       ───▶ cases ET épinglées (#51 étend son usage)
```

**La décision la plus utile est de ne rien écrire de neuf pour #14.**
`positionBefore()` implémente déjà l'insertion à position fractionnaire, et
l'extension s'en sert. Le seul obstacle est son typage : `Task[]`, alors que la
fonction ne lit que `id` et `position`. Une interface `Positioned` l'élargit sans
casser aucun appelant — `Task` et `Board` la satisfont tous les deux. Réutiliser
plutôt que dupliquer évite d'avoir deux logiques de position à maintenir en
parallèle.

**Pour #51, le point de conception est un invariant, pas un algorithme :** *une
paire reste ensemble, toujours*. Cinq points d'appel le violaient en remettant
`pair_id` à `null` ; ils doivent désormais déplacer les deux tâches. Chaque
exception qu'on s'autoriserait viderait le lien de son sens — c'est précisément ce
qui rendait la fonctionnalité inutilisable.

Un cas mérite l'attention : les tâches épinglées sont rendues une par une, sans
passer par `buildRows()`. Une paire épinglée s'afficherait donc sur deux lignes,
cassée visuellement. Étendre `buildRows()` aux épinglées est la seule façon de
tenir l'invariant sans interdire d'épingler une paire.

**Impact sur l'existant** : nul en base, nul sur les policies RLS, nul sur
l'extension — qui trie déjà sur `position` et bénéficiera de #14 sans une ligne de
code.

## Impacts UX

**#14** introduit deux gestes pour un même résultat, parce qu'un seul ne couvre pas
les deux usages. Le glisser-déposer HTML5 **ne fonctionne pas au doigt** : il faut
une seconde voie sur mobile, et elle existe déjà — la feuille d'actions d'appui
long, ajoutée précisément parce que les actions au survol sont inatteignables au
doigt. « Monter » et « Descendre » s'y greffent naturellement.

```
   desktop                          tactile (appui long)
   ┌──────────────────────┐         ┌────────────────────┐
   │ ⠿ Cuisine        3 1 │         │ Cuisine            │
   ├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌┤ ← trait │ ↑ Monter           │
   │ ⠿ Boulot         2   │         │ ↓ Descendre        │
   └──────────────────────┘         │ Renommer           │
                                    │ Supprimer          │
                                    └────────────────────┘
```

**#51** doit rendre visible ce qui ne l'est pas. Aujourd'hui rien ne distingue deux
tâches appariées de deux tâches qui se trouvent sur la même ligne par hasard — et
le geste de création n'est annoncé par aucune affordance. Il faut donc une marque
discrète sur les deux cartes d'une paire, et une entrée « Dissocier » dans le menu
`⋯` qui nomme le lien et le rend réversible autrement que par accident.

Le comportement au déplacement devient l'inverse de l'actuel, et c'est voulu :
déplacer une tâche appariée **emmène sa partenaire**. C'est surprenant la première
fois, mais cohérent — et surtout, ça ne détruit plus rien à l'insu de
l'utilisateur.

Accessibilité : le réordonnancement gagne un chemin non-souris via la feuille
d'actions, ce qui sert aussi #38. La marque de paire ne doit pas reposer sur la
seule couleur.
