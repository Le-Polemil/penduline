---
story: "Fin de la Vague 1"
story_code: "fin-vague-1"
issues: [12, 13, 15]
created: 2026-08-16
status: "Done"
---

# Fin de la Vague 1 — #12 renommer, #13 changer de matrice, #15 chargement

## Contexte

Les trois derniers tickets de la Vague 1. Ils touchent le web **et** l'extension,
et arrivent maintenant que #56 est mergée. La **1.1.0 n'étant pas encore soumise**
au Chrome Web Store, ils s'y intègrent : le manifeste ne bouge pas, et **une seule
soumission couvrira les sept tickets de la vague**.

### Ce que chaque ticket répare

**#12** — Une tâche mal saisie ne peut aujourd'hui qu'être supprimée puis recréée,
ce qui lui fait perdre position, épinglage et appairage.

**#13** — Le menu `⋯` ne propose « Déplacer vers » qu'entre les cases d'une **même**
matrice. Une tâche rangée dans la mauvaise matrice doit être recréée à la main.

**#15** — Il n'existe **aucun état de chargement** : `App.tsx` renvoie `null` en
attendant session et store, côté web comme extension. L'écran reste blanc.

### Deux découvertes qui changent le périmètre

**La carte de tâche de l'extension n'a pas de menu.** Elle porte une case à cocher,
le titre et l'épingle — rien d'autre. « Même action dans le popup » suppose donc de
*créer* l'affordance, pas de porter un composant. Décision : un `⋯` qui apparaît au
survol, comme les actions de matrice sur le web. Le popup se pilote à la souris, le
survol y est fiable.

**`packages/shared/icon.svg` est un doublon au bit près de `apps/web/public/icon.svg`,
et n'est référencé nulle part** — ni code, ni HTML, ni documentation (vérifié). #15
modifie ce fichier : ne toucher qu'une des deux copies identiques est exactement
comme ça que la dérive commence. **On supprime la copie morte.**

---

## Tâches

### 1. Nettoyage préalable — supprimer `packages/shared/icon.svg`

Fichier orphelin, identique à celui du web. Le retirer **avant** #15, pour qu'il
n'y ait qu'une source à modifier.

### 2. #12 — Renommer une tâche

`title` est déjà dans `TaskPatch` : aucune migration.

**Web** — entrée « Renommer » dans le menu `⋯` (`Matrix.tsx`), basculant la carte
en édition. Reprendre le motif de renommage déjà en place pour les matrices
(`Home.tsx`, `Matrix.tsx`) : `autoFocus`, Entrée valide, Échap annule, `maxLength`
à **500** (contrainte `tasks_title_check`).

**Extension** — même entrée, dans le nouveau menu de la tâche 4.

### 3. #13 — Déplacer vers une autre matrice

- `board_id` ajouté à `TaskPatch` (`packages/shared/src/types.ts`) — une ligne.
- Sous-menu « Vers une autre matrice » listant les autres matrices.
- Position recalculée sur la cible via `endPosition(visibleTasks(…))` : `position`
  est scopé à `(board, quadrant)`, la conserver produirait un ordre incohérent.

**⚠️ La spec du ticket est caduque sur l'appairage.** Elle prévoyait de remettre
`pair_id` à `null` — ce qui était juste quand l'appairage était décoratif. #51 en a
fait un lien qui survit aux déplacements. **La paire suit donc dans la matrice
cible**, via `movePair()`, et le changement de matrice ne devient pas la seule
exception à l'invariant.

**Annonce avant déplacement** — quand la tâche est appairée, une confirmation
prévient que **les deux** partiront. Seulement dans ce cas : confirmer un
déplacement ordinaire lasserait, alors que là il se passe quelque chose que
l'utilisateur n'a pas demandé explicitement.

Réutiliser `Confirm` (`apps/web/src/components/Confirm.tsx`), qui accepte déjà
`confirmLabel`. Son bouton porte cependant `confirm-danger` en dur : ajouter une
prop `tone` pour qu'un déplacement ne s'affiche pas en rouge.

### 4. Extension — menu `⋯` sur la carte de tâche

Nouvelle affordance, prérequis de #12 et #13 côté popup.

- `⋯` discret, révélé au survol de la carte (motif `.board-row__actions` du web).
- Contenu : Renommer, Déplacer vers une case, Vers une autre matrice.
- La carte fait ~376 px et porte déjà case + titre + épingle : le `⋯` ne doit pas
  rogner le titre au repos, d'où la révélation au survol plutôt qu'un bouton
  permanent.
- `addBoard`/`patchTask` existent déjà dans `ExtStore` ; seul `board_id` s'ajoute
  aux patchs possibles.

### 5. #15 — Le nid pendulaire

`apps/web/public/icon.svg` : 6 tracés. Le premier (`M48 10 C48 4 64 4 64 10 …`) est
l'attache haute ; les cinq suivants forment le nid et ses tuiles.

- Envelopper les tracés 2 à 6 dans un `<g>`, pivoter autour de l'ancrage (~`56, 7`)
  de ±8° en easing de balancier. L'attache suit, et le nid se plie d'un côté puis
  de l'autre sans qu'on ait à déformer un tracé.
- Composant `<Loader />`, branché aux **quatre** points qui renvoient `null`
  aujourd'hui (web `App.tsx` ×2, extension `App.tsx` ×2).
- `prefers-reduced-motion` : logo fixe, pas d'oscillation.

> Le nom du produit vient de la rémiz penduline et de son nid suspendu : le
> balancier n'est pas un ornement, c'est le geste que le nom décrit.

### 6. Documentation

- `work/publication-extension.md` : compléter les notes de la 1.1.0 pour couvrir
  les **sept** tickets, pas quatre. Rappeler qu'aucun changement de manifeste n'est
  intervenu depuis.
- Journal `dev.md` après chaque action.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `packages/shared/icon.svg` | **supprimé** (doublon orphelin) |
| `packages/shared/src/types.ts` | `board_id` dans `TaskPatch` |
| `apps/web/public/icon.svg` | `<g>` et rotation |
| `apps/web/src/App.tsx` | `<Loader />` aux deux points `null` |
| `apps/web/src/screens/Matrix.tsx` | Renommer, sous-menu matrices, confirmation |
| `apps/web/src/components/Confirm.tsx` | prop `tone` |
| `apps/extension/src/App.tsx` | Menu `⋯`, renommer, déplacer, `<Loader />` |
| `apps/web/src/styles.css`, `apps/extension/src/styles.css` | Menu, édition, animation |
| `work/publication-extension.md` | Notes 1.1.0 complétées |

Aucune migration SQL. **Aucun changement de manifeste** : ni version, ni
permission, ni déclaration de données.

---

## Vérifications

### Automatiques

```bash
npm run typecheck && npm run build      # seules commandes qualité du dépôt
```

### Plan de test manuel

**#12**

1. Renommer une tâche sur le web ; Entrée valide, Échap annule
2. Position, épinglage et appairage préservés après renommage
3. Un titre vide est refusé ; 500 caractères est la limite
4. Renommer depuis le popup de l'extension

**#13**

5. Déplacer une tâche **non appairée** vers une autre matrice → arrive en fin de
   case, sans confirmation
6. Déplacer une tâche **appairée** → confirmation annonçant les deux, puis les
   deux arrivent côte à côte dans la cible
7. Annuler la confirmation → rien ne bouge
8. La matrice d'origine ne garde aucun `pair_id` orphelin
9. Même déplacement depuis l'extension

**#15**

10. Web : au chargement, le nid oscille au lieu d'un écran blanc
11. Extension : idem à l'ouverture du popup
12. Sous `prefers-reduced-motion`, le logo est fixe
13. L'oscillation est fluide et bouclée, sans saut à la reprise

**Extension**

14. Le `⋯` apparaît au survol et ne rogne pas le titre au repos
15. Les trois entrées du menu fonctionnent

Les points 1 à 9 sont pilotables depuis le navigateur ; 10 à 15 demandent
l'extension chargée dans Chrome pour la partie popup.

### Livraison

Branche `story-light/fin-vague-1` depuis `main`. PR assignée à `@me`, fermant
**#12, #13 et #15**.
