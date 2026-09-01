---
slug: "deadlines"
title: "Deadlines : échéance, statut « dans le rouge » et tri"
created: 2026-09-01
status: "Done"
---

# #19 — Deadlines : échéance, statut « dans le rouge » et tri

## Contexte

Une tâche Penduline n'a aujourd'hui aucune notion de temps. On peut la classer
urgent/important, l'épingler, la décomposer en étapes — mais rien ne dit *quand*
elle doit être faite, et rien ne se signale quand ce moment est passé.

Ce ticket livre le premier étage : poser une date sur une tâche, la voir, voir
qu'elle est dépassée, et faire remonter les dépassées. **Aucune automatisation** —
pas de scheduler, pas de notification, pas d'action déclenchée. C'est délibéré :
`due_at` est le prérequis de #22 (actions automatiques) et #32 (alerte), et il se
livre seul, sans infra.

Décisions prises en amont avec le demandeur :

- **Tri** — les dépassées remontent **d'office** en tête de leur case, sans
  interrupteur. Le reste garde son ordre manuel.
- **Granularité** — date **et** heure (`datetime-local`).
- **Extension** — affichage **et** édition (au-delà du minimum de l'issue).

## La difficulté, et sa résolution

`insertPosition(rows, index)` (`packages/shared/src/layout.ts:551`) moyenne les
`position` des lignes voisines. Elle exige donc que l'ordre **affiché** soit
l'ordre des **positions**. Faire remonter les dépassées casse cette prémisse :
`rows[index-1].position` peut dépasser `rows[index].position`, et le point milieu
ne veut plus rien dire. Le glisser-déposer et le réordonnancement clavier (#38)
déposeraient au mauvais endroit.

**La résolution existe déjà dans le code** : les épinglées vivent dans une zone
séparée, et `planReorder` (layout.ts:459-462) le dit explicitement — *« Les
épinglées vivent dans leur propre zone : une tâche épinglée se réordonne parmi les
épinglées, une ordinaire parmi les ordinaires. Mélanger les deux listes ferait
sauter la tâche d'une zone à l'autre sans qu'on l'ait demandé. »*

Les dépassées deviennent une **troisième zone**, bâtie sur ce même précédent :

```
┌─ case « Faire » ────────────────────┐
│ ZONE 1 — épinglées                  │  ordre position, gaps ✗   (inchangée)
│   ⚑ Rappeler le notaire             │
├─────────────────────────────────────┤
│ ZONE 2 — en retard          NOUVEAU │  ordre due_at ↑, gaps ✗
│   Devis            ⏰ en retard      │  pas de ↑/↓ : le rang
│   Relance          ⏰ en retard      │  n'appartient plus à l'utilisateur
├╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌─┤
│ ZONE 3 — ordre manuel               │  ordre position, gaps ✓   (inchangée)
│   ⠿ Relire la PR   ⏰ dans 2 j       │  drag & drop intact
│   ⠿ Appeler le banquier             │
└─────────────────────────────────────┘
```

Conséquences, toutes voulues :

- `insertPosition` et toute l'arithmétique fractionnaire restent **inchangées** :
  la zone 3 est toujours triée par `position`, sa précondition tient.
- `dropInsert` reçoit un index **relatif à la zone 3**, et lui passe les lignes
  de la zone 3 uniquement.
- Une tâche dépassée perd ses flèches ↑/↓ tant qu'elle est dans le rouge. C'est
  un ensemble petit et temporaire, et c'est la contrepartie honnête de « elles
  remontent d'office ».
- **L'épinglage l'emporte** sur l'échéance : la zone 1 n'est pas retriée. Épingler
  est un geste explicite qui veut déjà dire « en haut ».
- Le découpage se fait **sur les lignes, pas sur les cartes** (`splitOverdue`
  s'applique *après* `buildRows`) : sinon une paire dont une seule carte est
  dépassée se retrouverait à cheval sur deux zones et s'afficherait cassée.

## Implémentation

### 1. Migration — `apps/supabase/migrations/20260901120000_task_due_at.sql`

```sql
alter table public.tasks add column due_at timestamptz;

create index tasks_due_idx on public.tasks (user_id, due_at)
  where due_at is not null and not done and not deleted;
```

En-tête commenté en français comme les deux migrations précédentes, expliquant
*pourquoi une colonne et pas une table* (une tâche a au plus une échéance,
contrairement aux liens de #78) et *pourquoi l'index est partiel* (la grande
majorité des lignes resteront `null`).

Rien d'autre n'est requis : la policy `"tasks: owner"` est `for all` donc
indifférente aux colonnes, `public.tasks` est déjà publiée en temps réel avec
`replica identity full`, et le trigger `tasks_updated_at` fait son travail seul.

### 2. `packages/shared` — toute la logique testable

**`types.ts`** — `due_at: string | null` sur `Task` (précédent exact :
`parent_id`, jamais optionnel, toujours `| null`, avec un JSDoc qui dit ce que le
`null` signifie), et `'due_at'` ajouté au `Pick` de `TaskPatch`.

**`layout.ts`** — nouvelle section `// ── Échéances (#19) ──`, toutes les
fonctions pures avec `now: number = Date.now()` en dernier paramètre, sur le
modèle de `isFreshCapture` (layout.ts:651) :

| Fonction | Rôle |
|---|---|
| `deadlineStatus(dueAt, now)` | `null` \| `'neutral'` \| `'soon'` \| `'overdue'` — seuil `SOON_MS = 24 h` |
| `isOverdueRow(row, now)` | une **ligne** est en retard si l'une de ses cartes l'est |
| `splitOverdue(rows, now)` | `{ overdue, rest }` — `overdue` trié par `due_at` croissant, `rest` dans l'ordre reçu |
| `formatDeadline(dueAt, now)` | « en retard », « dans 3 h », « demain », « dans 4 j », « le 14 mars » |
| `toLocalInput(dueAt)` | ISO UTC → `YYYY-MM-DDTHH:mm` local, pour préremplir le champ |
| `fromLocalInput(value)` | saisie locale → ISO UTC, ou `null` si vide/invalide |

`visibleTasks` et `pinnedTasks` ne changent **pas** : elles restent l'autorité de
l'ordre par `position`, dont dépend tout le calcul d'insertion.

`groupTasksByBoard` gagne un troisième champ `overdue: Task[][]` sur `BoardGroup`,
alimenté par `splitOverdue` — la vue globale rend les mêmes trois zones.

`planReorder` gagne un paramètre `now` et deux lignes : `null` d'emblée si la
tâche est dépassée et non épinglée, et `siblings` = zone 3 pour une tâche
ordinaire.

**`test-fixtures.ts`** — `due_at: null` dans `makeTask`.

**`layout.test.ts`** — `describe('échéances (#19)')` avec un `now` gelé, à la
manière de la suite « fraîcheur d'une capture » (ligne 946) : les trois statuts et
leurs frontières exactes, le tri des dépassées, la paire à cheval qui reste
entière, `planReorder` qui refuse une dépassée, l'aller-retour
`fromLocalInput`/`toLocalInput`, et le passage de frontière de fuseau.

### 3. `apps/web`

- **`data/store.ts`** — `due_at` dans `TASK_COLS` (ligne 43) ; branche dans
  `taskLabel` (ligne 74) : `'Échéance fixée'` / `'Échéance retirée'`. Le reste
  passe par `patchTask` sans modification — l'annulation et le temps réel
  fonctionnent gratuitement (`previousValues` est piloté par les clés du patch,
  et `identiques` itère les clés de la ligne entrante).
- **`data/useNow.ts`** — nouveau. `setInterval` de 60 s + écoute de
  `visibilitychange` pour recalculer immédiatement au retour sur l'onglet (un
  portable qui a dormi ne reçoit aucun tick). **Affichage seul, aucune écriture** :
  l'en-tête de `useCompletion.ts` (lignes 29-52) est un avertissement explicite
  contre les minuteurs qui écrivent.
- **`components/Deadline.tsx`** — nouveau, calqué sur `Attachments.tsx` : rend
  `null` quand il n'y a ni échéance ni édition en cours, `adding` remonté à
  l'appelant pour qu'un seul éditeur soit ouvert à la fois.
- **`components/TaskCard.tsx`** — prop facultative `deadline?: {...}` (le patron
  maison : pas de drapeau `mode`, la capacité absente = le geste inexistant) ;
  badge `<time dateTime={…}>` dans la ligne de carte avant `task__more` ; entrée
  de menu « ⏰ Fixer une échéance » juste après « Attacher un lien » ; modificateur
  `task--overdue` / `task--soon` dans le calcul de `cls` (ligne 141).
- **`screens/Matrix.tsx`** — les trois zones au rendu ; `dropInsert` indexé sur la
  zone 3 ; `card()` passe `reorder: { up: null, down: null }` pour une dépassée.
- **`screens/Global.tsx`** — même découpage via `BoardGroup.overdue`.
- **`styles.css`** — `.due`, `.due--overdue`, `.due--soon`, et le séparateur de
  zone. Le rouge est déjà dans la palette : `#a63d2a`, celui de `.att__error` et
  de l'encre « éliminer ».

### 4. `apps/extension`

- **`store.ts`** — `due_at` dans le `TASK_COLS` dupliqué (lignes 8-9, à garder en
  phase avec le web) ; branche de libellé dans son `patchTask` réduit.
- **`App.tsx`** — badge dans `Detail`, entrée d'édition dans son menu `⋯`, et
  `listFor` (lignes 399-403) gagne le rang « en retard » entre `pinned` et
  `position`.
- **`styles.css`** — les mêmes classes `.due*`.

### 5. `README.md`

Une puce `due_at` dans la section « Modèle ».

## Vérification

**Automatique** — c'est exactement ce que fait la CI (`.github/workflows/ci.yml`,
il n'y a pas de linter dans ce dépôt) :

```
npm run typecheck && npm test && npm run build
```

Les nouveaux tests de `layout.test.ts` doivent passer, et les 146 existants aussi.

**Manuelle** — dans l'app web, `npm run dev` :

1. Poser une échéance à 2 jours depuis le menu `⋯` → badge neutre, la tâche ne
   bouge pas de sa place.
2. La modifier à dans 3 h → badge « bientôt », toujours à sa place.
3. La modifier à hier → la carte **remonte** en tête de sa case, sous les
   épinglées, badge rouge, flèches ↑/↓ disparues.
4. La retirer → la carte redescend exactement où elle était (sa `position` n'a
   jamais bougé).
5. Glisser-déposer une carte ordinaire entre deux autres, avec une dépassée
   présente dans la case → elle atterrit **où l'interstice l'annonçait**. C'est le
   test qui valide toute la mécanique de zones.
6. Épingler une tâche dépassée → elle passe en zone 1, pas en zone 2.
7. Appairer deux cartes dont une seule est dépassée → la ligne reste entière,
   dans la zone « en retard ».
8. `Ctrl+Z` après avoir posé une échéance → elle est retirée ; `Ctrl+Y` la remet.
9. Deux onglets ouverts : poser une échéance dans l'un → elle apparaît dans
   l'autre sans rechargement.
10. Poser une échéance à `now + 90 s`, laisser l'onglet ouvert → le badge passe au
    rouge tout seul en moins d'une minute. Puis mettre l'onglet en arrière-plan,
    revenir → recalcul immédiat.
11. Changer le fuseau horaire du système, recharger → l'échéance affichée désigne
    toujours le même instant.
12. Extension : le badge apparaît avec la même couleur, et l'édition depuis son
    menu `⋯` se répercute sur le web.

## Hors périmètre

Aucun scheduler, aucune notification, aucune action déclenchée à l'échéance —
c'est #20, #22 et #32. Aucun tri global inter-matrices : `position` est scopée à
`(board_id, quadrant)` et la vue globale reste groupée par matrice, comme le
documente `groupTasksByBoard`.
