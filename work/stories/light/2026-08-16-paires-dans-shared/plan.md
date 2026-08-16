---
story: "Préservation des paires dans shared"
story_code: "paires-dans-shared"
issues: [60]
created: 2026-08-16
status: "In Progress"
---

# #60 — Extraire la préservation des paires dans `packages/shared`

## Contexte

L'invariant de l'appairage — **une paire reste ensemble** — est implémenté **deux
fois, au caractère près** :

- `movePair()` dans `apps/web/src/screens/Matrix.tsx` (#51)
- `movePair()` dans `apps/extension/src/App.tsx` (#12/#13)

Rien ne garantit qu'elles restent d'accord, et **aucune n'est testable** : elles
vivent dans des composants React, hors d'atteinte du harnais posé par #31.

L'histoire du produit dit assez pourquoi c'est urgent. #51 a corrigé la casse
silencieuse des paires côté web ; il a fallu attendre #12/#13 pour découvrir que
**l'extension la reproduisait toujours**. Le même défaut, dans la copie qu'on avait
oubliée. La duplication actuelle a quelques jours : c'est le moment où elle coûte
le moins cher à résorber.

### Un défaut trouvé en relisant

`movePair` place la partenaire à **`position + 0.001`**, un décalage fixe. Or
`positionBefore` produit des écarts qui **se divisent par deux** à chaque insertion
au même endroit : après une dizaine, l'écart entre voisines tombe sous 0,001.

Entre deux voisines à `0,5` et `0,5005`, la tâche déplacée arrive à `0,50025` et sa
partenaire à `0,50125` — **au-delà de la voisine suivante**. La paire se retrouve à
cheval sur une autre tâche.

Le plafond est donc d'environ **10 insertions**, là où `positionBefore` seul en
tient 53 (mesuré par #31). C'est exactement le genre de défaut que l'extraction
rend visible, et il ne survivra pas à la story qui l'a découvert.

---

## Tâches

### 1. Le contrat : des patchs, pas des effets

La contrainte qui rend tout le reste possible : **la fonction partagée ne persiste
rien.** Elle prend les tâches et rend **ce qu'il y a à écrire**, à charge de
l'appelant de le passer à son propre `patchTask`.

```ts
type TaskWrite = { id: string; patch: TaskPatch };
```

C'est ce qui la sort de React et de Supabase, donc ce qui la rend testable. Le
préfixe `plan…` le dit dans le nom :

| Fonction | Rôle |
|---|---|
| `planPairMove(tasks, task, patch, position)` | Déplace la tâche **et** sa partenaire, adjacentes |
| `planPairDetach(tasks, task, patch?)` | Défait le lien des deux côtés, en fusionnant un patch propre à la tâche qui part |

`planPairDetach` couvre **trois** appelants d'un coup, dont la parenté n'était pas
visible tant qu'ils étaient dispersés :

- `unpair()` — les deux côtés à `pair_id: null`
- `archive()` — plus `{ archived: true, pinned: false }` sur la tâche qui part
- `removeTask()` — plus `{ deleted: true, pinned: false }`

Emplacement : `packages/shared/src/layout.ts`, à côté de `partnerOf()` qui y vit
déjà et que ces fonctions utilisent.

### 2. Brancher les appelants

**Web** (`Matrix.tsx`) — `menuMove`, `dropEnd`, `dropInsert`, `togglePin`,
`moveToBoard` passent par `planPairMove` ; `unpair`, `archive`, `removeTask` par
`planPairDetach`. Les fonctions locales disparaissent.

**Extension** (`App.tsx`) — `dropAt`, `menuMove`, `moveToBoard`. Son `movePair`
local disparaît.

Chaque appelant garde ce qui lui est propre : `withVT`, `setMenuTask`, `setPending`
n'ont rien à faire dans `shared`.

### 3. Tests

Dans `packages/shared/src/layout.test.ts`, à la suite des 24 existants :

- Tâche seule → un seul patch
- Paire → deux patchs, positions adjacentes, **même patch appliqué aux deux**
- Partenaire supprimée → un seul patch (elle n'est plus une partenaire)
- `pair_id` orphelin → un seul patch
- `planPairDetach` → les deux à `pair_id: null`, et le patch propre fusionné
  seulement sur la tâche qui part

### 4. Corriger le décalage fixe — **commit séparé**

Le refactoring d'abord, à comportement strictement identique ; **puis** un second
commit qui corrige. Mélanger un déplacement de code et un changement de
comportement est précisément ce qui rend une relecture impossible.

La correction : au lieu d'un `+0.001` aveugle, placer la partenaire **à mi-chemin
de la voisine suivante**. La logique existe déjà — c'est celle de `positionBefore`.
S'il n'y a pas de voisine, `+1` convient : on est en fin de liste.

Test dédié : après une dizaine d'insertions au même interstice, déplacer une paire
et vérifier qu'aucune tâche ne se glisse **entre** les deux moitiés.

### 5. Documentation

- `README.md` : la section décrivant l'appairage doit dire où vit désormais la
  règle.
- Journal `dev.md` après chaque action.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `packages/shared/src/layout.ts` | `TaskWrite`, `planPairMove`, `planPairDetach` |
| `packages/shared/src/layout.test.ts` | Tests des deux, cas dégradés compris |
| `apps/web/src/screens/Matrix.tsx` | Huit appelants rebranchés, `movePair` local supprimé |
| `apps/extension/src/App.tsx` | Trois appelants rebranchés, `movePair` local supprimé |
| `README.md` | Où vit la règle |

Aucune migration SQL, aucun changement de manifeste.

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

**Le filet est déjà là** : les 24 tests de #31 couvrent `partnerOf` et `buildRows`,
donc une extraction qui casserait l'appairage se verrait immédiatement. C'est le
premier refactoring du dépôt à être protégé avant d'être entrepris.

Contrôle mécanique : `grep -rn "movePair" apps/` ne doit plus rien renvoyer.

### Plan de test manuel

Le critère est **comportement inchangé**. Reprendre les gestes de #51 et #12/#13 :

1. Déplacer une tâche appairée entre cases → les deux suivent, côte à côte
2. Réordonner la paire dans sa case → elle reste groupée
3. Épingler / désépingler depuis une carte → les deux
4. « Dissocier » → lien rompu des deux côtés
5. Cocher une des deux → la survivante reste seule, sans `pair_id` résiduel
6. Supprimer une des deux → idem
7. Déplacer vers une autre matrice → confirmation, puis les deux arrivent
8. Mêmes gestes dans le popup de l'extension

**Après le commit de correction** : réordonner une dizaine de fois au même
interstice, puis y déplacer une paire — aucune tâche ne doit se glisser entre ses
deux moitiés.

### Livraison

Branche `story-light/paires-dans-shared` depuis `main`. **Deux commits distincts** :
extraction, puis correction. PR assignée à `@me`, fermant **#60**.
