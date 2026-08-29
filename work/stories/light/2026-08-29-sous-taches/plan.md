---
slug: "sous-taches"
title: "Sous-tâches, un seul niveau (#50)"
issues: [50]
created: 2026-08-29
status: "In Progress"
---

# #50 — Sous-tâches, un seul niveau

## Contexte

Une tâche est **une seule ligne de texte**. « Préparer le déménagement » n'a nulle
part où poser ses étapes.

### La tension, assumée

Le README revendique l'absence de niveau intermédiaire : « `boards` → `tasks`
directement ». La platitude était un **parti pris**, pas un oubli. Ce ticket
introduit délibérément la hiérarchie que le modèle refusait — d'où trois
garde-fous, qui sont la raison pour laquelle ça ne dilue pas le produit :

- **Un seul niveau.** Une sous-tâche ne peut pas en avoir. Sans cette règle, on
  retombe sur un gestionnaire de projet et la matrice perd son sens.
- **Une sous-tâche n'a pas de case.** Le classement urgent/important appartient au
  parent : « déléguer » sous un parent « faire » ne veut rien dire chez Eisenhower.
- **Elles ne comptent pas dans les compteurs.** Un parent à douze étapes écraserait
  visuellement toute la matrice.

---

## Décisions

**La règle du niveau unique est tenue par un TRIGGER, pas par un `check`.** Un
`check` de ligne ne peut pas interroger une autre ligne — savoir si le parent a
lui-même un parent demande une lecture. Le laisser à l'interface seule reviendrait
à ne pas le garantir du tout.

**Une sous-tâche n'est pas une ligne de la grille.** `visibleTasks` et
`pinnedTasks` les écartent : elles s'affichent **sous leur parent**, ailleurs. Le
filtre se pose là plutôt que dans les composants, pour que les cinq écrans en
héritent sans le savoir.

**Pas d'appairage sur une sous-tâche.** L'appairage met deux tâches côte à côte
dans une case ; une sous-tâche n'a pas de case. Les deux notions ne se rencontrent
pas.

**Cocher toutes les sous-tâches ne coche pas le parent.** Le ticket le demande, et
il a raison : clore est une décision, pas une conséquence arithmétique.

**Le repli est local et par tâche**, en `localStorage` comme celui des univers —
c'est un état de lecture, pas une donnée.

---

## Tâches

### 1. Migration `20260829160000_subtasks.sql`

`parent_id` nullable, `on delete cascade`, index, et le trigger du niveau unique.

Le `cascade` est ce qui fait qu'un parent supprimé emporte ses étapes — à
**annoncer dans la confirmation**, sinon la suppression est plus large que ce que
l'utilisateur croit.

> ⚠️ À appliquer en production avant le front.

### 2. `packages/shared`

- `Task.parent_id`, et `parent_id` dans `TaskPatch`.
- `visibleTasks` / `pinnedTasks` : écarter les sous-tâches.
- `countOpen` : les ignorer.
- `subtasksOf(tasks, parentId)` — triées, non supprimées.
- `progress(tasks, parentId)` → `{ done, total }` pour le « 2/5 ».

Tests : une sous-tâche n'apparaît pas dans la grille, ne compte pas, suit son
parent, et une paire reste une paire.

### 3. `TaskCard`

Sous la carte, quand le parent en a : un compteur « 2/5 », un chevron, la liste
repliable, et un champ d'ajout rapide.

Une sous-tâche se coche et se supprime. Elle ne se déplace pas entre cases, ne
s'épingle pas, ne s'appaire pas — elle n'a rien à y faire.

### 4. Les bords

| Endroit | Ce qu'il faut vérifier |
|---|---|
| Vue globale (#18) | `groupTasksByBoard` passe par `visibleTasks` : hérite du filtre |
| Recherche (#45) | Une sous-tâche trouvée doit mener à **son parent** |
| Extension | Le popup filtre déjà `!done && !deleted` : ajouter `!parent_id` |
| Confirmation de suppression | Annoncer les sous-tâches emportées |
| `README.md` | Le modèle a changé, la doc doit le dire |

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

### Plan de test

1. Ajouter une sous-tâche depuis un parent, la cocher, la supprimer
2. Le parent affiche « 1/3 », et le compteur de case **ne bouge pas**
3. Cocher **toutes** les sous-tâches ne coche **pas** le parent
4. Replier / déplier ; le repli survit au rechargement
5. Supprimer le parent : la confirmation **annonce** les sous-tâches
6. Une sous-tâche n'apparaît **jamais** comme ligne de grille, ni en vue globale
7. **La base refuse** une sous-tâche de sous-tâche *(le garde-fou)*
8. La recherche trouve une sous-tâche et mène à **son parent**
9. Le popup de l'extension n'affiche pas les sous-tâches

### Livraison

Branche `story-light/sous-taches` depuis `story-light/annulation` — cinquième de
la pile. PR assignée à `@me`, fermant **#50**.
