---
story: "Préservation des paires dans shared"
story_code: "paires-dans-shared"
issues: [60]
created: 2026-08-16
status: "Done"
---

# Journal de développement

## Progression

| # | Tâche | Statut | Date |
|---|-------|--------|------|
| 1 | `TaskWrite`, `planPairMove`, `planPairDetach` dans `layout.ts` | Terminé | 2026-08-16 |
| 2 | Tests des deux fonctions, cas dégradés compris | Terminé | 2026-08-16 |
| 3 | Rebrancher les 8 appelants du web | Terminé | 2026-08-16 |
| 4 | Rebrancher les 3 appelants de l'extension | Terminé | 2026-08-16 |
| 5 | **Commit 1** — extraction, comportement identique | Terminé | 2026-08-16 |
| 6 | **Commit 2** — corriger le décalage fixe de +0,001 | Terminé | 2026-08-16 |
| 7 | Documentation (`README.md`) | Terminé | 2026-08-16 |
| 8 | Vérifications qualité + test manuel | Terminé | 2026-08-16 |

## Journal

<!-- Les entrées sont ajoutées ici après chaque action concrète. -->

### 2026-08-16 — Tâches 1 à 5 : l'extraction

**Statut** : Terminé

**Actions réalisées** :
- `TaskWrite`, `planPairMove`, `planPairDetach` et `planPairPatch` dans `layout.ts`.
- 7 tests supplémentaires (31 au total).
- Huit appelants du web et trois de l'extension rebranchés ; les deux `movePair`
  locaux ont disparu.

**Fichiers modifiés** :
- `packages/shared/src/layout.ts`, `packages/shared/src/layout.test.ts`
- `apps/web/src/screens/Matrix.tsx`, `apps/extension/src/App.tsx`

**Notes** :

*Une quatrième fonction s'est imposée en rebranchant.* L'épinglage applique le
même patch aux deux tâches **sans toucher aux positions** — il ne rentrait donc
pas dans `planPairMove`, qui en exige une. Lui passer une position factice aurait
réordonné la paire à chaque épinglage. D'où `planPairPatch`, et une décomposition
plus juste : `planPairMove` = `planPairPatch` + des positions.

*Une parenté que la dispersion cachait.* `unpair()`, `archive()` et `removeTask()`
faisaient tous les trois la même chose sans en avoir l'air : `pair_id` à `null` des
deux côtés, plus un patch propre à la tâche qui part. `planPairDetach` les couvre
d'un coup — ce n'est pas un effet du refactoring, c'est ce qu'il révèle.

*Les `partnerOf` restants sont volontaires.* Quatre appels subsistent dans les
composants, mais aucun ne duplique une logique d'écriture : ils servent à
composer le texte d'une confirmation, à exclure les deux moitiés d'une liste de
référence, et à décider si « Dissocier » doit apparaître. Connaître la partenaire
pour ses propres besoins n'est pas la même chose que réimplémenter l'invariant.

*Le comportement est strictement identique* — `+0.001` conservé tel quel. La
correction fait l'objet du commit suivant, pour qu'un déplacement de code et un
changement de comportement restent relisibles séparément.

**Vérifications** : 31 tests, typecheck et build au vert ; `grep "function movePair" apps/`
ne renvoie plus rien.

### 2026-08-16 — Tâches 6 à 8 : corriger le décalage fixe

**Statut** : Terminé

**Actions réalisées** :
- La partenaire se place désormais **à mi-chemin de la voisine suivante** dans la
  case d'arrivée, au lieu d'un `+0,001` aveugle.
- 5 tests supplémentaires (36 au total).
- `README.md` : la règle d'appairage vit dans `layout.ts`, et nulle part ailleurs.

**Fichiers modifiés** :
- `packages/shared/src/layout.ts`, `packages/shared/src/layout.test.ts`
- `README.md`

**Notes** :

*Le défaut, en clair.* Un décalage constant paraît suffisant tant que les
positions sont espacées. Mais `positionBefore` divise l'écart par deux à chaque
insertion au même endroit : après une dizaine, l'écart entre voisines passe sous
0,001. Entre deux voisines à `0,5` et `0,5005`, la tâche déplacée arrive à
`0,50025` et sa partenaire à `0,50125` — **au-delà** de la voisine. La paire se
retrouve à cheval sur une autre tâche, visuellement disloquée, sans que
l'utilisateur ait rien fait qui l'explique.

*Un détail qui aurait pu passer inaperçu* : la voisine doit être cherchée dans la
case **d'arrivée**, pas celle de départ. Le patch dit où la paire va ; lire le
voisinage d'origine placerait la partenaire d'après un contexte qu'elle vient de
quitter. Un test dédié le fige.

*Vérification que les nouveaux tests mordent* — un test qui passe avec l'ancien
comportement ne prouve rien. Le décalage fixe a été temporairement rétabli :

| État | Résultat |
|---|---|
| Ancien `+0,001` | ❌ **4 tests échouent**, dont celui du débordement |
| Correction rétablie | ✅ 36 tests passent |

**Vérifications** : 36 tests, typecheck et build au vert.
