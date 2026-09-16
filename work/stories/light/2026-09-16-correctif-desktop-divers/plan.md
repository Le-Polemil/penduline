---
story: "Correctif Desktop — divers"
story_code: "correctif-desktop-divers"
created: 2026-09-16
status: "Done"
---

# #92 — Correctif Desktop : divers

## Contexte

Pendant desktop de la passe mobile. L'audit A/B se faisant de toute façon des deux
côtés, ce qui casse côté desktop a été constaté au même moment — et n'avait pas de
raison de repartir dans les lots mobiles. Le ticket est volontairement fourre-tout :
le desktop est le mode le plus relu, donc on ne savait pas ce qu'on allait trouver.

Deux items figuraient déjà dans l'inventaire de l'issue ; #89, #90 et #91 en ont
ajouté trois, et la passe desktop dédiée quatre de plus.

## Inventaire constaté

Relevé à 1440 × 900 à la souris, avec des contrôles à 1024 × 768 et 2560 × 1440.

### 1 — Dissocier une paire oblige à passer par `⋯` *(déjà dans l'issue)*

`.card-row--paired::before` est un pseudo-élément de 10 px, `content: ''`, sans
existence dans le DOM — vérifié : zéro élément d'appairage entre les deux cartes.
La marque dit qu'il y a un lien, mais le seul geste pour le rompre est
`⋯` → « Dissocier ». Le geste évident — cliquer le lien — n'existe pas.

`unpair(task)` existe déjà entièrement (`Matrix.tsx`, `Global.tsx` → `planPairDetach`
via `store.group`, donc `Ctrl+Z` la défait). Il n'y a rien à écrire côté logique.

### 2 — Les cartes passent devant la corbeille *(déjà dans l'issue, **reproduit**)*

L'issue le donnait comme « piste déduite de la lecture du code, non reproduite ».
**C'est reproduit** : en ralentissant `::view-transition-group(*)` à 4 s et en
capturant à mi-animation, les cartes de « Planifier » et « Éliminer » sont peintes
**par-dessus** le panneau de corbeille.

La cause est celle qui était supposée : pendant une transition, les éléments nommés
sortent de l'arbre de rendu normal vers des `::view-transition-group`, où le
`z-index` du document ne les ordonne plus. Trois choses portent un nom —
le bouton corbeille, le panneau (`bin`) et **chaque carte** (`vt-{id}`) — et les
groupes sont peints dans l'ordre de rencontre des noms. `styles.css` ne règle
aujourd'hui que la durée de `::view-transition-group(*)`, jamais l'empilement.

### 3 — Case à cocher **sans aucun contour** sur « Aujourd'hui » et « Revue »

Mesuré sur la revue : `border-style: none`, `border-width: 0px`. La case est une
boîte de 18 × 18 px totalement invisible.

`--q-ink` n'est posé que sur `.quad` (`Matrix.tsx:588`, `Global.tsx:381`), or ces
deux écrans rendent des `TaskCard` **hors quadrant**. `border: 2px solid var(--q-ink)`
devient alors invalide au calcul, et **tout le raccourci `border` tombe** — pas
seulement la couleur. Vérifié : `--q-ink` est bien `(NON DÉFINIE)` sur ces cartes.

Ce n'est pas un défaut mobile : il est là sur les deux modes depuis toujours.

### 4 — Aucun piège de focus dans les modales

Corbeille ouverte : **100 éléments focusables restent atteignables derrière elle**,
et le fond ne porte ni `inert` ni `aria-hidden`. `useDialog` donne bien le focus au
panneau, ferme sur `Échap` et rend le focus en partant — mais `Tab` sort de la
modale et parcourt la page qu'elle recouvre. `aria-modal="true"` le dit aux
technologies d'assistance ; le clavier, lui, n'en sait rien.

### 5 — Titres de paire illisibles **à toute largeur**

Même à 2560 px, les deux cartes d'une paire affichent « [AUDIT]… ». Une case fait
380 px, divisée en deux, moins poignée, case, `⋯` et gouttières : ~80 px de titre.
#89 a réglé le téléphone en empilant sous 720 px ; au-dessus, rien n'a changé.

### 6 — `cursor: grab` sur des cartes qui ne se déplacent pas

`.task { cursor: grab }` est inconditionnel. Or une carte n'est déplaçable que si
la prop `drag` est fournie — ni « Aujourd'hui » ni « Revue » ne la passent — et
`draggable` est en plus retiré aux tâches cochées et à celle qu'on renomme. Le
curseur promet donc un geste qui n'existe pas, ce que le ticket demande justement
de vérifier.

### 7 — Le chevron de la revue fait 5,7 × 15 px

`.review-signal__caret` : un « ▾ » de 12 px, collé à gauche du titre, si petit qu'il
se lit comme un point. C'est pourtant le seul indice qu'un signal se déplie.

### 8 — Bouton d'effacement natif, hors palette

`.sr-input` est un `type="search"` : Chrome y dessine son
`::-webkit-search-cancel-button`, en bleu système, au milieu d'une palette beige et
terracotta.

### 9 — `Ctrl+Z` reste actif derrière une modale

`useUndoShortcut` écoute `window` et n'est neutralisé que dans un champ de saisie.
Corbeille, recherche ou confirmation ouverte, il annule une écriture **invisible**,
et son toast s'affiche derrière la modale.

## Décisions prises

- **Les cartes appairées sont allégées** plutôt qu'empilées : elles perdent leur
  poignée — c'est la PAIRE qui se déplace d'un bloc, la poignée individuelle ment
  déjà — et leurs deux raccourcis, qui restent dans leur `⋯`. La lecture côte à
  côte, qui est tout l'intérêt de la paire, est préservée.
- **`Ctrl+Z` devient inerte quand une modale est ouverte**, exactement comme il
  l'est déjà dans un champ de saisie : annuler ce qu'on ne voit pas n'est pas
  annuler.

## Travaux

### 1. Publier l'inventaire sur #92
Y compris la **reproduction** de l'item 2, que l'issue donnait pour non reproduit.

### 2. La case à cocher invisible — `styles.css`
Donner à `--q-ink` une **valeur de repli** partout où elle est lue sans quadrant :
`var(--q-ink, var(--color-neutral-600))` dans `.task__check` et `.sub__check`, plus
tout autre usage hors quadrant. C'est le correctif minimal et il traite la cause —
un raccourci `border` ne doit jamais dépendre d'une variable qui peut manquer.

Passer en revue les **autres** lectures de `--q-ink`, `--q-dark`, `--q-bg` et
`--q-solid` : celles qui vivent dans un composant rendu hors `.quad` ont le même
défaut latent. Un test de `styles.test.ts` pourrait verrouiller « aucune variable
de quadrant lue sans repli », mais seulement si la liste reste lisible.

### 3. L'empilement des transitions de vue — `styles.css`
`::view-transition-group(bin) { z-index: 100 }`, à côté de la règle de durée
existante. Vérifier avec la même méthode que l'audit : ralentir à 4 s, capturer à
mi-animation, constater que plus aucune carte ne passe devant.

### 4. Le piège de focus — `apps/web/src/a11y/useDialog.ts`
Ajouter le confinement de `Tab` au contrat déjà porté par ce hook. Il est le point
de passage unique des trois surfaces modales (confirmation, corbeille, recherche),
donc une seule implémentation les couvre toutes. Le `onKeyDown` existant intercepte
déjà `Échap` : `Tab` s'y ajoute — on collecte les focusables du panneau et on boucle
du dernier au premier, et inversement avec `Maj`.

### 5. Les cartes appairées — `TaskCard.tsx` + `styles.css`
Une nouvelle prop facultative — dans l'esprit de `drag`, `split` et `reorder` :
absente, rien ne change. Quand la carte appartient à une paire, poignée et raccourcis
disparaissent, le `⋯` reste. `Matrix.tsx` et `Global.tsx` la renseignent ; les deux
savent déjà si une tâche est appairée (elles rendent `.card-row--paired`).

### 6. Le bouton « dissocier » sur le lien — `TaskCard.tsx` ou les écrans
Le pseudo-élément devient un vrai `<button>` rendu dans `.card-row--paired`. La
responsabilité remonte donc du CSS vers le rendu de la ligne — c'est-à-dire vers
`Matrix.tsx` et `Global.tsx`, les deux écrans qui composent des `card-row`.

À soigner : cible de 44 px sur un trait de 10 px sous `(pointer: coarse)` (#89), et
le bouton ne doit **pas** n'apparaître qu'au survol, sinon il est inatteignable au
doigt (#90). Sous 720 px la paire est empilée et le lien est vertical : le bouton
doit s'y poser aussi.

### 7. Le curseur de carte — `styles.css` + `TaskCard.tsx`
`cursor: grab` seulement quand la carte est réellement déplaçable. Le composant
connaît déjà la réponse (`!!drag && !task.done && !renaming`, l'expression même de
`draggable`) : une classe suffit, plutôt qu'une règle CSS qui devinerait.

### 8. Le chevron de la revue — `styles.css`
`.review-signal__caret` passe à une taille lisible et se cale sur la ligne du titre.

### 9. Le bouton d'effacement natif — `styles.css`
`.sr-input::-webkit-search-cancel-button { display: none }`. Le panneau se ferme par
`Échap` et par sa croix ; un second bouton d'effacement, en bleu système, n'apporte
rien.

### 10. `Ctrl+Z` et les modales — `apps/web/src/data/useUndoShortcut.ts`
Ignorer le raccourci si un `[role="dialog"]` est présent dans le document, à côté de
la garde existante sur les champs de saisie, avec le même commentaire d'intention.

## Vérification

**Automatique** — `npm run typecheck`, `npm test`, `npm run build`.

**Manuelle, 1440 × 900 à la souris**, sauf mention contraire :

1. **Aujourd'hui et Revue** — la case à cocher a de nouveau un contour :
   `border-width` non nul sur les deux écrans.
2. **Corbeille** — ralentir `::view-transition-group(*)` à 4 s, ouvrir, capturer à
   mi-animation : aucune carte devant le panneau.
3. **Clavier** — corbeille ouverte, `Tab` répété revient au début du panneau sans
   jamais atteindre la page derrière ; `Maj+Tab` depuis le premier va au dernier ;
   `Échap` ferme et rend le focus au bouton corbeille.
4. **Paire** — les deux titres se lisent ; un clic sur le lien dissocie ; `Ctrl+Z`
   rétablit la paire.
5. **Paire à 390 px** — empilée, lien vertical, bouton de dissociation atteignable
   et de 44 px.
6. **Curseurs** — `grab` sur une carte déplaçable, pas sur une carte de « Revue »,
   pas sur une tâche cochée.
7. **Recherche** — plus de croix bleue native.
8. **`Ctrl+Z`** — sans effet corbeille ouverte ; retrouve son effet une fois fermée.
9. **1024 et 2560** — aucune régression de mise en page.

## Hors périmètre

- Le glisser tactile réel, toujours absent → ticket à ouvrir.
- Le menu `⋯` devenu haut au doigt (705 px depuis #89) : il reste atteignable, mais
  une feuille par le bas serait plus juste → ticket à ouvrir.
