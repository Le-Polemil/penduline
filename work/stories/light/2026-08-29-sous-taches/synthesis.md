---
slug: "sous-taches"
title: "Sous-tâches, un seul niveau (#50)"
issues: [50]
created: 2026-08-29
completed: 2026-08-29
status: "Done"
---

# Synthèse

## Résumé

Une tâche peut désormais avoir des **étapes**, sur un seul niveau. C'est la seule
entorse à la platitude revendiquée du modèle (`boards` → `tasks` directement), et
elle est encadrée par trois règles sans lesquelles la matrice deviendrait un
gestionnaire de projet.

PR **#86**, cinquième et dernière de la pile `#82 → #83 → #84 → #85 → #86`.

## Les trois garde-fous, et pourquoi ils tiennent

| Règle | Où elle est tenue |
|---|---|
| Une étape ne peut pas en avoir | **Un trigger**, pas l'interface |
| Une étape n'a pas de case | Elle hérite de celle du parent |
| Elle ne compte dans aucun compteur | `isOpenRow` / `countOpen` |

Le niveau unique est tenu par un **trigger** parce qu'un `check` de ligne ne peut
pas interroger une autre ligne : savoir si le parent a lui-même un parent demande
une lecture. Le laisser au front reviendrait à ne pas le garantir.

Le filtre « une étape n'est pas une ligne de grille » est posé dans
`packages/shared` — les cinq écrans en héritent sans le savoir.

## Les deux pièges du modèle

1. **`parent_id` n'était dans aucun `TASK_COLS`.** Le client ne le sélectionnait
   jamais, donc tout le filtrage était **inerte**. Trouvé au navigateur.
2. **Le `on delete cascade` ne joue aucun rôle à la suppression** : elle est
   douce, aucune ligne n'est effacée. La cascade ne sert qu'au vidage définitif.
   D'où `planDelete` / `planRestore`, qui portent la cascade côté écriture.

## Ce que la validation en navigateur a révélé

Trois défauts qu'aucune relecture n'avait vus, tous du même genre — une règle
écrite à un endroit et redécouverte ailleurs :

- **Les compteurs mentaient** : trois recalculs à la main de « ouverte », tous
  ramenés à `isOpenRow`.
- **Le « 1/3 » retombait à « 0/2 » au rechargement** : les étapes cochées font
  désormais exception au filtre de chargement de #40, et `inWorkingSet` a été
  aligné pour que le temps réel ne les ré-évacue pas.
- **La recherche rangeait une étape cochée dans « Corbeille »** sous un parent
  bien vivant : le partage des sections suit la **destination**, pas l'état de la
  ligne trouvée.

## Changements

- Migration `20260829160000_subtasks.sql` : `parent_id`, index, trigger
- `packages/shared` : `isOpenRow`, `subtasksOf`, `progress`, `planDelete`,
  `planRestore`, `deleteLabel` ; `isVisible` / `pinnedTasks` / `countOpen` filtrés
- `components/Subtasks.tsx` ; `TaskCard` gagne une prop `subtasks` facultative
- Corbeille, recherche, vue globale, extension, confirmation de suppression
- `README.md` : le modèle a changé, la doc le dit

## Tests et validation

- **Tests automatiques** : ✅ 139 (113 `shared` + 26 `web`)
- **Typecheck / build** : ✅
- **CI sur #86** : ✅
- **Validation manuelle** : ✅ les 9 points, sur le Supabase local, 4425 tâches

## À retenir pour la suite

⚠️ **La migration doit atteindre la production AVANT ce front** — comme celles de
#45 (`search_tasks`) et #39 (`realtime`), toujours en attente.

**Résidu assumé** : les étapes d'un parent terminé sont chargées alors qu'elles ne
s'affichent nulle part. Les exclure demanderait de filtrer sur l'état du parent,
donc une jointure — deux requêtes et une dépendance au nom de la contrainte. À
reprendre si le volume le justifie ; il croît en étapes, pas en archives.
