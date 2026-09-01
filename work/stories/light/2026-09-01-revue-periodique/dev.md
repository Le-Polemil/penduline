---
story: "Revue périodique : ce qui stagne, ce qui n'a jamais bougé"
story_code: "revue-periodique"
issue: 47
created: 2026-09-01
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : `quadrant_changed_at`, trigger dédié, index partiel, RPC `review_boards()` | Terminé | 2026-09-01 |
| 2. `packages/shared/types.ts` : `quadrant_changed_at` sur `Task` + fixture `makeTask` | Terminé | 2026-09-01 |
| 3. `packages/shared/review.ts` : seuils, défauts et calcul pur des 5 signaux | Terminé | 2026-09-01 |
| 4. `packages/shared/review.test.ts` : un test par signal + les bords | Terminé | 2026-09-01 |
| 5. `store.ts` : `quadrant_changed_at` dans `TASK_COLS` | En attente | |
| 6. `data/useReview.ts` : appel de la RPC, une fois par visite | En attente | |
| 7. `screens/Review.tsx` : l'écran, réutilisant `TaskCard` et `store.group` | En attente | |
| 8. `App.tsx` + `Home.tsx` : routage `{ kind: 'review' }` et bouton d'entrée | En attente | |
| 9. `styles.css` : styles de l'écran, mobile compris | En attente | |
| 10. Qualité : `npm test` + `npm run typecheck` | En attente | |
| 11. Validation manuelle navigateur (mobile + desktop) | En attente | |

## Journal

### 2026-09-01 : Migration — `quadrant_changed_at` et `review_boards()`

**Statut** : Terminé

**Actions réalisées** :
- Colonne `tasks.quadrant_changed_at timestamptz not null default now()` — le défaut
  vaut backfill (cf. D2 du plan).
- Fonction `set_quadrant_changed_at()` + trigger `before update of quadrant on tasks`,
  séparé de `set_updated_at()` qui reste générique.
- Index partiel `tasks_review_idx (user_id, quadrant, quadrant_changed_at) where not
  done and not deleted`.
- RPC `review_boards()` → `(board_id, last_activity, eliminer_open,
  eliminer_last_cleared)`, `stable security invoker`, sans argument.
- Validée sur le Postgres 15.8 local (conteneur `supabase_db_penduline`, 4428 tâches
  réelles) dans une transaction **annulée** : aucune trace laissée dans la base.

**Fichiers modifiés** :
- `apps/supabase/migrations/20260901120000_review.sql` (nouveau)

**Notes** :

Neuf vérifications fonctionnelles passent, dont les trois qui comptent :
- un renommage ne touche PAS `quadrant_changed_at` (mais bien `updated_at`) ;
- citer `quadrant` dans le `set` sans changer sa valeur ne le touche pas non plus — la
  clause `update of` s'arme sur la mention, d'où le `is distinct from` à l'intérieur ;
- un vrai changement de case le touche.

Plus quatre sur la RPC : elle rend des lignes, `eliminer_open` n'est jamais `null`, sa
valeur est identique à un comptage direct matrice par matrice, et elle couvre toutes les
matrices ayant des tâches.

**Sécurité** — le premier passage tournait en `postgres`, qui contourne la RLS : la
vérification ne prouvait donc rien. Reprise sous le rôle `authenticated` avec un JWT
forgé : un `sub` inconnu obtient **zéro ligne**, le vrai propriétaire obtient l'intégralité
de son périmètre. `security invoker` fait bien son travail, il n'y a pas de second modèle
de sécurité à tenir à jour.

**Surprise** — une étape hérite du quadrant de son parent (`Matrix.tsx:388`,
`store.addTask(board.id, t.quadrant, title, position, t.id)`). Sans `parent_id is null`,
une tâche d'*Éliminer* à trois étapes en aurait compté quatre. Le filtre est dans la RPC,
pas dans le client.

### 2026-09-01 : `packages/shared` — type, fixture, calcul et tests

**Statut** : Terminé

**Actions réalisées** :
- `types.ts` : `quadrant_changed_at: string` sur `Task`, avec la réserve sur
  l'avant-migration.
- `test-fixtures.ts` : `makeTask` aligne `quadrant_changed_at` sur `created_at` — une
  tâche neuve n'a jamais changé de case.
- `review.ts` (nouveau) : `ReviewThresholds`, `DEFAULT_THRESHOLDS`, `BoardStat`,
  `ReviewSignal` (union discriminée `tasks` / `boards`), `reviewSignals()`, `ageInDays()`,
  `signalCount()`.
- `review.test.ts` (nouveau) : 31 tests.
- `index.ts` : `export * from './review'`.

**Fichiers modifiés** :
- `packages/shared/src/types.ts`
- `packages/shared/src/test-fixtures.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/review.ts` (nouveau)
- `packages/shared/src/review.test.ts` (nouveau)

**Notes** :

151 tests verts (120 avant, 31 ajoutés).

**Les tests ne passent pas à vide, c'est vérifié.** La revue est du calcul de seuils sur
des dates : un signal cassé et un signal satisfait s'affichent exactement pareil, « rien ne
traîne au parking » pouvant vouloir dire « le filtre est mort ». J'ai donc muté `review.ts`
pour faire lire `updated_at` là où il doit lire `quadrant_changed_at` — c'est-à-dire pour
réintroduire précisément le bug qui a justifié la migration. Trois tests tombent, dont
« ne se laisse pas désarmer par un simple renommage ». Mutation annulée ensuite.

**Décisions prises en écrivant** :

- **`ageInDays` rend `null`, pas `NaN`.** `NaN >= seuil` vaut `false` : une date illisible
  aurait fait disparaître sa tâche du signal sans le moindre bruit.
- **Les cinq signaux ne forment PAS une partition**, et un test le verrouille. Une tâche
  coincée dans « Faire » depuis 40 jours apparaît dans deux signaux, parce qu'elle dit deux
  choses. Sans ce test, une « déduplication » bien intentionnée casserait le produit au lieu
  de casser un test.
- **Une seule dérogation** : « À trier » est exclu de « jamais reclassées », une tâche du
  parking jamais reclassée étant exactement le signal 1.
- **Signal 1 mesure `created_at`, signal 3 mesure `quadrant_changed_at`.** Au parking la
  question est l'âge de la tâche ; dans « Faire », la date d'arrivée dans la case. Une vieille
  tâche promue urgente hier n'est pas une fausse urgence.
- **Une matrice vide n'est pas dormante.** Sans ligne dans `stats`, elle est exclue :
  reprocher à quelqu'un de ne pas avoir rempli la matrice qu'il vient de créer serait le ton
  que le ticket interdit explicitement.
