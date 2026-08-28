---
slug: "tache-cochee-coincee"
title: "La tâche cochée qui ne part jamais (#75)"
issues: [75]
created: 2026-08-25
status: "In Progress"
---

# #75 — La tâche cochée qui ne part jamais

## Contexte

Cocher n'écrit pas un état, il en écrit **deux, à quatre secondes d'intervalle** :
`{ done: true }` tout de suite, `{ archived: true }` après le délai d'annulation.
Et le minuteur qui porte le second ne survit pas au démontage de l'écran
(`useCompletion.ts:39`).

Revenir à l'accueil, recharger, fermer l'onglet ou changer d'application dans ces
quatre secondes laisse donc `done: true` en base et `archived: true` jamais écrit.
Or `isVisible` ne masque que sur les **deux** drapeaux. La tâche s'affiche alors
pour toujours, cochée, sans aucun geste pour la faire partir — et cocher à nouveau
ne fait que la décocher.

**C'est un état intermédiaire persisté, qui ne devrait exister qu'en mémoire.**

Symptôme dérivé : l'extension écrit les deux drapeaux d'un coup et filtre sur
`!t.done`. Une tâche coincée est donc **invisible dans l'extension et éternelle
sur le web** — deux règles de visibilité pour une même donnée.

Dernier défaut visible du jalon « Vague 0 — Avant ouverture ».

### Ce que le ticket ignore, écrit avant #77

- `useCompletion` **ne rend plus `pending`** : seulement `{ onCheck }`. Les toasts
  passent par un hôte commun (`components/Toast`). Les écrans n'ont donc plus
  accès à l'état « en attente » — or c'est précisément lui qui devra porter
  l'affichage pendant le délai.
- `patchTask` rend `Promise<boolean>`, et le store fait revert + toast à l'échec.
- Les numéros de ligne cités sont périmés.

---

## La correction, et pourquoi elle est plus petite que prévu

Le ticket prescrit trois choses. La troisième — réparer l'existant — **tombe** si
l'on choisit bien la règle d'affichage.

### 1. `isVisible` masque sur `done`, pas sur `done && archived`

Une tâche cochée n'a rien à faire dans sa case, que son archivage ait été écrit ou
non. Cette seule ligne :

- fait **disparaître les tâches déjà coincées**, sans migration ni écriture au
  chargement — le critère d'acceptation est satisfait par la règle, pas par une
  passe de rattrapage ;
- **aligne le web sur l'extension**, qui filtre déjà `!t.done` ;
- rend le symptôme **impossible par construction** : même si une écriture échoue
  un jour, plus aucun état ne peut afficher une tâche cochée à demeure.

Même changement sur `pinnedTasks`. `countOpen` filtre déjà sur `!done` — les
pastilles de l'accueil restent justes sans y toucher.

**Corollaire obligatoire : la corbeille liste `done && !deleted`**, sans exiger
`archived`. Sans ça, une tâche coincée deviendrait invisible *et* irrécupérable —
on aurait remplacé un défaut par un pire. `onRestore` écrit déjà les trois
drapeaux : restaurer une tâche coincée la normalise au passage.

### 2. Une seule écriture, et le délai vit en mémoire

`useCompletion` écrit `{ done: true, archived: true }` d'un coup. Les quatre
secondes d'annulation restent, mais l'écran affiche la tâche **parce qu'il sait
qu'elle est en attente**, plus parce que la base la déclare non archivée.

Le hook rend donc à nouveau un `pending`, que les filtres de rendu acceptent en
exception :

```ts
visibleTasks(tasks, boardId, quad, pending?)   // `pending` reste visible malgré `done`
pinnedTasks(tasks, boardId, quad, pending?)
groupTasksByBoard(tasks, boards, quad, pending?)   // la vue globale passe par là
```

Seuls les **trois points de rendu** passent `pending` — `Matrix.tsx:403-404`,
`Global.tsx` via `groupTasksByBoard`. Les autres appels de `visibleTasks` calculent
des positions : une tâche qui s'en va n'a pas à y peser.

### 3. ⚠️ L'annulation doit restaurer l'appairage

Point que le ticket ne voit pas, et le vrai piège de cette correction.

`archive()` applique `planPairDetach(…, { archived: true, pinned: false })` : il
**dissocie la paire**. Rendre l'archivage immédiat rend la dissociation immédiate
— et l'`undo` actuel n'écrit que `{ done: false, archived: false }`. Annuler
casserait donc la paire **en silence**, soit exactement l'invariant que #51 et #60
ont coûté cher à établir.

`pending` retient donc de quoi défaire : l'identifiant de la tâche, celui de la
partenaire, et le `pair_id` d'origine. `undo` réécrit le lien des deux côtés.

---

## Tâches

1. **`packages/shared`** — `isVisible` / `visibleTasks` / `pinnedTasks` /
   `groupTasksByBoard` : masquage sur `done`, paramètre `pending` facultatif.
   Tests : une tâche cochée est masquée quel que soit `archived` (le cas coincé),
   `pending` la garde visible, `countOpen` inchangé, une paire reste une ligne.
2. **`useCompletion`** — écriture unique, `pending` rendu, `undo` restaurant le
   `pair_id` des deux côtés. Le minuteur ne porte plus qu'un nettoyage d'état
   local : **son annulation au démontage devient sans conséquence**, ce qui est
   tout l'objet du correctif.
3. **`Matrix.tsx` / `Global.tsx`** — passer `pending` aux trois points de rendu ;
   corbeille en `done && !deleted`.
4. **Vérifications** — automatiques puis navigateur.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `packages/shared/src/layout.ts` + `.test.ts` | La règle de visibilité et son exception |
| `apps/web/src/data/useCompletion.ts` | Écriture unique, `pending`, `undo` complet |
| `apps/web/src/screens/Matrix.tsx`, `Global.tsx` | Rendu et corbeille |

Aucune migration, aucune écriture au chargement. `apps/extension` n'est pas
touchée : elle avait déjà raison.

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

95 + 21 aujourd'hui. Le test qui compte : **une tâche `done && !archived` est
masquée** — il échoue sur le code actuel, c'est lui qui prouve la correction.

### Plan de test manuel

Base locale (ports décalés 55321-55324, `config.toml` rétabli avant commit),
compte de démo.

1. Cocher une tâche, **recharger dans les 4 s** → elle est rangée, pas coincée,
   et retrouvable dans « Terminées »
2. Cocher puis **revenir à l'accueil** dans les 4 s → idem
3. « Annuler » dans le délai → la tâche revient à sa place, comme avant
4. **Annuler une tâche appairée** → la paire est **toujours là** *(le piège)*
5. Cocher deux tâches coup sur coup → un seul toast, la première part aussitôt
6. Les pastilles de l'accueil ne comptent plus la tâche cochée, dès le clic
7. Même comportement depuis la **vue globale**
8. Fabriquer une tâche coincée à la main
   (`update tasks set done = true, archived = false where …`) → elle **ne
   s'affiche plus** dans la grille, et **apparaît** dans « Terminées » ;
   « Rétablir » la remet en place

Le point 8 vérifie le correctif sur la donnée déjà abîmée, le point 4 vérifie
qu'on n'a pas cassé l'appairage en le corrigeant.

### Livraison

Branche `story-light/tache-cochee-coincee` depuis `main`. PR assignée à `@me`,
fermant **#75**.
