---
slug: "tache-cochee-coincee"
title: "La tâche cochée qui ne part jamais (#75)"
issues: [75]
created: 2026-08-25
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. `packages/shared` : masquage sur `done`, paramètre `pending`, tests | Terminé | 2026-08-25 |
| 2. `useCompletion` : écriture unique, `pending` rendu, `undo` restaurant l'appairage | Terminé | 2026-08-25 |
| 3. `Matrix.tsx` / `Global.tsx` : `pending` au rendu, corbeille en `done && !deleted` | Terminé | 2026-08-25 |
| 4. Vérifications automatiques (`test`, `typecheck`, `build`) | Terminé | 2026-08-25 |
| 5. Validation en navigateur (8 points du plan) | En attente | |
| 6. Commit, push et PR fermant #75 | En attente | |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->

### 2026-08-25 : la règle de visibilité, et le test qui prouve le bug

**Statut** : Terminé

**Actions réalisées** :
- `isVisible` masque désormais sur `done` seul, avec un paramètre `pending`
  facultatif ; `visibleTasks`, `pinnedTasks` et `groupTasksByBoard` le relaient.
- 5 tests ajoutés, 89 → **94**.

**Fichiers modifiés** :
- `packages/shared/src/layout.ts`, `layout.test.ts`

**Notes** : **le tableau d'états encodait le bug comme une décision produit.** La
ligne « cochée, pas encore archivée » portait `visible: true` avec ce commentaire :
*« Décision produit : une tâche cochée reste VISIBLE tant qu'elle n'est pas
archivée — c'est le délai d'annulation de 4 s. »*

C'est exactement le défaut, écrit noir sur blanc et transformé en intention : le
délai d'annulation vivait dans le **modèle de données**. Le test était fidèle au
code, et c'est ce qui l'a rendu invisible — personne ne relit une ligne
accompagnée d'une justification.

La ligne est renversée, avec la raison du renversement en commentaire. Les quatre
tests écrits AVANT l'implémentation échouaient bien sur le code d'origine.

Une ligne ajoutée au tableau : « épinglée et cochée ». Elle manquait, et le
masquage sur `done` doit valoir aussi dans la zone des épinglées — sans quoi
cocher une épinglée l'aurait fait disparaître sans délai d'annulation.

`archived` sans `done` reste visible, inchangé : cet état ne devrait pas exister,
mais le masquage ne le concerne pas.

### 2026-08-25 : une seule écriture, et l'annulation qui répare la paire

**Statut** : Terminé

**Actions réalisées** :
- `useCompletion` écrit `{ done: true, archived: true, pinned: false }` en une
  fois, dissociation de paire comprise.
- Le minuteur ne fait plus qu'appeler `settle` — **il n'écrit plus rien**.
- `pending` porte de quoi défaire : l'identité de la tâche, celle de la
  partenaire, et le `pair_id` d'origine.
- `Matrix.tsx` et `Global.tsx` passent `pending` aux trois points de rendu et
  listent leur corbeille en `done && !deleted`.

**Fichiers modifiés** :
- `apps/web/src/data/useCompletion.ts`
- `apps/web/src/screens/Matrix.tsx`, `Global.tsx`

**Notes** : **le vrai piège était l'appairage**, et le ticket ne le voyait pas.
`planPairDetach` dissocie au moment de l'archivage. Rendre l'archivage immédiat
rend la dissociation immédiate — et l'`undo` d'origine n'écrivait que
`{ done: false, archived: false }`. Annuler aurait laissé les deux `pair_id` à
`null` : deux cartes toujours visibles, mais le lien rompu. Une rupture
silencieuse qu'aucun test d'affichage n'attrape.

`onCheck` sur une tâche déjà cochée devient une **annulation**, pas un simple
décochage : dans la grille, une tâche cochée n'est visible que le temps de son
délai. Un filet subsiste pour une tâche héritée atteinte autrement.

Le `mateId` se lit dans `planPairDetach` (`writes[1]`) plutôt que par un
`partnerOf` séparé : une seule source pour « qui est la partenaire ».

`npm test` : 94 partagés + 13 web · `typecheck` ✅ · `build` ✅
