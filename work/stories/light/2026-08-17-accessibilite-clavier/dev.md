---
story: "Accessibilité : alternative clavier au glisser-déposer"
story_code: "accessibilite-clavier"
issues: [38]
created: 2026-08-17
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. `planReorder` et `planBoardReorder` dans `packages/shared` + tests | Terminé | 2026-08-17 |
| 2. Clavier sur les tâches : entrées de menu (prop `reorder`) et `Alt`+↑/↓ | En attente | |
| 3. Clavier sur les matrices : ↑ ↓ et `⋯` dans les actions de ligne, feuille au clavier | En attente | |
| 4. Région `aria-live` et annonces des déplacements | En attente | |
| 5. Noms accessibles (`⋯`, corbeille, `✕`) | En attente | |
| 6. Focus visible : règle globale, retrait des `outline: none` | En attente | |
| 7. Contraste : texte secondaire en `neutral-700` | En attente | |
| 7bis. Test verrou du contraste des cases | Terminé | 2026-08-17 |
| 8. Formulaires : `name` et `autocomplete` | En attente | |
| 9. Vérifications automatiques et arbre d'accessibilité | En attente | |
| 10. Validation manuelle (10 points du plan) | En attente | |
| 11. Commit, push et PR fermant #38 | En attente | |

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
