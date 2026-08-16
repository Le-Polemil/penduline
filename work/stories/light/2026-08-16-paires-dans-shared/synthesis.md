---
story: "Préservation des paires dans shared"
story_code: "paires-dans-shared"
issues: [60]
pr: 61
created: 2026-08-16
completed: 2026-08-16
status: "Done"
---

# Synthèse

## Résumé

L'invariant « une paire reste ensemble » existait en deux copies identiques au
caractère près, aucune testable. Il vit désormais dans `packages/shared`, en un
seul endroit, couvert par 12 tests.

Deux commits distincts : l'extraction à comportement identique, puis la correction
d'un défaut trouvé en relisant le code au moment de l'extraire.

## Pourquoi c'était urgent

Le défaut que la duplication rend possible **s'était déjà produit**. #51 a corrigé
la casse silencieuse des paires côté web ; il a fallu attendre #12/#13, plusieurs
jours après, pour découvrir que l'extension la reproduisait toujours. Corrigé dans
la copie qu'on regardait, oublié dans l'autre.

## Décisions et leur raison

**Des patchs, pas des effets.** Les fonctions `plan…` rendent une liste de
`{ id, patch }` au lieu d'écrire elles-mêmes. C'est cette inversion qui les sort de
React et de Supabase, donc qui les rend testables. Le préfixe le dit dans le nom,
pour qu'aucun lecteur ne s'attende à un effet de bord.

**La frontière passe entre « quoi écrire » et « comment le montrer ».** `withVT`,
`setMenuTask`, `setPending` restent chez les appelants — ils n'ont rien à faire
dans `shared`.

**Les `partnerOf` restants sont volontaires.** Quatre appels subsistent dans les
composants, mais aucun ne duplique une logique d'écriture : ils composent un texte
de confirmation, excluent les deux moitiés d'une liste de référence, ou décident si
« Dissocier » apparaît. Connaître la partenaire pour ses propres besoins n'est pas
réimplémenter l'invariant.

## Ce que le refactoring a révélé

**Une quatrième fonction s'imposait.** L'épinglage applique le même patch aux deux
tâches **sans toucher aux positions** — il ne rentrait pas dans `planPairMove`, qui
en exige une. Lui passer une position factice aurait réordonné la paire à chaque
épinglage. D'où `planPairPatch`, et une décomposition plus juste :
`planPairMove` = `planPairPatch` + des positions.

**Une parenté que la dispersion cachait.** `unpair()`, `archive()` et
`removeTask()` faisaient tous les trois la même chose sans en avoir l'air :
`pair_id` à `null` des deux côtés, plus un patch propre à la tâche qui part.
`planPairDetach` les couvre d'un coup. Ce regroupement n'est pas un effet du
refactoring, c'est ce qu'il révèle.

**Le décalage fixe était faux.** `position + 0.001` marchait tant que les positions
étaient espacées, mais `positionBefore` divise l'écart par deux à chaque insertion
au même endroit. Après une dizaine, l'écart entre voisines tombe sous ce seuil :
entre `0,5` et `0,5005`, la partenaire atterrissait à `0,50125` — **au-delà** de la
voisine, la paire à cheval sur une autre tâche.

Plafond d'environ **10 insertions**, là où `positionBefore` seul en tient 53. Ce
défaut n'était pas visible tant que la logique vivait dupliquée dans deux
composants React ; il est apparu en la relisant pour l'extraire.

Correction : la partenaire se place à mi-chemin de la voisine suivante, cherchée
dans la case **d'arrivée** — le patch dit où la paire va, et lire le voisinage
d'origine la placerait d'après un contexte qu'elle vient de quitter.

## Fichiers modifiés

- `packages/shared/src/layout.ts` — `TaskWrite`, `planPairMove`, `planPairPatch`,
  `planPairDetach`, `matePosition`
- `packages/shared/src/layout.test.ts` — 24 → 36 tests
- `apps/web/src/screens/Matrix.tsx` — huit appelants rebranchés
- `apps/extension/src/App.tsx` — trois appelants rebranchés
- `README.md`, `.gitignore`

Aucune migration SQL, aucun changement de manifeste.

## Tests et validation

- **Tests automatiques** : ✅ 36 (31 après l'extraction, 36 après la correction)
- **Typecheck / build** : ✅ trois workspaces
- **Contrôle mécanique** : ✅ `grep "function movePair" apps/` ne renvoie rien
- **Les nouveaux tests mordent** : ✅ en rétablissant le décalage fixe, **4
  échouent**. Un test qui passe avec le comportement fautif ne prouverait rien.
- **Validation manuelle** : ⛔ à faire — le comportement est censé être inchangé,
  ce qui se vérifie à l'usage

## Ce que cette story démontre

**Le filet était posé avant.** Les 24 tests de #31 couvraient `partnerOf` et
`buildRows` avant que l'extraction ne commence — premier refactoring du dépôt à
être protégé plutôt qu'entrepris à l'aveugle.

Et ça se voit dans le résultat : la story est allée jusqu'à **corriger un défaut**
au lieu de seulement déplacer du code. Sans les tests, personne n'aurait osé
toucher au placement des positions au milieu d'une extraction.
