---
story: "Statistiques rétrospectives par case"
story_code: "statistiques"
issue: 48
created: 2026-09-01
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Migration : `completion_stats(since)` → `jsonb`, index partiel | Terminé | 2026-09-01 |
| 2. `packages/shared/stats.ts` : types, parsing défensif, quatre lectures, constat en clair | Terminé | 2026-09-01 |
| 3. `packages/shared/stats.test.ts` : une lecture par test + les pièges (moyenne de moyennes, trous, jsonb malformé) | Terminé | 2026-09-02 |
| 4. `data/useStats.ts` : appel de la RPC, échec distingué de zéro | Terminé | 2026-09-02 |
| 5. Charger le skill `dataviz`, puis `screens/Stats.tsx` en SVG à la main | Terminé | 2026-09-02 |
| 6. `App.tsx` + `Home.tsx` : routage `{ kind: 'stats' }` et entrée | Terminé | 2026-09-02 |
| 7. `styles.css` : styles de l'écran, mobile compris | Terminé | 2026-09-02 |
| 8. Qualité : `npm test` + `npm run typecheck` | Terminé | 2026-09-02 |
| 9. Validation migration en transaction annulée (formes, concordance, RLS, fuseau) | Terminé | 2026-09-02 |
| 10. Validation manuelle navigateur (mobile + desktop) | Terminé | 2026-09-02 |

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

### 2026-09-02 : tests, écran, et trois défauts trouvés

**Statut** : Terminé

**Actions réalisées** :
- `stats.test.ts` : **37 tests**.
- `data/useStats.ts` : appel de la RPC, fuseau depuis `Intl`, `failed` distingué de zéro.
- `screens/Stats.tsx` : les quatre lectures, en HTML/CSS.
- `App.tsx` / `Home.tsx` : routage `{ kind: 'stats' }` et entrée sur l'accueil.
- `styles.css` : styles de l'écran, média queries mobile et tactile.
- 183 tests verts, `typecheck` et `build` propres.

**Fichiers modifiés** :
- `packages/shared/src/stats.ts`, `stats.test.ts` (nouveau), `index.ts`
- `apps/web/src/data/useStats.ts`, `screens/Stats.tsx` (nouveaux)
- `apps/web/src/App.tsx`, `screens/Home.tsx`, `styles.css`

---

#### Défaut 1 — « À trier » comptait dans le total sans jamais s'afficher

`statsReadings` calculait `total` sur les cinq cases (`by_quadrant` les contient toutes) mais
n'affichait que `QUADS`, soit quatre. Une tâche cochée directement depuis « À trier » — geste
parfaitement normal — restait donc au dénominateur sans apparaître nulle part : les parts ne
faisaient plus 100 %, et le manque passait pour un arrondi. Corrigé en itérant sur `ALL`.
Indice qui aurait dû me mettre sur la piste plus tôt : `statsSentence` avait déjà une entrée
`parking` dans sa table de lectures.

#### Défaut 2 — la phrase affirmait une dominance inexistante

Trouvé **uniquement grâce aux données réelles**. Le compte local a ses complétions réparties
uniformément : cinq cases à 20 % chacune. La phrase annonçait alors « 20 % de ce que vous avez
terminé venait de Faire » — vraie au chiffre près, fausse au sens, puisqu'elle désigne une
case au hasard parmi cinq égales. Un écran qui prétend voir un motif là où il n'y en a pas
perd sa crédibilité plus vite qu'un écran qui se tait.

Corrigé par un critère de **rapport** (`DOMINANCE_RATIO = 1.5`) et non de part : il reste juste
quel que soit le nombre de cases actives. En dessous, la phrase dit la vérité — « se répartit
assez uniformément entre les cases : aucune ne se détache » — ce qui est un constat, pas un
aveu d'échec. Vérifié sur les données réelles après correctif.

#### Défaut 3 — « ont attendu 0 jours en moyenne »

La plupart des tâches sont créées et cochées le même jour, donc le délai moyen arrondissait à
zéro et la phrase se terminait par une clause qui n'apprenait rien et faisait douter du reste.
Omise sous un jour.

---

#### La palette : le validateur a contredit mon plan

Mon plan (D4) tenait pour acquis que les couleurs de `quadrants.ts` suffiraient, « d'autant
qu'elles sont déjà testées en contraste ». Le validateur du skill `dataviz` dit non, et
durement :

```
[FAIL] Normal-vision floor   Faire #5c6b45 ↔ Planifier #38607f  ΔE 11,4  (plancher 15)
[FAIL] CVD separation        Éliminer #a63d2a ↔ Déléguer #8f6a14  ΔE 4,4 deutan  (plancher 8)
[FAIL] Chroma floor          trois teintes lisent comme du gris
[PASS] Contrast vs surface   les cinq ≥ 3:1
```

Le premier est un échec **dur** : deux cases indiscernables même avec une vision des couleurs
normale, et le skill précise qu'aucun encodage secondaire ne l'excuse.

Ce n'est pas un défaut de `quadrants.ts`. Ces teintes colorent de grands panneaux titrés,
côte à côte, où l'on n'a jamais à comparer deux couleurs pour savoir laquelle est laquelle.
Elles échouent seulement dans le rôle qu'un graphique empilé leur donnerait : distinguer des
segments fins par la couleur SEULE.

**On change donc de forme, pas de couleurs** — c'est l'étape 1 de la procédure. La tendance
est en **petits multiples**, un panneau par case, à échelle commune : l'identité vient du titre
du panneau, la couleur ne fait que rappeler la case. Inventer une seconde palette validée
aurait donné deux langues de couleurs pour les mêmes quatre concepts, ce qui est pire.

L'échelle est **commune** aux panneaux, et c'est délibéré : à échelles propres, une case à
2 tâches et une case à 40 dessineraient la même colline.

#### Vérification de bout en bout du piège de la moyenne des moyennes

Données de test calibrées dans une matrice dédiée : 20 tâches « Faire » à 1 jour + 2 tâches
« Planifier » à 40 jours.

```
juste  → (20×1 + 2×40) / 22 = 100/22 ≈ 4,5 j
faux   → (1 + 40) / 2       = 20,5 j
```

L'écran a affiché **4,5 j**. Toute la chaîne calcule juste : sommes SQL, transport `jsonb`,
parsing défensif, lectures dérivées, rendu. Les tests unitaires le vérifient aussi, et la
mutation « moyenne des moyennes » fait tomber le test dédié, seul et précisément.

#### Comblement des semaines creuses, vérifié

Sur la période de 3 mois, 10 semaines rendues dont `20 juil.`, `27 juil.` et `3 août` à zéro —
les trois semaines sans complétion. Sans comblement, la courbe sauterait du 13 juillet au
10 août et masquerait trois semaines d'inactivité.

#### Exclusions, vérifiées au niveau de la RPC

« Terminée puis supprimée » et « Étape cochée » étaient toutes deux en `faire` dans la matrice
de test *Perso* — qui ne rapporte **aucun** `faire`. Les deux filtres mordent.

#### Reste connu, non corrigé

Le compte local a une semaine à 4005 complétions contre 2 à 4 ailleurs (données de
développement). L'échelle commune aplatit alors tout le reste. C'est la représentation
honnête — des échelles propres mentiraient — mais un vrai compte très irrégulier lira mal ce
graphique. À revoir si le cas se présente vraiment.

**Cibles tactiles** — sous émulation tactile réelle : boutons de période à 44 px, aucun
débordement horizontal, aucune cible sous 44 px dans l'écran.
