---
story: "Finitions web Vague 1"
story_code: "finitions-web-vague-1"
issues: [14, 51]
created: 2026-08-16
status: "In Progress"
---

# Finitions web Vague 1 — #14 réordonner les matrices, #51 appairage

## Contexte

Ce qui reste de la Vague 1 **purement côté web**. Les trois autres tickets (#12,
#13, #15) touchent l'extension : partir de `main` dessus créerait des conflits
avec la PR #56 en revue, et les livrer avant son merge forcerait **une deuxième
revue Chrome Web Store** — exactement ce que le groupement de #56 évitait.

### #14 — l'ordre des matrices est figé

`boards.position` existe depuis la migration initiale et le tri est appliqué au
chargement (`apps/web/src/data/store.ts:32`), mais **rien ne permet de le
modifier** : l'ordre reste celui de la création. Une matrice créée en dernier
reste en bas pour toujours, même si elle devient la plus utilisée.

### #51 — l'appairage se détruit en silence

`pair_id` met deux tâches côte à côte via `buildRows()`
(`packages/shared/src/layout.ts`). Deux défauts, et le second est le vrai :

1. **Rien n'indique ce que le lien signifie.** Il se crée en glissant une tâche
   sur une autre (`dropPair`, `Matrix.tsx:132`) sans aucune affordance : c'est une
   fonctionnalité qu'on ne peut découvrir que par accident.
2. **Tout déplacement le détruit sans un mot.** `pair_id: null` apparaît dans
   `menuMove`, `dropEnd`, `dropInsert`, `togglePin` et `removeTask`. L'utilisateur
   associe deux tâches, en déplace une, l'association disparaît.

**Voie retenue : A — assumer le lien.** Il survit aux déplacements, s'affiche, et
ne se défait que volontairement.

---

## Tâches

### 1. Généraliser `positionBefore` et `endPosition`

Les deux helpers de `packages/shared/src/layout.ts` sont typés `Task[]`, alors
qu'ils ne lisent que `id` et `position`. #14 en a besoin pour des `Board`.

```ts
export interface Positioned { id: string; position: number }
```

`endPosition` et `positionBefore` passent à `Positioned[]`. `Task` et `Board`
satisfont l'interface : aucun appelant existant ne change. **Réutiliser plutôt que
dupliquer** — `positionBefore` est déjà écrit, testé à l'usage par l'extension, et
c'est exactement la logique de position fractionnaire dont #14 a besoin.

### 2. #14 — réordonner les matrices

**Store** — `reorderBoard(id, beforeId)` dans `apps/web/src/data/store.ts`, sur le
modèle de `renameBoard` (mise à jour optimiste puis persistance), calculant la
position avec `positionBefore(boards.filter(b => b.id !== id), beforeId)`.

**Souris** — glisser-déposer sur les lignes de `Home.tsx`, en reprenant le motif
de `Matrix.tsx` : `draggable` sur `.board-row`, zones de dépôt entre les lignes
avec un trait indicateur (`.board-gap` / `.board-gap__line`, calqué sur
`.row-gap`). Le `draggable` va sur le `<div>` conteneur, pas sur le `<button>`
`.board-card` — un bouton déplaçable se comporte mal, et le clic d'ouverture doit
continuer de fonctionner.

**Tactile** — le DnD HTML5 **ne fonctionne pas au doigt**. « Monter » et
« Descendre » s'ajoutent à la feuille d'actions d'appui long, déjà en place
(`Home.tsx:196`), qui existe précisément pour ça (cf. le commentaire
`@media (hover: none)` dans `styles.css`).

**Cohérence extension** — rien à faire : elle trie déjà sur `position`
(`store.ts`). À vérifier tout de même à l'écran.

### 3. #51 — l'appairage survit aux déplacements

**Invariant à tenir : une paire reste ensemble, toujours.** C'est tout l'objet de
la voie A ; chaque exception le viderait de son sens.

**Helper partagé** — `partnerOf(tasks, task)` dans `layout.ts` : la tâche non
supprimée qui partage son `pair_id`. Il centralise ce que cinq points d'appel
devraient sinon redécouvrir.

**Les cinq points d'appel** de `Matrix.tsx` cessent de mettre `pair_id` à `null`
et déplacent **les deux** tâches :

| Point | Nouveau comportement |
|---|---|
| `menuMove` | Les deux changent de case, positions adjacentes |
| `dropEnd`, `dropInsert` | Idem — glisser une tâche emmène sa partenaire |
| `togglePin` | Les deux s'épinglent ou se désépinglent |
| `removeTask` | La survivante est **dissociée** (pas d'orphelin en base) |

**Épinglage** — les tâches épinglées sont rendues une par une
(`pinned.map(renderCard)`) : une paire épinglée s'afficherait sur deux lignes,
donc cassée visuellement. Passer le rendu des épinglées par `buildRows()` aussi,
comme les autres. C'est la seule façon de tenir l'invariant sans interdire
d'épingler une paire.

**Complétion** — cocher une tâche l'archive après 4 s (`archive`, `Matrix.tsx:66`)
et la fait sortir de sa case. Sa partenaire doit être **dissociée** à ce
moment-là, sinon elle garde un `pair_id` sans partenaire.

**Action explicite** — « Dissocier » dans le menu `⋯`, visible uniquement si la
tâche est appairée. C'est ce qui rend le lien réversible autrement que par
accident.

**Affordance** — le lien doit se voir sans avoir à le deviner : marque visuelle
discrète sur les deux cartes d'une paire, et libellé du menu qui nomme le geste.

**Cas dégradés** — `buildRows()` tolère déjà un partenaire manquant. Deux autres
existent en données anciennes : `pair_id` orphelin et **trois tâches partageant le
même identifiant**. Ce dernier n'est plus atteignable par l'UI (`splitOk` exige
`single`, donc on ne peut pas se greffer sur une paire), mais du code défensif
reste nécessaire.

### 4. Documentation

- `README.md` : la description de `pair_id` (« deux tâches partageant un `pair_id`
  s'affichent côte à côte ») décrit une mise en page. Elle devient un lien.
- Journal `dev.md` tenu après chaque action.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `packages/shared/src/layout.ts` | `Positioned`, `partnerOf`, signatures élargies |
| `apps/web/src/data/store.ts` | `reorderBoard` |
| `apps/web/src/screens/Home.tsx` | DnD, actions tactiles |
| `apps/web/src/screens/Matrix.tsx` | Les cinq points d'appel, « Dissocier », épinglées |
| `apps/web/src/styles.css` | Zones de dépôt, marque de paire |
| `README.md` | Sens de `pair_id` |

Aucune migration SQL : `boards.position` et `tasks.pair_id` existent déjà.

---

## Vérifications

### Automatiques

```bash
npm run typecheck && npm run build      # seules commandes qualité du dépôt
```

> Le dépôt n'a **aucun test** (#31). Or `positionBefore` et `buildRows` sont
> exactement le genre de logique qui casse en silence. À signaler dans #31 : les
> cas dégradés d'appairage listés ici font de bons premiers tests.

### Plan de test manuel

**#14 — ordre des matrices**

1. Réordonner au glisser-déposer sur desktop ; l'indicateur montre où ça tombe
2. Recharger → l'ordre est conservé
3. Ouvrir l'extension → même ordre
4. En mobile (émulation tactile) : appui long → « Monter » / « Descendre »
5. Déplacer la première vers le haut et la dernière vers le bas → sans effet, sans erreur
6. Réordonner une vingtaine de fois de suite au même endroit → l'ordre reste juste
   (les positions fractionnaires se resserrent à chaque insertion)

**#51 — appairage**

7. Appairer deux tâches en glissant l'une sur l'autre
8. Déplacer l'une vers une autre case → **les deux** suivent, côte à côte
9. Réordonner la paire dans sa case → elle reste groupée
10. Épingler une tâche appairée → les deux s'épinglent, côte à côte
11. « Dissocier » → les deux redeviennent indépendantes
12. Cocher une des deux → la survivante reste seule, sans `pair_id` résiduel
13. Supprimer une des deux → idem
14. Vérifier en base qu'aucun `pair_id` ne subsiste sans partenaire

### Livraison

Branche `story-light/finitions-web-vague-1` depuis `main`. PR assignée à `@me`,
fermant **#14 et #51**.
