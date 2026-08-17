---
story: "Accessibilité : alternative clavier au glisser-déposer"
story_code: "accessibilite-clavier"
issues: [38]
pr: 69
created: 2026-08-17
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. `planReorder` et `planBoardReorder` dans `packages/shared` + tests | Terminé | 2026-08-17 |
| 2. Clavier sur les tâches : entrées de menu (prop `reorder`) et `Alt`+↑/↓ | Terminé | 2026-08-17 |
| 3. Clavier sur les matrices : ↑ ↓ et `⋯` dans les actions de ligne, feuille au clavier | Terminé | 2026-08-17 |
| 4. Région `aria-live` et annonces des déplacements | Terminé | 2026-08-17 |
| 5. Noms accessibles (`⋯`, corbeille, `✕`) | Terminé | 2026-08-17 |
| 6. Focus visible : règle globale, retrait des `outline: none` | Terminé | 2026-08-17 |
| 7. Contraste : texte secondaire en `neutral-700` | Terminé | 2026-08-17 |
| 7bis. Test verrou du contraste des cases | Terminé | 2026-08-17 |
| 8. Formulaires : `name` et `autocomplete` | Terminé | 2026-08-17 |
| 9. Vérifications automatiques et arbre d'accessibilité | Terminé | 2026-08-17 |
| 10. Validation manuelle (10 points du plan) | Terminé | 2026-08-17 |
| 11. Commit, push et PR fermant #38 | Terminé | 2026-08-17 |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->

### 2026-08-17 : Logique de déplacement et verrou de contraste

**Statut** : Terminé

**Actions réalisées** :
- `planReorder(tasks, task, dir)` : déplace une tâche d'une **ligne**, paire
  comprise. Rend `null` aux extrémités.
- `planBoardReorder(boards, board, dir)` : la règle jusqu'ici en clair dans
  l'accueil, sortie et enfin testée.
- `contrast.test.ts` : verrou WCAG AA sur les cinq cases.
- 52 → **82 tests**.

**Fichiers modifiés** :
- `packages/shared/src/layout.ts`, `layout.test.ts`
- `packages/shared/src/contrast.test.ts` *(nouveau)*

**Notes** — écart au plan : `planReorder` rend `ReorderPlan | null` et non
`TaskWrite[]`. L'annonce au lecteur d'écran a besoin du rang atteint et du total ;
les faire recalculer à l'appelant l'obligerait à refaire `buildRows`, soit
exactement la duplication que cette fonction existe pour supprimer.

**🐛 Deux défauts d'`insertPosition`, trouvés par les tests, pas par la relecture.**

La fonction ancrait chaque ligne sur sa position **minimale**. Or une ligne
appairée en occupe deux.

1. **Insertion en fin de liste** : `min + 1` tombe exactement sur la seconde carte
   d'une paire. La nouvelle venue atterrissait dessus.
2. **Insertion après une ligne appairée** : le milieu calculé pouvait tomber
   **entre les deux moitiés** de cette paire. Avec `paire(0, 2)` puis `b(3)`,
   l'ancien calcul rendait `1,5` — au milieu de la paire.

Aucun des deux n'était atteignable par le glisser : ses interstices s'arrêtent à
l'avant-dernière ligne, et la fin de liste passe par `endPosition`. Le clavier
emprunte les deux chemins. **Le code avait raison tant que personne ne s'en
servait.**

Corrigé en distinguant les deux bornes : on entre au-dessus du **minimum** de la
ligne visée, on sort au-dessus du **maximum** de celle qu'on laisse.

Un test existant, « insertPosition prend la position la plus basse d'une ligne
appairée », encodait l'ancien comportement par une valeur exacte (`0.5`) sur une
paire serrée (0 et 0,001) — un écart si petit que les deux bornes se confondaient
et que le calcul faux passait quand même. Réécrit pour affirmer la **propriété**
sur une paire large, des deux côtés.

### 2026-08-17 : Le clavier, le focus et le contraste

**Statut** : Terminé

**Actions réalisées** :
- `a11y/announce.tsx` : une région `aria-live` unique au niveau de l'application,
  un hook pour l'alimenter, et `ordinal()` (« 1ʳᵉ », « 2ᵉ »…).
- `TaskCard` : prop **facultative** `reorder`, entrées « ↑ Monter » / « ↓ Descendre »
  portant leur raccourci en clair, et `Alt`+↑/↓ capté sur `.card-wrap`.
- `Matrix` : `reorderTask` câblé sur `planReorder`, annonce comprise. `Global`
  n'y touche pas — il omet la prop, les entrées n'existent pas dans son arbre.
- `Home` : ↑ ↓ et `⋯` dans les actions de ligne ; `move` passe par
  `planBoardReorder` ; la feuille devient un vrai dialogue.
- `a11y/useDialog.ts` : focus à l'ouverture, `Échap`, focus rendu — appliqué à
  `Confirm` et `BinModal`, qui n'en avaient aucun non plus.
- Noms accessibles : `⋯` d'une tâche, bouton corbeille, `✕`. Le drapeau `⚑` devient
  `role="img"` nommé « Épinglée » ; la poignée `⠿` passe en `aria-hidden`.
- Focus : règle `:focus-visible` **globale** en `--color-accent-600`, six anneaux
  invisibles remplacés, et `.add-row:focus-within` pour le champ d'ajout.
- Contraste : **26 usages** de `--color-neutral-500/600` en texte passés en `-700`.
- Formulaires : `name` et `autoComplete` sur les quatre champs.

**Fichiers modifiés** :
- `apps/web/src/a11y/announce.tsx`, `useDialog.ts` *(nouveaux)*
- `apps/web/src/components/TaskCard.tsx`, `BinModal.tsx`, `Confirm.tsx`
- `apps/web/src/screens/Matrix.tsx`, `Home.tsx`, `Global.tsx`
- `apps/web/src/App.tsx`, `styles.css`

**Notes** :

**Le drapeau et la poignée sont traités à l'inverse l'un de l'autre**, et c'est
voulu : `⚑` porte une information — épinglée — donc il est nommé ; `⠿` n'est qu'un
rappel décoratif du glisser, donc masqué. Un lecteur d'écran énonçait sinon les
points braille de « ⠿ » sur chaque carte.

**🐛 `@media (hover: none)` retirait les actions de ligne par `display: none`.**
Or une tablette munie d'un clavier rapporte elle aussi `hover: none` : le seul
chemin clavier qu'on venait d'ouvrir aurait disparu de l'arbre d'accessibilité sur
ces appareils. Remplacé par un repli à `max-width: 0` que le focus déplie — les
actions restent dans le document, le survol ne les révèle toujours pas.

`Alt`+flèche est consommé **même en bout de liste** : le geste nous est destiné,
et le laisser passer déclencherait la navigation d'historique du navigateur.

`Confirm` et `BinModal` n'étaient pas au plan. Ils avaient le même défaut que la
feuille, et le corriger séparément aurait fait trois copies d'un même contrat.

### 2026-08-17 : Vérifications

**Statut** : Terminé

**Actions réalisées** :
- `npm test` ✅ **82** · `typecheck` ✅ · `build` ✅ trois workspaces.
- Parcours complet dans Chrome, sur la base locale, **console sans erreur** :

| Contrôle | Résultat |
|---|---|
| Boutons nommés par leur seul glyphe ou leur compteur | **0** |
| Régions `aria-live` | **1**, comme voulu |
| `Alt`+↓ depuis la case à cocher | déplace, annonce « en 2ᵉ position sur 2 » |
| `Alt`+↑ depuis le `⋯` | déplace aussi — la remontée d'événement fonctionne |
| Menu `⋯` en tête de case | « ↑ Monter » **grisée**, « ↓ Descendre » active |
| Raccourci affiché dans le menu | « ↑ Monter Alt+↑ » |
| **Vue globale** | **0 entrée** de réordonnancement, `Alt`+flèches sans effet **ni annonce** |
| Accueil, ↑ ↓ au clavier | déplace et annonce ; ↑ grisée en tête |
| Feuille d'actions | `role="dialog"`, `aria-modal`, nommée, prend le focus |
| `Échap` | ferme **et rend le focus au déclencheur** |
| « Déplacer vers un univers » | atteignable au clavier |
| Anneau de focus | `rgb(178, 98, 45)` = `--color-accent-600` |
| Champ d'ajout | anneau sur le contrôle composé — il n'en avait aucun |
| **28 éléments focusables de l'accueil** | **tous** avec un anneau visible |

**Notes** : le raccourci a été exercé par événements synthétiques (`KeyboardEvent`
avec `altKey`), qui suivent le même chemin React que la frappe réelle. Restent à
dérouler à la main : le vrai clavier, et surtout un **lecteur d'écran** — aucun
contrôle automatique ne dit si une annonce est *compréhensible*.

Le premier essai a fait croire à une panne : `Alt`+↑ sur une carte déjà en tête ne
faisait rien. C'était le comportement correct — `up` vaut `null` en bout de liste.
La cible du test était mauvaise, pas le code.
