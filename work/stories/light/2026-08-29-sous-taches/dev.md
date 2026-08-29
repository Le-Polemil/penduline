---
slug: "sous-taches"
title: "Sous-tâches, un seul niveau (#50)"
issues: [50]
created: 2026-08-29
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : `parent_id`, cascade, trigger du niveau unique | Terminé | 2026-08-29 |
| 2. `packages/shared` : filtres, `subtasksOf`, `progress`, tests | Terminé | 2026-08-29 |
| 3. `TaskCard` : compteur, repli, liste, ajout rapide | Terminé | 2026-08-29 |
| 4. Les bords : vue globale, recherche, extension, confirmation, README | Terminé | 2026-08-29 |
| 5. Vérifications automatiques | Terminé | 2026-08-29 |
| 6. Validation en navigateur (9 points) | Terminé | 2026-08-29 |
| 7. Commit, push et PR fermant #50 | En attente | |

## Journal

### 2026-08-29 : Migration `20260829160000_subtasks.sql`

**Statut** : Terminé

**Actions réalisées** :
- `parent_id uuid references tasks(id) on delete cascade`, index `tasks_parent_idx`
- Trigger `tasks_depth_guard()` : refuse une étape sous une étape, **dans les deux sens**
  (créer une petite-fille, ou donner un parent à une tâche qui a déjà des enfants)
- Appliquée en local et vérifiée dans les deux sens

**Fichiers modifiés** :
- `apps/supabase/migrations/20260829160000_subtasks.sql`

**Notes** : le niveau unique est tenu par un TRIGGER et pas par un `check` — un
`check` de ligne ne peut pas lire une autre ligne, or savoir si le parent a
lui-même un parent demande une lecture.

⚠️ **À appliquer en production avant le front.**

### 2026-08-29 : `packages/shared`

**Statut** : Terminé

**Actions réalisées** :
- `Task.parent_id` + `TaskPatch` + fixtures
- `isVisible` / `pinnedTasks` / `countOpen` écartent les étapes — le filtre est
  posé LÀ pour que les cinq écrans en héritent sans le savoir
- `subtasksOf`, `progress`, puis `planDelete`, `planRestore`, `deleteLabel`
- 12 tests ajoutés (112 au total dans `shared`)

**Fichiers modifiés** :
- `packages/shared/src/{types,layout,layout.test,test-fixtures}.ts`

**Notes** : `insertPosition` corrigé au passage (deux bornes ignorées).

### 2026-08-29 : `TaskCard` et le composant `Subtasks`

**Statut** : Terminé

**Actions réalisées** :
- `components/Subtasks.tsx` : compteur « 2/5 », chevron, liste repliable, ajout rapide
- `TaskCard` gagne une prop `subtasks` **facultative**, comme `drag` et `split` :
  la vue globale ne la passe pas, donc n'affiche rien — aucun drapeau `mode`
- Repli local par tâche, en `localStorage`
- `store.addTask` accepte un `parentId`

**Fichiers modifiés** :
- `apps/web/src/components/{Subtasks,TaskCard}.tsx`
- `apps/web/src/screens/Matrix.tsx`, `apps/web/src/data/store.ts`, `apps/web/src/styles.css`

**Notes** : quand une tâche n'a **aucune** étape, l'entrée « ＋ étape » n'apparaît
qu'au survol ou au focus clavier. Un bouton visible sous chaque carte doublerait
le nombre de lignes d'une matrice de trente tâches.

### 2026-08-29 : Les bords

**Statut** : Terminé

**Actions réalisées** :
- **Corbeille** : `doneList` / `delList` et le compteur (mémoire **et** compte
  serveur) écartent les étapes — elles n'y figurent pas seules
- **Suppression douce** : `planDelete` emporte les étapes, `planRestore` les relève
- **Recherche** : une étape trouvée mène à **son parent** ; badge « étape » sur la ligne
- **Extension** : `.is('parent_id', null)` sur le chargement du popup
- **README** : le modèle a changé, la doc le dit

**Fichiers modifiés** :
- `apps/web/src/screens/{Matrix,Global}.tsx`, `apps/web/src/components/Search.tsx`
- `apps/web/src/data/{store,useBinCount}.ts`, `apps/web/src/App.tsx`
- `apps/extension/src/store.ts`, `README.md`, `apps/web/src/styles.css`

**Notes — deux pièges trouvés ici, pas au plan** :

1. **`parent_id` n'était dans aucun `TASK_COLS`.** Le client ne le sélectionnait
   donc jamais : `t.parent_id` valait `undefined` partout, et tout le filtrage
   écrit en tâche 2 était **inerte**. Corrigé côté web et côté extension.
2. **Le `on delete cascade` ne sert à rien à la suppression.** Elle est douce
   (`deleted = true`) : aucune ligne n'est effacée, donc la cascade ne se
   déclenche pas. Sans `planDelete`, les étapes d'un parent supprimé restaient
   vivantes en base et invisibles partout. La cascade ne joue qu'au **vidage
   définitif** de la corbeille.

Choix assumé au retour de corbeille : `planRestore` relève **toutes** les étapes
supprimées, y compris celles supprimées une à une avant le parent — rien en base
ne distingue les deux cas. Un parent qui revient sans ses cinq étapes serait
manifestement cassé ; une étape en trop se resupprime d'un clic.

Pas de fenêtre de confirmation à la suppression : le bandeau annonce
« Supprimée avec 3 étapes », la corbeille rattrape, `Ctrl+Z` aussi.

### 2026-08-29 : Vérifications automatiques

**Statut** : Terminé

**Actions réalisées** :
- `npm test` → **138 tests** (112 `shared` + 26 `web`)
- `npm run typecheck` → propre
- `npm run build` → les deux paquets construits

**Fichiers modifiés** : aucun.

### 2026-08-29 : Validation en navigateur

**Statut** : Terminé

Onglet contrôlé sur le Supabase **local** (ports décalés 55321-55324, jeu de
démo, 4425 tâches). Les 9 points du plan :

| # | Point | Résultat |
|---|---|---|
| 1 | Ajouter / cocher / supprimer une étape | ✅ |
| 2 | « 1/3 » affiché, compteur de case **inchangé** | ✅ Éliminer reste à 1 |
| 3 | Cocher **toutes** les étapes ne coche pas le parent | ✅ 3/3, parent ouvert |
| 4 | Repli / dépli, survit au rechargement | ✅ `localStorage` |
| 5 | La suppression du parent **annonce** ses étapes | ✅ « Ses 3 étapes partiront… » |
| 6 | Jamais de ligne de grille, ni en vue globale | ✅ aucun bloc `.sub` en global |
| 7 | La base refuse une étape sous une étape | ✅ **dans les deux sens** |
| 8 | La recherche mène au **parent** | ✅ la carte parent clignote |
| 9 | Le popup de l'extension n'affiche pas les étapes | ✅ 24 lignes contre 27 |

Vérifié en plus : `Ctrl+Z` défait le cochage d'une étape (2/3 → 1/3), et la
restauration depuis la corbeille ramène le parent **et** ses trois étapes, celle
qui était cochée restant cochée.

**Trois défauts trouvés au navigateur, aucun par la relecture** :

1. **Les compteurs mentaient.** « 5 tâches ouvertes » passait à 6 dès qu'on
   ajoutait une étape. Trois endroits recalculaient « ouverte » à la main
   (`Matrix`, `Global` ×2, `Home`) au lieu de passer par `countOpen`. Le filtre
   posé en tâche 2 ne les touchait donc pas. Corrigé par un prédicat unique,
   `isOpenRow`, et les quatre appels y passent désormais.
2. **Le compteur d'avancement retombait au rechargement** : « 1/3 » redevenait
   « 0/2 ». Depuis #40 le chargement initial écarte tout ce qui est `done` — les
   étapes cochées comprises. Une étape cochée reste donc chargée, seule exception
   au filtre de #40, et `inWorkingSet` a été aligné pour que le temps réel ne la
   ré-évacue pas.
3. **La recherche rangeait une étape cochée dans « Corbeille »**, alors que son
   parent était bien vivant sur la grille. Le partage des deux sections suit
   maintenant la DESTINATION du résultat, pas l'état de la ligne trouvée.

**Résidu assumé et documenté dans `store.ts`** : les étapes d'un parent terminé
sont chargées elles aussi, alors qu'elles ne s'affichent nulle part. Les exclure
demanderait de filtrer sur l'état du parent, donc une jointure — deux requêtes et
une dépendance au nom de la contrainte. À reprendre si le volume le justifie ; il
croît en étapes, pas en archives.

**Fichiers modifiés** :
- `packages/shared/src/layout.ts` (`isOpenRow`), `layout.test.ts`
- `apps/web/src/screens/{Matrix,Global,Home}.tsx`
- `apps/web/src/data/store.ts`, `apps/web/src/components/Search.tsx`
