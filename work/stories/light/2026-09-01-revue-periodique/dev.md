---
story: "Revue périodique : ce qui stagne, ce qui n'a jamais bougé"
story_code: "revue-periodique"
issue: 47
created: 2026-09-01
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : `quadrant_changed_at`, trigger dédié, index partiel, RPC `review_boards()` | Terminé | 2026-09-01 |
| 2. `packages/shared/types.ts` : `quadrant_changed_at` sur `Task` + fixture `makeTask` | Terminé | 2026-09-01 |
| 3. `packages/shared/review.ts` : seuils, défauts et calcul pur des 5 signaux | Terminé | 2026-09-01 |
| 4. `packages/shared/review.test.ts` : un test par signal + les bords | Terminé | 2026-09-01 |
| 5. `store.ts` : `quadrant_changed_at` dans `TASK_COLS` | Terminé | 2026-09-01 |
| 6. `data/useReview.ts` : appel de la RPC, une fois par visite | Terminé | 2026-09-01 |
| 7. `screens/Review.tsx` : l'écran, réutilisant `TaskCard` et `store.group` | Terminé | 2026-09-01 |
| 8. `App.tsx` + `Home.tsx` : routage `{ kind: 'review' }` et bouton d'entrée | Terminé | 2026-09-01 |
| 9. `styles.css` : styles de l'écran, mobile compris | Terminé | 2026-09-01 |
| 10. Qualité : `npm test` + `npm run typecheck` | Terminé | 2026-09-01 |
| 11. Validation manuelle navigateur (mobile + desktop) | Terminé | 2026-09-01 |

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

### 2026-09-01 : l'écran, le routage et les styles

**Statut** : Terminé

**Actions réalisées** :
- `store.ts` : `quadrant_changed_at` ajouté à `TASK_COLS`.
- `data/reviewPrefs.ts` (nouveau) : seuils et date de dernière consultation en `localStorage`,
  avec fusion champ par champ sur les défauts.
- `data/useReview.ts` (nouveau) : appel de `review_boards()`, `refresh()` explicite.
- `screens/Review.tsx` (nouveau) : les cinq sections, réutilisant `TaskCard` et `store.group`.
- `App.tsx` : `View` gagne `{ kind: 'review' }`, validé par `readView` et routé.
- `Home.tsx` : `.home-lenses` avec les deux entrées, et le repère « dernière consultation ».
- `styles.css` : styles de l'écran, média queries mobile et tactile.

**Fichiers modifiés** :
- `apps/web/src/data/store.ts`, `apps/web/src/App.tsx`, `apps/web/src/screens/Home.tsx`,
  `apps/web/src/styles.css`, `apps/web/src/components/TaskCard.tsx`
- `apps/web/src/data/reviewPrefs.ts`, `apps/web/src/data/useReview.ts`,
  `apps/web/src/screens/Review.tsx` (nouveaux)

### 2026-09-01 : Validation navigateur — trois défauts trouvés et corrigés

**Statut** : Terminé

**Méthode** : app lancée contre le Supabase local, compte `demo@penduline.test`, avec trois
matrices de test additives (`⚗ …`) portant des données datées pour armer chaque signal.
Supprimées après validation — 4428 tâches avant, 4428 après, aucune donnée réelle touchée.

**Ce que la validation a prouvé** — chaque cas construit exprès :

| Cas | Attendu | Observé |
|---|---|---|
| « Refaire le CV (renommée hier) » | présente | ✅ dans « Jamais reclassées » |
| « Réserver le train (déplacée hier) » | absente | ✅ absente |
| « Payer la taxe (promue hier) », créée il y a 200 j | absente de « Faire » | ✅ absente |
| « Rappeler le garagiste » | dans DEUX signaux | ✅ signaux 2 et 3 |
| Matrice dont tout est terminé | pas dormante | ✅ (c'est l'objet de la RPC) |
| Seuil 14 j → 1 j | la liste s'allonge | ✅ 5 → 6, persisté |

**Trois défauts trouvés, tous corrigés :**

**1. `flex-basis` devenu une hauteur.** `.home-lenses .home-global { flex: 1 1 240px }`
passait en `flex-direction: column` sous 720 px — or la base porte sur l'axe PRINCIPAL.
Chaque bouton mesurait donc **240 px de haut** et l'accueil était illisible en mobile.
Corrigé par `flex: 0 0 auto` dans la média query.

**2. Une poignée de glisser sans glisser.** `TaskCard` rendait `.task__grip` (`⠿`)
inconditionnellement, alors que la carte portait `draggable="false"`. La revue est le
premier écran à ne pas passer `drag`, donc elle a révélé le défaut. La poignée est
désormais conditionnée à `drag`, ce qui suit la logique déjà écrite dans le composant
(« absentes, les gestes correspondants n'existent tout simplement pas »). Aucun effet sur
l'écran matrice ni sur la vue globale, qui passent tous deux `drag`.

**3. `Ctrl+Z` rendait la case sans rendre l'ancienneté.** Le plus intéressant des trois, et
une régression que la story introduisait. Une annulation EST un changement de case : le
trigger réécrivait donc `now()`, et une tâche rendue à sa case ressortait de la revue pour
trente jours. Une fausse manœuvre suivie de son annulation faisait perdre un signal —
l'inverse exact de ce que `Ctrl+Z` promet (#46).

Corrigé en trois endroits : le trigger ne pose l'horodatage que si l'appelant ne l'a pas
fourni (`new.quadrant_changed_at is not distinct from old.quadrant_changed_at`) ;
`quadrant_changed_at` entre dans `TaskPatch`, uniquement pour l'inverse ; et
`previousValues` le capture dès que le patch touche `quadrant`.

Vérifié des deux côtés — en SQL (aller pose `now()`, retour explicite l'emporte, et les
deux non-régressions : déplacement ordinaire, renommage) et dans le navigateur : 19
éléments → 17 après déplacement → **19** après `Ctrl+Z`, avec `quadrant_changed_at`
revenu à sa valeur exacte de 45 jours.

**Cibles tactiles** — sous émulation tactile réelle (`390x844x3,mobile,touch`, sans quoi
`hover: none` ne s'applique pas et la mesure ne veut rien dire) : 48 / 44 / 44 px, aucun
débordement horizontal. La case à cocher et le `⋯` des cartes restent à 18 px : partagés
avec l'écran matrice, défaut préexistant, périmètre de #89.

**Piège d'environnement, à retenir** — deux stacks Supabase tournent en local. `penduline`
est mappé sur le port **55321**, `unaya` occupe 54321. `npm run status` annonce 54321,
c'est-à-dire la valeur de `config.toml`, PAS le port réellement mappé. Le `.env.example`
donne donc un port qui pointe vers l'autre projet. Une heure de « Invalid login
credentials » alors que le hash correspondait en base.

**Reste connu, non corrigé** : une tâche présente dans deux signaux ouvre ses deux menus
`⋯` en même temps (`menuTask` est indexé par identifiant de tâche). Conséquence directe de
la non-partition assumée, sans incidence fonctionnelle.

### 2026-09-01 : Qualité

- `npm test` : **177 tests verts** (146 sur `main` + 31 pour `review.test.ts`).
- `npm run typecheck` : propre sur les trois workspaces.
- `npm run build` : propre (shared + web + extension).
- Pas de script de lint dans le dépôt.
