---
story: "Revue périodique : ce qui stagne, ce qui n'a jamais bougé"
story_code: "revue-periodique"
issue: 47
created: 2026-09-01
status: "Done"
---

# #47 — Revue périodique : ce qui stagne, ce qui n'a jamais bougé

## Contexte

Penduline stocke, mais ne relance jamais. Rien ne pousse à retrier « À trier », rien ne
signale une tâche qui dort dans *Planifier* depuis trois mois, rien ne dit qu'une matrice
n'a pas bougé depuis l'été. Or la matrice d'Eisenhower est une **pratique** : une matrice
qu'on ne revisite pas devient une liste comme une autre.

Le ticket demande un écran de revue montrant cinq signaux, chacun **actionnable sur place**
(reclasser, supprimer, archiver) — « une revue qui ne permet que de constater ne sert à
rien ».

### Ce que l'exploration a changé au cadrage

Le ticket affirme que tout est faisable « sans rien ajouter ». C'est vrai pour quatre
signaux sur cinq. Le signal « jamais sortie de sa case » ne l'est pas : le trigger
`tasks_updated_at` (`20260724090000_init.sql:46-55`) écrase `updated_at` à **chaque**
update — renommage, position, épinglage, cochage. Une tâche renommée la semaine dernière et
une tâche déplacée la semaine dernière sont indiscernables, alors que la première doit être
signalée et la seconde non.

**Décidé avec l'utilisateur : on enregistre la donnée manquante** (colonne
`quadrant_changed_at`), plutôt que de renommer le signal ou de le retirer.

---

## Décisions

### D1 — `quadrant_changed_at`, dans son propre trigger

Nouvelle colonne sur `tasks`, entretenue par un trigger **distinct** de `set_updated_at()`.
Cette dernière est générique (`new.updated_at = now()`, sans référence à une table) ; y
coudre une règle sur `tasks.quadrant` la spécialiserait. Le dépôt a déjà le précédent d'un
second trigger sur `tasks` (`tasks_depth_guard`, `20260829160000_subtasks.sql:54`).

### D2 — Backfill à `now()`, pas à `created_at`

C'est la correction que j'apporte au risque accepté. Remplir l'existant avec `created_at`
ferait apparaître **toute** tâche déjà déplacée comme « jamais bougé depuis N mois » — un
écran de revue qui liste comme jamais reclassées des tâches que l'utilisateur a déplacées
la semaine dernière perd sa crédibilité entière, et pas seulement sur ce signal.

Backfill à `now()` inverse le sens de l'erreur : pendant les N premiers jours le signal
**sous-rapporte** (il ne montre rien) au lieu de **sur-rapporter** (il montre tout). Une
absence est honnête, un faux positif est trompeur. Une note discrète sous le signal le dit :
« mesuré depuis la mise en place du suivi des déplacements ».

### D3 — Signaux en mémoire vs signaux serveur

`store.tasks` ne contient que les tâches **ouvertes** depuis #40
(`store.ts:32` `inWorkingSet`). D'où un partage net :

| Signal | Source | Pourquoi |
|---|---|---|
| 1 Au parking depuis > N j | mémoire | tâches ouvertes uniquement |
| 2 Jamais reclassée depuis > N j | mémoire | idem |
| 3 Dans « Faire » depuis > N j | mémoire | idem |
| 4 Matrice sans activité | **RPC** | exige le `max(updated_at)` sur **toutes** les tâches, archives comprises |
| 5 « Éliminer » se remplit sans se vider | **RPC** | exige de compter les tâches sorties d'*Éliminer*, donc archivées |

Sans le serveur, une matrice dont tout vient d'être terminé passerait pour dormante —
l'exact inverse de la vérité. Le dépôt a déjà tranché ce cas de la même manière pour la
recherche (`20260829120000_search_tasks.sql` : « Depuis #40, le client ne charge plus que
les tâches ouvertes »).

Une seule RPC `review_boards()` pour les deux signaux : un aller-retour, pas deux.
`security invoker` + `stable`, sur le modèle exact de `search_tasks`.

### D4 — Seuils en `localStorage`

Le ticket veut des seuils réglables. `localStorage`, comme le repli des univers
(`Home.tsx:79`) et celui des étapes (`Matrix.tsx:82`) : la convention du dépôt est
explicite — « un repli est un état de **lecture**, pas une préférence à mettre en base ».
Aucune table de réglages n'existe, et ce ticket n'est pas le bon endroit pour en créer une.

### D5 — Pas de notification

Le ticket laisse le choix ouvert et suggère lui-même le volontariat. Décision : revue
volontaire, avec le repère discret « dernière revue il y a X jours » (`localStorage`). Un
outil qui relance finit désinstallé, et #30 (Web Push) est un ticket à part.

---

## Implémentation

### 1. Migration — `apps/supabase/migrations/20260901120000_review.sql`

- `alter table public.tasks add column quadrant_changed_at timestamptz not null default now()`
  — le défaut couvre le backfill (D2) et les insertions futures.
- `set_quadrant_changed_at()` : `if new.quadrant is distinct from old.quadrant then
  new.quadrant_changed_at = now(); end if;` + trigger `before update on tasks`.
- Index partiel `(user_id, quadrant, quadrant_changed_at) where not done and not deleted` —
  les trois signaux mémoire filtrent tous là-dessus, et l'index sert la RPC.
- `review_boards()` → `setof record (board_id uuid, last_activity timestamptz,
  eliminer_open int, eliminer_cleared int)`, `language sql stable security invoker`,
  `set search_path = public`. Commentaire obligatoire sur le proxy assumé : pour une tâche
  terminée, `updated_at` **est** en pratique la date de sortie.

### 2. `packages/shared`

- `types.ts` — `quadrant_changed_at: string` sur `Task`, documenté (ce qu'il vaut, et le
  fait qu'il ne dit rien de l'avant-migration).
- `review.ts` **(nouveau)** — tout le calcul, pur et testable :
  - `ReviewThresholds` + `DEFAULT_THRESHOLDS` (parking 14 j, jamais reclassée 30 j, Faire
    7 j, matrice dormante 21 j, seuil *Éliminer* 3).
  - `reviewSignals(tasks, boards, boardStats, thresholds, now)` → un tableau de signaux
    `{ key, label, hint, tasks[] | boards[] }`. `now` en paramètre : un calcul de dates non
    injectable n'est pas testable.
  - Réutilise `isOpenRow` / `visibleTasks` de `layout.ts` plutôt que de re-filtrer.
- `review.test.ts` **(nouveau)** — un test par signal, plus les bords : compte vide, tâche
  pile sur le seuil, sous-tâches exclues (une étape n'est pas une ligne de revue).
- `index.ts` — `export * from './review'`.
- `test-fixtures.ts` — `quadrant_changed_at` dans `makeTask`, aligné sur `created_at`.

### 3. `apps/web`

- `data/store.ts` — `quadrant_changed_at` ajouté à `TASK_COLS` (l. 42). Rien d'autre :
  `inWorkingSet` et le temps réel ne changent pas.
- `data/useReview.ts` **(nouveau)** — appelle `review_boards()` à l'ouverture de l'écran
  (une fois par visite, comme `loadBin`), expose `{ stats, loading, error }`.
- `screens/Review.tsx` **(nouveau)** — l'écran. Réutilise `TaskCard` en lui passant le
  strict nécessaire : `drag`, `split`, `reorder`, `subtasks` sont **facultatifs**
  (`TaskCard.tsx:14-44`), donc les gestes qui n'ont pas de sens ici n'existent pas, sans
  drapeau `mode`. Reclasser / supprimer / épingler passent par `store.group` comme dans
  `Global.tsx`, pour que `Ctrl+Z` défasse d'un coup.
  - Chaque signal est une section repliable, avec son compte et son seuil réglable.
  - Un signal à zéro s'affiche **satisfait**, pas masqué : « Rien ne traîne au parking » est
    une information.
  - Ton factuel, jamais de reproche (critère d'acceptation explicite du ticket).
- `App.tsx` — `View` gagne `{ kind: 'review' }`, `readView` le valide, `Workspace` le route.
- `screens/Home.tsx` — bouton d'entrée à côté de `.home-global` (l. 365), avec le repère
  « dernière revue il y a X jours ».
- `styles.css` — styles de l'écran, dans le vocabulaire existant (`--color-*`, `.quad-*`).
  Lisible en mobile (critère du ticket), et compatible avec la passe #89.

---

## Vérification

**Automatique** — `npm test` (147 tests actuels + les nouveaux de `review.test.ts`) et
`npm run typecheck`. Pas de script de lint dans le dépôt.

**Migration** — appliquée en local via le script décrit dans `apps/supabase/README.md`,
puis `verify`. Vérifier les trois points où ça peut casser :
1. la colonne existe et vaut `now()` partout après backfill ;
2. un `update tasks set title = …` **ne** touche pas `quadrant_changed_at` ;
3. un `update tasks set quadrant = …` **le** touche.

**Manuel (navigateur, via MCP Chrome)**
1. Ouvrir la revue depuis l'accueil → les cinq signaux s'affichent, aucun ne plante sur un
   compte peu rempli.
2. Sur un compte neuf : état initial soigné, pas de graphique vide ni de zéro nu.
3. Reclasser une tâche depuis la revue → elle disparaît du signal, `Ctrl+Z` la ramène.
4. Supprimer une tâche à étapes depuis la revue → la confirmation annonce bien les étapes.
5. Baisser un seuil → la liste s'allonge immédiatement ; recharger → le seuil est conservé.
6. Signal 4 : terminer toutes les tâches d'une matrice, recharger → elle n'apparaît **pas**
   comme dormante (c'est le cas que la RPC existe pour couvrir).
7. Vue mobile (390 × 844) et desktop (1440 × 900).

**Ne sera pas vérifiable tout de suite** — le signal 2 ne peut rien montrer de vrai avant
N jours d'usage réel (D2). Son test unitaire couvre la logique ; l'écran affichera la note
qui l'explique.
