---
story: "Vue globale : toutes matrices ou par univers"
story_code: "vue-globale"
issues: [18]
created: 2026-08-16
status: "In Progress"
---

# #18 — Vue globale : toutes matrices ou par univers

## Contexte

Le produit encourage à créer une matrice par contexte. Le corollaire, c'est qu'on
ne voit jamais tout : savoir ce qui est urgent **partout** oblige à ouvrir les
matrices une par une et à recomposer de tête. #17 vient de donner les univers ;
il manque l'écran qui les lit.

La vue globale agrège les tâches de plusieurs matrices dans une seule grille
d'Eisenhower — toutes les matrices, ou celles d'un univers.

### La contrainte qui structure tout

`tasks.position` est scopé à `(board_id, quadrant)`. Deux tâches de matrices
différentes peuvent porter la même position : **une vue agrégée n'a aucun ordre
global cohérent**.

D'où la décision déjà prise au ticket : dans chaque case, les tâches sont
**regroupées par matrice**. L'ordre manuel de chaque matrice est préservé tel
quel, et le réordonnancement est **explicitement retiré** de cette vue — pas
silencieusement cassé.

### Branche

⚠️ Sous-branche empilée : `story-light/vue-globale` part de **`story-light/univers`**
(PR #62, non mergée), pas de `main`. La PR cible `story-light/univers`.

`Closes #18` figurera dans le corps de la PR, mais GitHub ne ferme
automatiquement que sur la branche par défaut : l'issue devra être fermée à la
main, ou le sera quand la pile atteindra `main`.

---

## Décisions de cette session

| Question | Réponse retenue |
|---|---|
| Glisser dans la vue globale | **Vers une autre case, oui.** Une carte déposée sur une case change de quadrant et se pose en fin de cette case, **dans sa propre matrice**. Les interstices de réordonnancement et l'appairage par dépôt disparaissent : seul survit le geste qui ne dépend d'aucun ordre global. |
| Ajout de tâche | **Désactivé en v1.** La vue globale lit, elle ne capture pas — toute création imposerait de désigner une matrice, soit exactement la friction que l'écran cherche à supprimer. |

---

## Tâches

### 1. Logique d'agrégation dans `packages/shared`

Deux fonctions pures dans `layout.ts`, à côté de `groupByUniverse` :

```ts
/** Les matrices dans l'ordre de l'accueil : univers par univers, non rangées en dernier. */
export function orderedBoards(universes: Universe[], boards: Board[]): Board[]

export interface BoardGroup {
  board: Board;
  pinned: Task[][];   // lignes épinglées de cette matrice, dans cette case
  rows: Task[][];     // lignes ordinaires
}

/** Les tâches d'une case, regroupées par matrice. */
export function groupTasksByBoard(tasks: Task[], boards: Board[], quad: QuadrantKey): BoardGroup[]
```

`boards` arrive déjà filtré et ordonné par l'appelant : la portée est une
décision d'écran, pas de la fonction.

**Une matrice sans rien à montrer dans la case ne produit pas de groupe** — un
cadre vide serait du bruit pur.

Réemploi intégral de l'existant : `visibleTasks`, `pinnedTasks`, `buildRows`.
C'est ce dernier point qui fait tenir l'invariant d'appairage **sans une ligne de
code** : `buildRows` tournant par matrice, une paire — toujours intra-matrice,
puisque `planPairMove` emmène la partenaire — reste une ligne.

**Tests** (`layout.test.ts`, 42 → ~50) :
- ordre des matrices = ordre de l'accueil (univers, puis position, puis non rangées)
- une matrice sans tâche visible dans la case ne produit aucun groupe
- épinglées et ordinaires séparées, dans le bon groupe
- une paire d'une même matrice = une ligne dans son cadre
- un `pair_id` à cheval sur deux matrices (donnée incohérente, inatteignable par
  l'interface) dégrade en deux cartes simples dans deux cadres — pas de perte, pas de crash
- une matrice hors portée est absente
- une matrice dont l'univers n'existe plus retombe en fin de liste (hérité de `groupByUniverse`)

### 2. Refacto préalable, à comportement identique

`Matrix.tsx` fait 769 lignes et contient trois blocs que la vue globale doit
réutiliser. Les recopier créerait exactement la situation que #60 a payée : deux
copies d'une même règle, corrigée d'un côté, oubliée de l'autre.

| Extrait vers | Contenu |
|---|---|
| `apps/web/src/components/TaskCard.tsx` | La carte et son menu `⋯` |
| `apps/web/src/components/BinModal.tsx` | La corbeille, déplacée telle quelle (`boardName` → `title`) |
| `apps/web/src/data/useCompletion.ts` | Cocher / annuler / archiver à 4 s, et l'état du toast |

`TaskCard` reçoit ses affordances de glisser en **props optionnelles** : absentes,
la carte n'est ni déplaçable ni cible d'appairage. C'est ce qui laisse la vue
globale retirer deux gestes sans drapeau `mode` ni conditionnelle interne.

**Commit séparé**, sans changement de comportement, pour que le diff de la
fonctionnalité reste lisible.

### 3. Maquette du cadre — passe Claude Design

Le point délicat est le dosage : rendre l'appartenance lisible d'un coup d'œil
**sans concurrencer la couleur de la case**, qui reste le signal dominant.

Trois variantes, chacune sur les **5 fonds** (`packages/shared/src/quadrants.ts`)
et dans **deux densités** — une seule matrice représentée, puis quatre :

- **A — Filet à gauche** : trait vertical en `--q-ink` très dilué + nom en petites
  capitales espacées. Le plus discret ; tient à six matrices sans faire de bruit.
- **B — Cadre complet** : bordure 1 px, rayon 12, nom en pastille chevauchant le
  bord. Le plus explicite, mais risque l'effet sapin quand les matrices s'empilent.
- **C — Étiquette seule** : pas de trait, nom + léger retrait. Les cartes portent tout.

Les trois dérivent la teinte de `--q-ink`, que `.quad` pose déjà : elles tiennent
donc sur les cinq fonds, transparent d'« À trier » compris, sans valeur en dur.

Le nom de matrice est une **étiquette** : casse, taille et opacité doivent le
tenir sous `.quad-label`, jamais à côté.

Validation par toi avant intégration.

### 4. Écran, routage et points d'entrée

**`apps/web/src/screens/Global.tsx`** — même grille que l'écran matrice, mais :

- en-tête calqué sur `.matrix-head` : sélecteur de portée réutilisant
  `.board-switch` / `.board-menu`, total ouvert, corbeille
- **sans aucun univers**, le sélecteur est une étiquette inerte « Toutes les
  matrices » — même règle que l'accueil, qui n'affiche pas d'en-tête de groupe
  dans ce cas
- pas de `.row-gap`, pas de cible d'appairage, pas de `.add-row`
- dépôt sur une case → `planPairMove(tasks, task, { quadrant }, endPosition(visibleTasks(tasks, task.board_id, quad)))`
  — la position se calcule dans **la matrice de la tâche**, jamais globalement
- corbeille sur la portée : « Corbeille (toutes les matrices) » ou le nom de l'univers

**`App.tsx`** — `boardId: string | null` devient une vue explicite :

```ts
type View = { kind: 'home' } | { kind: 'board'; id: string } | { kind: 'global'; scope: Scope }
type Scope = { kind: 'all' } | { kind: 'universe'; id: string }
```

Le « ‹ Retour » de la barre du haut s'affiche dès que la vue n'est pas l'accueil.

**Garde-fou** : une portée dont l'univers a disparu (supprimé depuis un autre
onglet) retombe sur « toutes les matrices » au lieu d'afficher un écran vide.

**Deux entrées**, aucune nouvelle convention :
- accueil, au-dessus de la liste, masquée tant qu'aucune matrice n'existe
- menu de bascule de l'écran matrice, au-dessus des matrices, séparé par `.board-menu__sep`

### 5. Styles

La variante retenue en 3, dans `apps/web/src/styles.css`, à la suite du bloc
`.quad`.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `packages/shared/src/layout.ts` + `.test.ts` | `orderedBoards`, `groupTasksByBoard`, tests |
| `apps/web/src/components/TaskCard.tsx` | Nouveau — extrait de `Matrix.tsx` |
| `apps/web/src/components/BinModal.tsx` | Nouveau — déplacé de `Matrix.tsx` |
| `apps/web/src/data/useCompletion.ts` | Nouveau — extrait de `Matrix.tsx` |
| `apps/web/src/screens/Global.tsx` | Nouveau — l'écran |
| `apps/web/src/screens/Matrix.tsx` | Consomme les trois extraits |
| `apps/web/src/screens/Home.tsx` | Entrée « Vue globale » |
| `apps/web/src/App.tsx` | Routage par vue |
| `apps/web/src/styles.css` | Cadre de matrice |

Aucune migration : la vue est en lecture sur des données existantes.

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

Pas de linter dans ce dépôt — le typecheck et le build tiennent ce rôle. Et le
typecheck ne protège de rien sur les données Supabase (le client rend `any`) :
c'est le plan manuel qui fait foi.

### Plan de test manuel

Base locale, compte de démo (`apps/supabase/seed.sql`).

1. **Sans aucun univers** : le sélecteur est une étiquette, sans menu
2. Portée « toutes » : chaque case regroupe par matrice, dans l'ordre de l'accueil
3. Portée sur un univers : seules ses matrices apparaissent
4. Une matrice sans tâche dans une case n'y laisse **aucun cadre**
5. Cocher → toast d'annulation, puis archivage à 4 s ; annuler rétablit
6. Glisser une carte vers une autre case → elle change de case et **reste dans sa matrice**
7. Pendant le glisser : **aucun interstice pointillé**, et déposer sur une carte n'appaire pas
8. Menu `⋯` : renommer, déplacer vers une case, vers une autre matrice, épingler, dissocier, supprimer
9. Une paire s'affiche sur **une ligne**, dans le cadre de sa matrice
10. Corbeille : listes de la portée, restauration, purge
11. Supprimer l'univers ouvert en portée → retombe sur « toutes les matrices »
12. Retour à l'accueil, puis ouverture d'une matrice : l'écran matrice est **inchangé**

Le point 12 est le vrai filet de la refacto de l'étape 2 : elle ne doit rien
changer à l'écran existant.

### Livraison

Branche `story-light/vue-globale` depuis `story-light/univers`. PR **ciblant
`story-light/univers`**, assignée à `@me`, avec `Closes #18`.
