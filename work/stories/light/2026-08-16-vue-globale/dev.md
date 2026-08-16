---
story: "Vue globale : toutes matrices ou par univers"
story_code: "vue-globale"
issues: [18]
created: 2026-08-16
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Logique d'agrégation dans `packages/shared` (`orderedBoards`, `groupTasksByBoard`) + tests | Terminé | 2026-08-16 |
| 2. Refacto à comportement identique : extraire `TaskCard`, `BinModal`, `useCompletion` de `Matrix.tsx` | Terminé | 2026-08-16 |
| 3. Maquette du cadre par matrice (3 variantes × 5 fonds) et validation | Terminé | 2026-08-16 |
| 4. Écran `Global.tsx`, routage par vue dans `App.tsx`, deux points d'entrée | Terminé | 2026-08-16 |
| 5. Styles des trois cadres dans `styles.css` | Terminé | 2026-08-16 |
| 6. Vérifications automatiques (`npm test`, `typecheck`, `build`) | Terminé | 2026-08-16 |
| 7. Validation manuelle (12 points du plan) | En attente | |
| 8. Commit, push et PR ciblant `story-light/univers` | Terminé | 2026-08-16 |

## Journal

### 2026-08-16 : Logique d'agrégation dans `packages/shared`

**Statut** : Terminé

**Actions réalisées** :
- `orderedBoards(universes, boards)` : les matrices à plat, dans l'ordre de
  l'accueil. Une ligne au-dessus de `groupByUniverse` — mais nommée et testée,
  parce que deux écrans vont en dépendre.
- `BoardGroup` + `groupTasksByBoard(tasks, boards, quad)` : les tâches d'une case
  regroupées par matrice, épinglées séparées des ordinaires.
- 10 tests ajoutés (42 → 52).

**Fichiers modifiés** :
- `packages/shared/src/layout.ts`
- `packages/shared/src/layout.test.ts`

**Notes** : la portée reste hors de ces fonctions — `boards` arrive déjà filtré
et ordonné. C'est ce qui permet à `groupTasksByBoard` d'ignorer complètement la
notion d'univers.

Deux choses tombent gratuitement, et les tests le verrouillent : `buildRows`
tournant matrice par matrice, une paire reste une ligne sans code dédié ; et une
matrice sans rien à montrer dans la case ne produit aucun groupe, donc aucun
cadre vide — sur 5 cases et 6 matrices, l'alternative faisait 30 cadres.

### 2026-08-16 : Extraction de la carte, de la corbeille et de la complétion

**Statut** : Terminé

**Actions réalisées** :
- `components/TaskCard.tsx` : la carte et son menu `⋯`. Les deux gestes qui
  distinguent les écrans — glisser et appairage par dépôt — sont des props
  **facultatives** (`drag`, `split`) : absentes, le geste n'existe pas.
- `components/BinModal.tsx` : déplacée telle quelle ; `boardName` devient `scope`,
  la corbeille ne recouvrant plus forcément une seule matrice.
- `data/useCompletion.ts` : cocher / annuler / archiver à 4 s, minuteur compris.
- `Matrix.tsx` : 769 → 511 lignes, consomme les trois.

**Fichiers modifiés** :
- `apps/web/src/components/TaskCard.tsx` *(nouveau)*
- `apps/web/src/components/BinModal.tsx` *(nouveau)*
- `apps/web/src/data/useCompletion.ts` *(nouveau)*
- `apps/web/src/screens/Matrix.tsx`

**Notes** : commit séparé, à comportement identique — le diff de la
fonctionnalité reste ainsi lisible, et une régression sur l'écran matrice se
localise sans ambiguïté.

Le portage de `useCompletion` est volontairement littéral, minuteur y compris :
la fermeture du `setTimeout` capture le `tasks` du rendu qui l'a programmé.
C'est le comportement d'origine ; le corriger ici aurait mêlé une correction à
une extraction censée ne rien changer.

`npm test` (52), `typecheck` et `build` passent sur les trois workspaces.

### 2026-08-16 : Maquette du cadre par matrice

**Statut** : Terminé

**Actions réalisées** :
- Trois variantes construites avec les vraies teintes de case et les vraies
  polices du produit, sur les cinq fonds puis à deux densités (1 et 4 matrices) :
  **A** filet à gauche, **B** cadre complet, **C** étiquette seule.
- Poussée dans le projet Design « Organic » (`components/board-frame.html`), puis
  republiée en lien direct.

**Fichiers modifiés** : aucun dans le dépôt (maquette hors code).

**Notes** : ⚖️ **Les trois sont implémentées, B est la valeur par défaut.** Décision
de l'utilisateur : garder les trois pour pouvoir changer d'avis, ou en faire un
réglage plus tard. Elles vivent donc comme trois modificateurs CSS sur la grille,
et une seule constante désigne celle en vigueur.

Le projet Design n'affichait pas la carte : son index est compilé depuis un
manifeste qui n'avait pas été reconstruit. `register_assets` la déclare
explicitement — mais le lien direct reste le chemin fiable pour une validation.

Une décision commune aux trois est sortie de la passe : **le nom porte
l'information, jamais le trait seul**. Il s'écrit en `--q-dark` et non en
`--q-ink` dilué, pour tenir le contraste sur les cinq fonds — « À trier », fond
transparent sur le beige de page et gris chaud le moins saturé, est le cas
limite. Le trait, doublé par le nom, peut alors rester décoratif.

### 2026-08-16 : L'écran, le routage et les points d'entrée

**Statut** : Terminé

**Actions réalisées** :
- `screens/Global.tsx` : la grille des cinq zones, mais les tâches regroupées par
  matrice. Sélecteur de portée réutilisant `.board-switch` / `.board-menu`,
  corbeille sur la portée, total agrégé.
- `App.tsx` : `boardId: string | null` devient une vue explicite à trois formes.
  La portée voyage avec la vue.
- Deux entrées : l'accueil au-dessus de la liste, et « Vue globale » en tête du
  menu de bascule de l'écran matrice.
- `styles.css` : `.bgroup` et les trois variantes de cadre.

**Fichiers modifiés** :
- `apps/web/src/screens/Global.tsx` *(nouveau)*
- `apps/web/src/App.tsx`, `screens/Home.tsx`, `screens/Matrix.tsx`, `styles.css`

**Notes** : deux finitions sont sorties de l'essai en navigateur, invisibles à la
lecture du code — la pastille du premier cadre touchait le libellé de la case, et
le `margin-top` de `.task--pinned` décentrait le haut du cadre. Les deux sont
neutralisées **dans le contexte du groupe seulement** : l'écran matrice garde son
comportement.

Le libellé de la corbeille ne met plus la portée en minuscules : « Corbeille
(maison) » écorchait un nom propre. Seul « toutes les matrices » se met en bas de
casse, pour se lire dans la phrase.

**Deux choix à consigner** :
- Le menu « Vers une autre matrice » propose **toutes** les matrices du compte,
  pas seulement celles de la portée : l'action concerne la tâche, pas la vue.
  Déplacer hors portée la fait sortir de l'écran, et c'est la conséquence juste.
- Le compteur d'une case agrège la portée entière, tous groupes confondus. Un
  compteur par cadre aurait fait un deuxième niveau de chiffres à lire.

### 2026-08-16 : Vérifications

**Statut** : Terminé

**Actions réalisées** :
- `npm test` : ✅ 52 · `npm run typecheck` : ✅ · `npm run build` : ✅ trois workspaces
- Parcours complet en navigateur sur la base locale (console sans erreur) :
  portée « toutes » et portée « Maison », ordre des matrices conforme à
  l'accueil, menu `⋯` complet, déplacement de case (la tâche reste dans SA
  matrice, en fin de liste), cocher → toast → archivage à 4 s → corbeille →
  restauration, paire sur une ligne dans son cadre, « Dissocier ».
- **Aucun `.row-gap` n'existe pendant un glisser** — le réordonnancement est
  retiré, pas masqué. Vérifié en comptant les nœuds pendant le déplacement.
- `role="group"` + `aria-label` présents sur chaque cadre, **zéro arrêt de
  tabulation** ajouté par l'étiquette.
- `--q-solid` résolu sur les cinq cases, `#f5ead8` (fond de page) pour « À trier ».
- Univers vide choisi comme portée → message, pas de grille vide.
- **Aucun univers** → le sélecteur est un `<span>` inerte, sans chevron ni menu.
- Écran matrice **inchangé** : interstices, champ d'ajout et poignées toujours là,
  grille sans modificateur de cadre.

**Notes** : le garde-fou « univers disparu → portée toutes » n'est pas
reproductible dans un seul onglet — il faudrait que le store se rafraîchisse
pendant que la vue est ouverte. Vérifié par lecture uniquement.

Le glisser a été exercé par événements synthétiques (`DragEvent` + `DataTransfer`),
ce qui couvre le chemin de code mais pas le ressenti : le glisser à la souris
reste à dérouler à la main.

Environnement : ports Supabase locaux à nouveau décalés (55321-55324) pour
cohabiter avec la stack `unaya`, puis `config.toml` rétabli — vérifié identique à
`HEAD`.

### 2026-08-16 : Livraison

**Statut** : Terminé

**Actions réalisées** :
- Deux commits — la refacto d'abord, la fonctionnalité ensuite.
- **PR #63**, base `story-light/univers` (pas `main`), assignée, `Closes #18`. CI verte.

**Notes** : GitHub ne fermera pas #18 au merge — la fermeture automatique ne
s'applique qu'à la branche par défaut. À fermer à la main, ou quand la pile
atteindra `main`.

La stack Supabase locale reste debout sur les ports décalés, avec un `.env.local`
(ignoré par git) pour la validation manuelle. `config.toml` est déjà rétabli :
un `npm run start -w @penduline/supabase` rejouerait donc le conflit de ports
avec `unaya`.

### 2026-08-16 : Espace sous le libellé de case (retour de validation)

**Statut** : Terminé

**Actions réalisées** :
- Écart porté à 18 px pour la variante « cadre », 10 px pour les deux autres —
  17 px et 14 px d'écart apparent entre le libellé de case et l'étiquette de la
  première matrice.

**Fichiers modifiés** : `apps/web/src/styles.css`

**Notes** : 🐛 le sélecteur d'origine, `.bgroup:first-of-type`, **ne matchait
rien** : `.quad-head` est un `div` lui aussi, c'est donc *lui* le premier de son
type dans la case. Le réglage posé plus tôt n'avait jamais pris — ce que le
navigateur montrait alors venait uniquement de la neutralisation du `margin-top`
des épinglées. Corrigé en `.quad-head + .bgroup`.

Le genre d'erreur qu'aucun typecheck n'attrape et qu'une relecture laisse passer :
la règle est valide, elle ne s'applique simplement jamais. C'est l'œil qui l'a
trouvée.
