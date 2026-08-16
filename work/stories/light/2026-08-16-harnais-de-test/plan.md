---
story: "Harnais de test"
story_code: "harnais-de-test"
issues: [31]
created: 2026-08-16
status: "Done"
---

# #31 — Harnais de test : Vitest sur `packages/shared`

## Contexte

**Le dépôt n'a aucun test.** La seule commande qualité est `npm run typecheck`, et
la CI ne lance rien d'autre. C'était tenable tant que tout se vérifiait à l'écran.
Ce n'est plus le cas : trois stories consécutives viennent d'ajouter de la logique
dont les défaillances sont **silencieuses**.

- **#14** a généralisé `positionBefore()` aux matrices : les positions
  fractionnaires servent maintenant à deux ordres différents.
- **#51** a fait de l'appairage un **lien** avec un invariant — *une paire reste
  ensemble* — porté par `partnerOf()` et `buildRows()`.
- **#12/#13/#15** ont répliqué cette préservation **dans l'extension**. La logique
  existe donc en deux exemplaires, web et popup, et **rien ne vérifie qu'ils
  restent d'accord**.

Aucun de ces défauts ne se verrait au typecheck, et la plupart ne se verraient pas
non plus à l'écran — une paire cassée ou un ordre qui dérive ne provoquent pas
d'erreur, juste un résultat faux.

L'objectif est donc double : poser l'outillage, et couvrir en priorité ce qui ne
peut pas être attrapé autrement.

---

## Tâches

### 1. Outillage

**Vitest**, en devDependency à la racine (hissée par les workspaces npm). Vite 5.4
est installé ; Vitest 3 l'accepte — à confirmer à l'installation, avec repli sur
Vitest 2 si la contrainte de pair coince.

**Configuration partagée** — `vitest.base.ts` à la racine, fusionnée par chaque
workspace via `mergeConfig`. Elle vit à la racine et non dans `packages/shared` :
une base commune ne doit pas appartenir à l'un de ses consommateurs.

Elle fixe `environment: 'node'` — `layout.ts` est de la logique pure, sans DOM, et
imposer `jsdom` ferait payer un environnement de navigateur à des tests qui n'en
ont aucun besoin. Web et extension pourront le surcharger le jour où ils testeront
du DOM.

**Commande** — `test` dans `packages/shared`, et à la racine
`npm test` = `npm run test --workspaces --if-present`, **exactement le motif de
`typecheck`**. Les workspaces sans tests sont ignorés, et la commande les couvrira
d'elle-même dès qu'ils en auront.

**CI** — une étape `Test` dans `.github/workflows/ci.yml`, entre `Typecheck` et
`Build`. Un test rouge doit faire échouer la CI, sinon le harnais ne sert à rien.

### 2. Fabrique de fixtures

`Task` porte treize champs ; les écrire à la main dans chaque test noierait
l'intention sous le bruit. Une fabrique locale aux tests (`makeTask(partial)`)
donne des valeurs par défaut plausibles et ne laisse apparaître **que ce que le
test fait varier**.

### 3. Positions fractionnaires — le risque le plus concret

`positionBefore()` insère à mi-chemin entre deux voisins. Chaque insertion au même
endroit **divise l'écart par deux** : au bout de N insertions il vaut `2⁻ᴺ`, et la
mantisse d'un `double` en compte 52. Passé ce seuil, deux positions deviennent
égales et **l'ordre cesse d'être défini** — sans la moindre erreur.

Le test insère en boucle au même endroit et vérifie que l'ordre reste **strictement
croissant**. Il documente le plafond réel plutôt que de le supposer : c'est une
caractérisation, et la valeur observée devient la garantie du dépôt.

Même traitement pour `insertPosition()` et `endPosition()`, y compris sur liste
vide et sur `beforeId` inconnu.

### 4. Appairage — `buildRows()` et `partnerOf()`

Les trois cas dégradés déjà repérés, aucun couvert aujourd'hui :

| Cas | Attendu |
|---|---|
| Partenaire supprimée | La survivante s'affiche seule, sans planter |
| `pair_id` orphelin (aucune autre tâche) | Ligne d'une seule carte |
| **Trois** tâches sur le même `pair_id` | Deux appairées, la troisième seule |

Le troisième n'est plus atteignable par l'interface — `splitOk` interdit de se
greffer sur une paire — mais d'anciennes données peuvent le porter, et le code est
défensif pour ça. Un test fige ce comportement.

### 5. Matrice d'états

`isVisible`, `visibleTasks`, `pinnedTasks` et `countOpen` croisent `done`,
`archived`, `deleted` et `pinned`. Seize combinaisons dont aucune relecture ne rend
compte de tête, et dont les règles sont subtiles : une tâche `done` mais pas encore
`archived` reste visible (c'est le délai d'annulation de 4 s), alors qu'elle ne
compte plus comme ouverte.

Test piloté par table, une ligne par combinaison — la table *est* la spécification.

### 6. Documentation

- `README.md` : la section Démarrage ne mentionne aucune commande de test.
- Journal `dev.md` après chaque action.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `package.json` (racine) | devDependency Vitest, script `test` |
| `vitest.base.ts` | Nouveau — configuration partagée |
| `packages/shared/package.json`, `packages/shared/vitest.config.ts` | Script `test`, config locale |
| `packages/shared/src/layout.test.ts` | Nouveau — l'essentiel du lot |
| `packages/shared/src/fixtures.ts` | Nouveau — fabrique de `Task` |
| `.github/workflows/ci.yml` | Étape `Test` |
| `README.md` | Commande de test |

Aucune modification du code de production : **si un test échoue, c'est une
découverte, pas une régression**.

---

## Vérifications

```bash
npm test                      # doit passer, et lister les tests exécutés
npm run typecheck && npm run build
```

**Vérifier que le harnais mord vraiment** — un harnais qui ne peut pas échouer ne
protège de rien :

1. Casser volontairement une assertion → `npm test` échoue
2. La rétablir → repasse au vert
3. Vérifier sur la PR que la CI exécute bien l'étape `Test`

**Ce qu'on saura après** : le nombre réel d'insertions consécutives que le schéma
supporte au même endroit avant que l'ordre ne se défasse. Si ce nombre est bas,
c'est un ticket de renumérotation à ouvrir — et c'est exactement le genre de chose
qu'aucune relecture n'aurait établie.

### Livraison

Branche `story-light/harnais-de-test` depuis `main`. PR assignée à `@me`, fermant
**#31**.
