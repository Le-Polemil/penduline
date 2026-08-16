---
story: "Vue globale : toutes matrices ou par univers"
story_code: "vue-globale"
issues: [18]
created: 2026-08-16
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Logique d'agrégation dans `packages/shared` (`orderedBoards`, `groupTasksByBoard`) + tests | Terminé | 2026-08-16 |
| 2. Refacto à comportement identique : extraire `TaskCard`, `BinModal`, `useCompletion` de `Matrix.tsx` | Terminé | 2026-08-16 |
| 3. Maquette Claude Design du cadre par matrice (3 variantes × 5 fonds) et validation | En attente | |
| 4. Écran `Global.tsx`, routage par vue dans `App.tsx`, deux points d'entrée | En attente | |
| 5. Styles du cadre retenu dans `styles.css` | En attente | |
| 6. Vérifications automatiques (`npm test`, `typecheck`, `build`) | En attente | |
| 7. Validation manuelle (12 points du plan) | En attente | |
| 8. Commit, push et PR ciblant `story-light/univers` | En attente | |

## Journal

### 2026-08-16 : Logique d'agrégation dans `packages/shared`

**Statut** : Terminé

**Actions réalisées** :
- `orderedBoards(universes, boards)` : les matrices à plat, dans l'ordre de
  l'accueil. Une ligne au-dessus de `groupByUniverse` — mais nommée et testée,
  parce que deux écrans vont en dépendre.
- `BoardGroup` + `groupTasksByBoard(tasks, boards, quad)` : les tâches d'une case
  regroupées par matrice, épinglées séparées des ordinaires.
- 10 tests ajoutés (42 → 52).

**Fichiers modifiés** :
- `packages/shared/src/layout.ts`
- `packages/shared/src/layout.test.ts`

**Notes** : la portée reste hors de ces fonctions — `boards` arrive déjà filtré
et ordonné. C'est ce qui permet à `groupTasksByBoard` d'ignorer complètement la
notion d'univers.

Deux choses tombent gratuitement, et les tests le verrouillent : `buildRows`
tournant matrice par matrice, une paire reste une ligne sans code dédié ; et une
matrice sans rien à montrer dans la case ne produit aucun groupe, donc aucun
cadre vide — sur 5 cases et 6 matrices, l'alternative faisait 30 cadres.

### 2026-08-16 : Extraction de la carte, de la corbeille et de la complétion

**Statut** : Terminé

**Actions réalisées** :
- `components/TaskCard.tsx` : la carte et son menu `⋯`. Les deux gestes qui
  distinguent les écrans — glisser et appairage par dépôt — sont des props
  **facultatives** (`drag`, `split`) : absentes, le geste n'existe pas.
- `components/BinModal.tsx` : déplacée telle quelle ; `boardName` devient `scope`,
  la corbeille ne recouvrant plus forcément une seule matrice.
- `data/useCompletion.ts` : cocher / annuler / archiver à 4 s, minuteur compris.
- `Matrix.tsx` : 769 → 511 lignes, consomme les trois.

**Fichiers modifiés** :
- `apps/web/src/components/TaskCard.tsx` *(nouveau)*
- `apps/web/src/components/BinModal.tsx` *(nouveau)*
- `apps/web/src/data/useCompletion.ts` *(nouveau)*
- `apps/web/src/screens/Matrix.tsx`

**Notes** : commit séparé, à comportement identique — le diff de la
fonctionnalité reste ainsi lisible, et une régression sur l'écran matrice se
localise sans ambiguïté.

Le portage de `useCompletion` est volontairement littéral, minuteur y compris :
la fermeture du `setTimeout` capture le `tasks` du rendu qui l'a programmé.
C'est le comportement d'origine ; le corriger ici aurait mêlé une correction à
une extraction censée ne rien changer.

`npm test` (52), `typecheck` et `build` passent sur les trois workspaces.
