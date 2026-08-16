---
story: "Harnais de test"
story_code: "harnais-de-test"
issues: [31]
created: 2026-08-16
status: "Done"
---

# Journal de développement

## Progression

| # | Tâche | Statut | Date |
|---|-------|--------|------|
| 1 | Installer Vitest + `vitest.base.ts` partagé | Terminé | 2026-08-16 |
| 2 | Script `test` (workspace + racine) et étape CI | Terminé | 2026-08-16 |
| 3 | Fabrique de fixtures `makeTask()` | Terminé | 2026-08-16 |
| 4 | Tests des positions fractionnaires | Terminé | 2026-08-16 |
| 5 | Tests de l'appairage (`buildRows`, `partnerOf`) | Terminé | 2026-08-16 |
| 6 | Tests de la matrice d'états | Terminé | 2026-08-16 |
| 7 | Vérifier que le harnais mord (échec provoqué) | Terminé | 2026-08-16 |
| 8 | Documentation (`README.md`) | Terminé | 2026-08-16 |

## Journal

<!-- Les entrées sont ajoutées ici après chaque action concrète. -->

### 2026-08-16 — Harnais complet (#31)

**Statut** : Terminé

**Actions réalisées** :
- Vitest 4.1.10 en devDependency racine ; `vitest.base.mts` partagé.
- `test` dans `packages/shared`, `npm test` à la racine sur le motif de `typecheck`.
- Étape `Test` en CI, entre `Typecheck` et `Build`.
- Fabrique `makeTask()` / `makeList()`.
- **24 tests** : positions fractionnaires, appairage, matrice d'états.
- `README.md` : section Qualité.

**Fichiers modifiés** :
- `package.json`, `vitest.base.mts` (nouveau), `.github/workflows/ci.yml`
- `packages/shared/package.json`, `packages/shared/vitest.config.ts` (nouveau)
- `packages/shared/src/layout.test.ts`, `packages/shared/src/test-fixtures.ts` (nouveaux)
- `README.md`

**Notes** :

*🔍 La réponse à la question que la story posait : **53 insertions**.* Chaque
insertion au même interstice divise l'écart par deux ; un `double` a 52 bits de
mantisse. À la 54ᵉ, la moyenne de deux voisins **égale** l'une d'elles, deux
positions deviennent identiques et l'ordre cesse d'être défini — sans erreur, sans
exception. Confortable en pratique (il faudrait réordonner 53 fois d'affilée au
même endroit sans rien faire d'autre), donc **pas de ticket de renumérotation** ;
mais le plafond est désormais écrit, et l'assertion garde une marge à 50 plutôt
que de figer une valeur qui dépend de l'algorithme.

*Deux avertissements du chargeur de configuration, corrigés plutôt que tolérés.*
Vite se plaignait d'un import sans extension et d'ESM dans un fichier lu comme
CommonJS — le `package.json` racine n'ayant pas `"type": "module"`. Renommer la
base en `.mts` règle les deux **sans** poser `"type": "module"` à la racine, ce
qui aurait changé l'interprétation de tout `.js` du dépôt non couvert par un
`package.json` plus proche. Un harnais qui crache un avertissement à chaque
exécution finit par être ignoré.

*`passWithNoTests: false`* : un workspace qui déclare un script `test` sans avoir
de test est une erreur de configuration, pas un succès. Sans ça, le harnais
pourrait devenir silencieusement vide.

*La fabrique ne dérive pas `position` de son compteur d'appel.* La tentation était
grande — ça rend les listes ordonnées « gratuitement » — mais un test qui dépend
de l'ordre doit le dire, pas l'hériter de son rang d'appel dans le fichier.

*Un comportement figé qui mérite d'être signalé* : `archived` sans `done` laisse la
tâche **visible**, parce que `isVisible` ne les exclut que conjointement. Cet état
ne devrait pas exister en pratique, mais le test le documente tel quel plutôt que
de prétendre qu'il est impossible.

**Vérification que le harnais mord** — un harnais incapable d'échouer ne protège
de rien :

| Étape | Résultat |
|---|---|
| Assertion cassée volontairement | ✅ `npm test` sort en code 1, 1 échec / 23 succès |
| Assertion rétablie | ✅ code 0, 24 succès |

**Reste à vérifier** : que la CI exécute bien la nouvelle étape `Test` sur la PR.
