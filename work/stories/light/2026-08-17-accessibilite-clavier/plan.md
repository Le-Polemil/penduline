---
story: "Accessibilité : alternative clavier au glisser-déposer"
story_code: "accessibilite-clavier"
issues: [38]
created: 2026-08-17
status: "In Progress"
---

# #38 — Accessibilité : alternative clavier au glisser-déposer

## Contexte

Réordonner passe **exclusivement par la souris ou le doigt**. Pour qui navigue au
clavier ou au lecteur d'écran, la fonction n'existe pas — et le seul chemin
non-souris existant, la feuille d'appui long de l'accueil, filtre sur
`e.pointerType !== 'touch'` : elle est donc **inatteignable au clavier**.

Jalon « Mise en conformité », pas « confort » : c'est une obligation dès lors que
le produit visera un usage professionnel ou institutionnel.

### Ce que le ticket ignore, écrit avant trois stories

- Le menu `⋯` a déménagé dans `components/TaskCard.tsx` (#18).
- La **vue globale** existe. Le réordonnancement y est déjà retiré à dessein :
  elle n'a donc **rien à gagner** ici, et les entrées de réordonnancement ne
  doivent surtout pas y apparaître.
- L'accueil réordonne aussi les **matrices**, et les range dans un univers, par le
  même geste. Aucun chemin clavier. Le ticket ne parle que des tâches — périmètre
  élargi.

### Mesures faites en amont, qui recadrent le travail

**Le contraste des cinq cases est déjà conforme AA** — 5,90 à 8,01:1 pour les
libellés, 4,57 à 6,67:1 pour les compteurs. Les arbitrages de teinte documentés
dans `quadrants.ts` ont payé. Rien à corriger ; tout à **verrouiller par un test**.

**Les gris, eux, échouent** : `--color-neutral-600` à 3,61:1 et
`--color-neutral-500` à 2,42:1 sur le fond de page, pour 4,5 requis. Et pour les
rendre conformes, les deux niveaux **convergent vers la même teinte** — ils ne
peuvent pas rester deux couleurs de texte distinctes.

**Le focus est quasi invisible.** Les six anneaux existants utilisent
`--color-accent-300` (**1,27:1**) ou `--color-accent-100` (1,09:1), là où il en
faut 3. Et `.add-input` — le champ d'ajout de **chaque case** — porte un
`outline: none` **sans remplacement**.

---

## Décisions de cette session

| | |
|---|---|
| **Réordonner au clavier** | **Les deux** : entrées « ↑ Monter » / « ↓ Descendre » dans le menu `⋯`, **et** raccourcis `Alt`+↑/↓. Le menu rend la fonction découvrable, le raccourci la rend praticable quand on en déplace plusieurs. |
| **Contraste** | **Conformité stricte.** Le texte secondaire passe au `--color-neutral-700` existant (5,53:1) — aucune couleur inventée. Contrepartie assumée : la hiérarchie s'aplatit. |
| **Extension** | **Hors périmètre**, explicitement. Elle a son propre glisser ; le traiter ferait déborder une story déjà élargie aux matrices. À ouvrir en ticket. |

---

## Tâches

### 1. La logique de déplacement dans `packages/shared`

`layout.ts` — une fonction pure, testable, unique source de vérité pour les deux
écrans et les deux gestes :

```ts
/** Déplace une tâche d'une LIGNE vers le haut ou vers le bas dans sa case. */
export function planReorder(tasks: Task[], task: Task, dir: -1 | 1): TaskWrite[]
```

**Elle raisonne en lignes, pas en tâches** — une paire est une ligne, et la
franchir d'un cran doit sauter les deux cartes d'un coup. `buildRows` donne déjà
ce découpage ; `insertPosition` donne la position d'insertion ; `planPairMove`
emmène la partenaire. Rien à inventer, tout à composer.

Aux extrémités, elle rend `[]` — l'appelant n'a pas à connaître les bornes.

Idem pour les matrices : `Home.tsx` porte déjà `move(id, dir)`. Le sortir en
`planBoardReorder(boards, board, dir)` pour que le clavier et le tactile partagent
exactement le même code, et que les bornes soient testées une fois.

**Tests** : déplacement simple, aux deux extrémités, une paire franchie d'un cran,
une paire déplacée elle-même, une case à une seule ligne, les épinglées exclues du
calcul.

### 2. Le clavier sur les tâches

**Entrées de menu**, dans `TaskCard.tsx`, via une prop **facultative** `reorder` —
absente, elles n'existent pas. C'est ainsi que la vue globale les omet sans
conditionnelle, comme elle omet déjà `split`.

**Raccourci `Alt`+↑/↓** posé sur `.card-wrap`, pas sur la carte : l'événement
remonte depuis le contrôle qui a le focus (la case à cocher ou le `⋯`), donc le
raccourci fonctionne **sans ajouter un seul arrêt de tabulation**. Le nombre
d'arrêts par case est déjà la somme de toutes les tâches ; en ajouter un par carte
doublerait le parcours.

### 3. Le clavier sur les matrices (accueil)

Deux manques, un seul remède : `.board-row__actions` gagne **↑ ↓** — exactement le
motif déjà en place sur `.uni-head__actions`, `aria-label` compris — et un **`⋯`**
qui ouvre la feuille d'actions **déjà écrite**, laquelle contient « Déplacer vers
un univers ».

Réutiliser la feuille plutôt que d'inventer un troisième chemin : elle est déjà le
bon endroit, elle n'était simplement pas atteignable autrement qu'au doigt. Il lui
faut alors ce qu'un dialogue clavier exige : focus à l'ouverture, `Échap` pour
fermer, focus rendu au déclencheur.

### 4. Annoncer les déplacements

Une seule région `aria-live="polite"` au niveau de `AppRoot`, alimentée par un
petit hook. Un déplacement muet est un déplacement invisible.

Le message dit la **position atteinte**, pas le geste :
« « Sortir les poubelles » déplacée en 2ᵉ position sur 5. »
Sans le rang et le total, la personne doit relire la case pour savoir où elle en
est — ce qui annule le bénéfice.

Sert aussi aux matrices, et au changement de case depuis le menu.

### 5. Noms accessibles

| Élément | Aujourd'hui | Correction |
|---|---|---|
| `.task__more` | `⋯` | `aria-label` nommant la tâche |
| `.bin-btn` | son propre compteur | `aria-label="Corbeille, N éléments"` |
| `.bin-close` | `✕` | `aria-label="Fermer"` |

Vérifié par arbre d'accessibilité, pas par lecture : c'est là que ces boutons
apparaissent nommés `"⋯"` et `"0"`.

### 6. Focus visible

Une règle `:focus-visible` **globale**, en `--color-accent-600` (3,77:1 sur la
page, 4,18 sur la carte — au-dessus du seuil de 3 des éléments non textuels).

Retirer le `outline: none` de `.add-input` et remplacer les six anneaux en
`accent-300` / `accent-100`, tous sous le seuil.

### 7. Contraste

`--color-neutral-500` et `-600` **cessent de servir au texte** ; les usages
passent en `-700`. Les tokens gardent leurs valeurs : ils servent aussi à des
bordures et des fonds, où les règles ne sont pas les mêmes.

Et un **test dans `packages/shared`** verrouillant le contraste des cinq cases —
libellé, sous-titre, compteur. Il est vert aujourd'hui : son rôle est qu'un futur
ajustement de teinte ne puisse pas le casser en silence. C'est la seule façon de
transformer une mesure ponctuelle en garantie.

### 8. Formulaires

`SignIn` et `NewPassword` : `name` et `autocomplete`
(`email`, `current-password`, `new-password`). Trois attributs, relevé par la
console de Chrome — WCAG 1.3.5, et sans quoi les gestionnaires de mots de passe
sont aveugles.

---

## Fichiers touchés

| Fichier | Nature |
|---|---|
| `packages/shared/src/layout.ts` + `.test.ts` | `planReorder`, `planBoardReorder`, tests |
| `packages/shared/src/quadrants.test.ts` | Nouveau — verrou de contraste |
| `apps/web/src/components/TaskCard.tsx` | Prop `reorder` facultative, `aria-label` du `⋯` |
| `apps/web/src/components/BinModal.tsx` | Noms accessibles |
| `apps/web/src/screens/Matrix.tsx` | Câblage du réordonnancement + `Alt`+flèches |
| `apps/web/src/screens/Global.tsx` | **N'y touche pas au réordonnancement** — omet `reorder` |
| `apps/web/src/screens/Home.tsx` | ↑ ↓ et `⋯` dans les actions de ligne, feuille au clavier |
| `apps/web/src/App.tsx` | Région `aria-live`, attributs de formulaire |
| `apps/web/src/styles.css` | Focus global, contraste, retrait des `outline: none` |

Aucune migration.

---

## Vérifications

### Automatiques

```bash
npm test && npm run typecheck && npm run build
```

60 tests aujourd'hui → une dizaine de plus (`planReorder`, `planBoardReorder`,
contraste des cases).

### Par l'arbre d'accessibilité

Le contrôle qui compte, et qui ne se fait pas à la lecture :

```
mcp__chrome-devtools__take_snapshot   → aucun bouton nommé "⋯", "✕" ni "0"
```

Puis, sur l'application servie : parcourir la matrice **au clavier seul**, et
vérifier que chaque arrêt de tabulation a un anneau **visible**.

### Plan de test manuel

Base locale, compte de démo.

1. Menu `⋯` d'une tâche : « ↑ Monter » et « ↓ Descendre », grisées aux extrémités
2. `Alt`+↑/↓ avec le focus sur la case à cocher, **puis** sur le `⋯` — les deux marchent
3. Une **paire** franchit une ligne d'un seul coup, et reste ensemble
4. Chaque déplacement est **annoncé** avec son rang et le total
5. **Vue globale** : ni « Monter » ni « Descendre », `Alt`+flèches sans effet
6. Accueil : ↑ ↓ sur une matrice au clavier ; `⋯` ouvre la feuille, `Échap` la
   ferme et rend le focus
7. Ranger une matrice dans un univers **au clavier seul**
8. Parcourir l'accueil, la matrice et la vue globale **sans souris** — anneau
   visible partout, ordre de tabulation logique
9. Le champ d'ajout d'une case montre son focus (il ne le montrait pas du tout)
10. Connexion : le gestionnaire de mots de passe propose l'enregistrement

Le point 5 est le garde-fou de la vue globale : #18 y a retiré le
réordonnancement à dessein, cette story ne doit pas le réintroduire par mégarde.

### Livraison

Branche `story-light/accessibilite-clavier` depuis `main`. PR assignée à `@me`,
fermant **#38**.

L'extension reste hors périmètre — à dire dans la PR, pas à laisser deviner.
