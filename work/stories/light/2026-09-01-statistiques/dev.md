---
story: "Statistiques rétrospectives par case"
story_code: "statistiques"
issue: 48
created: 2026-09-01
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : `completion_stats(since)` → `jsonb`, index partiel | Terminé | 2026-09-01 |
| 2. `packages/shared/stats.ts` : types, parsing défensif, quatre lectures, constat en clair | Terminé (non testé) | 2026-09-01 |
| 3. `packages/shared/stats.test.ts` : une lecture par test + les pièges (moyenne de moyennes, trous, jsonb malformé) | En attente | |
| 4. `data/useStats.ts` : appel de la RPC, échec distingué de zéro | En attente | |
| 5. Charger le skill `dataviz`, puis `screens/Stats.tsx` en SVG à la main | En attente | |
| 6. `App.tsx` + `Home.tsx` : routage `{ kind: 'stats' }` et entrée | En attente | |
| 7. `styles.css` : styles de l'écran, mobile compris | En attente | |
| 8. Qualité : `npm test` + `npm run typecheck` | En attente | |
| 9. Validation migration en transaction annulée (formes, concordance, RLS, fuseau) | En attente | |
| 10. Validation manuelle navigateur (mobile + desktop) | En attente | |

## Journal

### 2026-09-01 : Migration — `completion_stats(since, tz)`

**Statut** : Terminé

**Actions réalisées** :
- Index partiel `tasks_completed_idx (user_id, updated_at) where done and not deleted and
  parent_id is null`.
- Fonction `completion_stats(since timestamptz, tz text default 'UTC') returns jsonb`,
  `stable security invoker`, rendant `by_quadrant` / `by_week` / `by_board`.
- Validée sur le Postgres local en transaction annulée : **12 vérifications, toutes vertes**.

**Fichiers modifiés** :
- `apps/supabase/migrations/20260901140000_stats.sql` (nouveau)

**Notes** :

**Aucune colonne ajoutée, contrairement à #47** — et c'est la trouvaille du ticket. Je
m'attendais au même manque (`completed_at` absent, date de complétion seulement approchée).
Le correctif de #75 l'avait déjà réglé : depuis lui, cocher n'est qu'UNE écriture portant
`done` et `archived` ensemble, immédiate. Il n'y a plus d'écart de quatre secondes en base,
donc `updated_at` sur une tâche `done` **est** l'instant de complétion, exactement. Là où #47
se heurtait à une donnée indécidable, #48 a une donnée exacte par construction. Le commentaire
de la migration le dit explicitement pour qu'on ne soit pas tenté d'« améliorer » ça plus tard.

**Le fuseau était un vrai bug, mesuré et non supposé.** `date_trunc('week', …)` travaille dans
le fuseau de la session Postgres, qui est UTC :

```
date_trunc('week', '2026-08-31T01:00:00+02')                              → 2026-08-24
date_trunc('week', '2026-08-31T01:00:00+02' at time zone 'Europe/Paris')  → 2026-08-31
```

Une tâche terminée le lundi à 1 h du matin à Paris tombait donc dans la semaine précédente.
D'où `tz` en paramètre, que le client remplit avec
`Intl.DateTimeFormat().resolvedOptions().timeZone`. Le test vérifie les DEUX branches, pas
seulement la bonne — sinon il ne prouverait pas que le paramètre sert à quelque chose.

Un fuseau inconnu de Postgres ferait **lever** `at time zone` et l'écran entier tomberait pour
une chaîne mal formée. La fonction retombe donc sur UTC via `pg_timezone_names` : des semaines
décalées de deux heures valent mieux qu'une page blanche.

**Un objet `jsonb`, pas un `setof`** — `config.toml` porte `max_rows = 1000`, et ce plafond
frappe aussi les fonctions renvoyant des lignes, silencieusement (le piège de #40). Une table
de faits `semaine × matrice × case` sur un an fait 52 × 10 × 5 = 2600 lignes : tronquée sans
erreur, elle aurait produit des statistiques fausses et muettes.

**Le test qui compte** : la somme de `by_week` doit égaler celle de `by_quadrant`. C'est lui
qui attraperait une erreur de fenêtre, un double comptage ou un décalage de fuseau — les trois
défauts qu'un œil ne voit pas sur un graphique.

### 2026-09-01 : `packages/shared/stats.ts` — écrit, PAS ENCORE TESTÉ

**Statut** : Terminé, mais sans tests — **c'est ici qu'il faut reprendre.**

**Actions réalisées** :
- `StatsPeriod` / `PERIODS` / `periodStart()` — trois périodes (30 j, 3 mois, 12 mois).
- `parseCompletionStats(raw)` — lecture défensive du `jsonb`, champ par champ.
- `statsReadings({ stats, boards })` — les quatre lectures.
- `statsSentence(readings)` — le constat en clair, `null` sous 5 tâches terminées.
- `index.ts` : `export * from './stats'`.
- `typecheck` propre.

**Fichiers modifiés** :
- `packages/shared/src/stats.ts` (nouveau)
- `packages/shared/src/index.ts`

**Notes** : la règle qui gouverne le fichier est écrite en tête — on ne moyenne jamais des
moyennes. Chaque agrégat porte sa somme ET son compte, la division n'arrive qu'au dernier
moment sur les totaux. Les semaines creuses sont comblées à zéro par `weekKeys`, sans quoi la
courbe rapprocherait deux points éloignés d'un mois et rendrait une inactivité invisible.

---

## ⏸ REPRISE — état exact au moment de la pause

**Branche** : `story-light/statistiques`, partie de `main`, poussée à jour.
**Tâches 1 et 2 faites** (migration validée 12/12 ; `stats.ts` écrit et typecheck propre).

**Prochaine action : tâche 3 — `packages/shared/src/stats.test.ts`.** Rien n'est encore
testé côté TypeScript. Les pièges à couvrir, par ordre d'importance :

1. **Moyenne de moyennes** — deux matrices aux volumes très inégaux (ex. 100 tâches à 1 j et
   2 tâches à 30 j). Vérifier que `avgDays` global vaut bien `somme/compte` (~1,6 j) et NON
   la moyenne des deux moyennes (15,5 j). C'est le test qui protège tout le fichier.
2. **Semaine creuse** — `by_week` avec un trou d'un mois → la série doit contenir les
   semaines intermédiaires à zéro.
3. **`jsonb` malformé** — clé absente, `null`, type inattendu, `quadrant` inconnu → sections
   vides, aucune exception.
4. **`statsSentence`** — `null` sous 5 tâches ; ton descriptif ; mention du rythme normal
   quand la case dominante est « Planifier ».
5. **Matrice supprimée ailleurs** — présente dans `by_board`, absente de `boards` → taire la
   ligne plutôt qu'afficher un UUID.
6. **Cases à zéro** — les cinq cases doivent apparaître dans `byQuadrant`, même vides.

**Puis, dans l'ordre** : tâche 4 (`useStats.ts`), tâche 5 (**charger le skill `dataviz`
AVANT** d'écrire `Stats.tsx`), 6 (`App.tsx` + `Home.tsx`), 7 (`styles.css`), 8 (qualité),
10 (validation navigateur).

**À ne pas oublier à la reprise** :
- La migration de #48 **n'est pas appliquée** à la base locale (validée en transaction
  annulée uniquement). Il faudra l'appliquer avant la validation navigateur.
- Le `.env` local doit pointer sur le port **55321** (voir la synthèse de #47) — `.env.example`
  donne 54321, qui est l'autre projet Supabase de cette machine.
- Compte de démo : `demo@penduline.test` / `password123`.
- Conflit de fusion attendu avec #47 (PR #100) dans `Home.tsx` et `styles.css` : les deux
  ajoutent une entrée à côté de `.home-global`.
