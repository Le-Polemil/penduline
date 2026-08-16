---
story: "Fin de la Vague 1"
story_code: "fin-vague-1"
issues: [12, 13, 15]
created: 2026-08-16
---

# Contexte

## Description fonctionnelle

Les trois derniers tickets de la Vague 1, tous côté web **et** extension. Ils
arrivent maintenant que #56 est mergée, et comme la 1.1.0 n'a pas encore été
soumise au Chrome Web Store, ils s'y intègrent : **une seule soumission couvrira
les sept tickets de la vague**.

Les trois réparent des manques, pas des envies. **#12** : une tâche mal saisie ne
peut aujourd'hui qu'être supprimée puis recréée, ce qui lui fait perdre sa
position, son épinglage et son appairage — corriger une faute de frappe coûte donc
le contexte de la tâche. **#13** : une tâche rangée dans la mauvaise matrice ne
peut pas en changer ; le menu ne déplace qu'entre les cases d'une même matrice.
**#15** : il n'existe aucun état de chargement, ni sur le web ni dans le popup — le
code renvoie littéralement `null` en attendant la session, donc l'utilisateur voit
un écran blanc à chaque ouverture.

Critères d'acceptation principaux : renommer une tâche sans rien lui faire perdre ;
la déplacer vers une autre matrice, sa partenaire comprise si elle est appairée, et
en étant prévenu dans ce cas ; et ne plus jamais voir d'écran blanc au démarrage.

## Vue architecturale

Aucune migration, aucun changement de manifeste. Les trois tickets exploitent ce
qui existe : `title` est déjà dans `TaskPatch`, `endPosition()` et `movePair()`
sont écrits, et l'icône n'attend qu'un `<g>`.

```
  #12  TaskPatch.title        (déjà présent)
  #13  TaskPatch.board_id     (+1 ligne)  ──▶ movePair()   ← #51
       endPosition()          (déjà présent)
  #15  icon.svg + <Loader />  ──▶ 4 points qui renvoient `null`
```

**Le point de conception est une conséquence de #51, pas une nouveauté de #13.**
Le ticket prévoyait de remettre `pair_id` à `null` en changeant de matrice — ce qui
était juste quand l'appairage n'était qu'une mise en page. Depuis #51 c'est un lien
qui survit aux déplacements. Casser la paire au passage d'une matrice à l'autre
ferait de ce déplacement **la seule exception** à l'invariant qu'on vient d'établir,
c'est-à-dire exactement la rupture silencieuse que #51 supprimait. La paire suit
donc, et l'utilisateur est prévenu.

**Deux découvertes ont élargi le périmètre par rapport aux tickets.**

La carte de tâche de l'extension n'a **aucun menu** : case à cocher, titre,
épingle. Porter #12 et #13 dans le popup suppose donc de créer l'affordance, pas
de déplacer un composant existant — c'est le vrai coût du lot côté extension.

Et `packages/shared/icon.svg` est un **doublon au bit près** de
`apps/web/public/icon.svg`, référencé par rien. #15 modifiant l'icône, laisser deux
copies identiques dont une morte est le point de départ classique d'une dérive : on
supprime la copie orpheline avant de toucher à l'autre.

## Impacts UX

**#12** ajoute une édition en place plutôt qu'une boîte de dialogue : la carte
bascule en champ, le motif étant déjà celui du renommage des matrices — `autoFocus`,
Entrée valide, Échap annule. L'utilisateur reste où il est.

**#13** introduit un sous-menu, et surtout une confirmation **conditionnelle** :

```
   tâche seule                    tâche appairée
   ┌────────────────────┐         ┌──────────────────────────────┐
   │ Vers une autre     │         │ Déplacer 2 tâches ?          │
   │ matrice        ▸   │         │ « Courses » est appairée à   │
   │   Cuisine          │  ──▶    │ « Pharmacie ». Les deux      │
   │   Boulot           │         │ partiront dans Cuisine.      │
   └────────────────────┘         │      [Annuler]  [Déplacer]   │
                                  └──────────────────────────────┘
```

Confirmer **chaque** déplacement lasserait très vite ; ne rien dire quand deux
tâches partent alors qu'on en a désigné une serait une surprise. La confirmation
n'apparaît donc que là où il se passe quelque chose que l'utilisateur n'a pas
explicitement demandé.

**#15** remplace un écran blanc par le nid du logo qui oscille. Le choix n'est pas
décoratif : le produit tire son nom de la rémiz penduline et de son nid suspendu,
le balancier est littéralement le geste que le nom décrit. `prefers-reduced-motion`
fige le logo — l'information « ça charge » reste, le mouvement disparaît.

Accessibilité : le menu `⋯` de l'extension est révélé au survol, mais reste
atteignable au clavier (`:focus-within`, comme les actions de matrice sur le web) —
sans quoi renommer deviendrait impossible sans souris.
