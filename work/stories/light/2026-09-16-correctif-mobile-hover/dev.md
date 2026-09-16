---
story: "Correctif Mobile 2/3 — les états de survol"
story_code: "correctif-mobile-hover"
created: 2026-09-16
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Publier l'inventaire constaté sur l'issue #90 | Terminé | 2026-09-16 |
| 2. Conditionner les ~45 règles `:hover` sous `(hover: hover) and (pointer: fine)`, en place | Terminé | 2026-09-16 |
| 3. Scinder les règles qui mêlent `:hover` et `:focus-visible` / `:focus-within` | Terminé | 2026-09-16 |
| 4. `.att__del` et `.sub__del` visibles au doigt, atténuées à 55 % | Terminé | 2026-09-16 |
| 5. `usePointeurFin()` + montage conditionnel du sous-menu d'univers | Terminé | 2026-09-16 |
| 6. Le motif de refus de « Faire aujourd'hui », lisible sans infobulle | Terminé | 2026-09-16 |
| 7. Masquer `.task-menu__key` (`Alt+↑ / Alt+↓`) sous `(hover: none)` | Terminé | 2026-09-16 |
| 8. Vérifications : typecheck, tests, build, relecture A/B tactile / souris / clavier | Terminé | 2026-09-16 |

## Journal

### 2026-09-16 : Inventaire publié sur #90

**Statut** : Terminé

**Actions réalisées** :
- Relevé statique (57 `:hover`, 0 garde) et vérification en émulation tactile.
- Corps de l'issue #90 remplacé : sections A à E, tableau des effets figés, corrections retenues, et l'exposé du troisième axe de requête média.

**Fichiers modifiés** : aucun (issue GitHub #90)

**Notes** : la preuve la plus parlante tient en deux mesures — après un tap, le `⋯` garde `background: rgb(255, 242, 235)` là où son voisin est transparent, et `document.querySelectorAll(':hover')` renvoie treize éléments.

### 2026-09-16 : Le survol conditionné, en place

**Statut** : Terminé

**Actions réalisées** :
- Environ 45 règles `:hover` enveloppées d'un `@media (hover: hover) and (pointer: fine)`, chacune **au contact de son composant** ; les règles adjacentes partagent un bloc.
- Un commentaire de tête posé sur la première garde du fichier expose les trois axes et la raison de la frontière.
- Neuf règles qui **mêlaient** `:hover` et `:focus-visible` / `:focus-within` / `[aria-expanded]` dans une même déclaration ont été scindées : la moitié survol sous garde, la moitié focus dehors.
- Le bloc `@media (hover: none)` qui neutralisait le survol des actions d'univers a été **supprimé** : il est devenu sans objet, la garde faisant le travail en amont et les deux règles de focus étant déjà déclarées hors garde.

**Fichiers modifiés** :
- `apps/web/src/styles.css`

**Notes** :
- Les remplacements ont été faits par script, avec **assertion d'unicité sur chaque bloc** : une chaîne introuvable ou trouvée deux fois arrête le script plutôt que de modifier la mauvaise règle. Un contrôle final vérifie qu'il ne reste aucune règle `:hover` hors garde (seul `a:hover` demeure, volontairement) et que les accolades sont équilibrées (656 / 656).
- Le vrai risque du lot était desktop, pas tactile : 45 règles déplacées d'un cran de profondeur, c'est 45 occasions de perdre un survol qui marchait. D'où la vérification à la souris ci-dessous.

### 2026-09-16 : Les deux croix, le sous-menu, les raccourcis

**Statut** : Terminé

**Actions réalisées** :
- `.att__del` et `.sub__del` passent à `opacity: 0.55` sous `(pointer: coarse)`.
- `usePointeurFin()` ajouté à `data/useBalayage.ts`, et `useTelephone()` refactorisé : les deux partagent désormais un `useRequeteMedia()` privé.
- `TaskCard` ne monte `onMouseEnter` / `onMouseLeave` du sous-menu d'univers que sur pointeur fin.
- `.task-menu__key` masqué sous `(hover: none)`.

**Fichiers modifiés** :
- `apps/web/src/styles.css`
- `apps/web/src/data/useBalayage.ts`
- `apps/web/src/components/TaskCard.tsx`

**Notes** : la tâche 6 (motif de refus de « Faire aujourd'hui ») n'a demandé **aucun code**. Vérification faite : le menu `⋯` rend déjà le motif en clair dans `.task-menu__why` sur une entrée `aria-disabled`, et le bouton porte le motif dans son `aria-label`. L'infobulle native n'était donc pas le seul porteur — elle n'était que le porteur *visuel sur desktop*. Rien à réparer, seulement à constater.


### 2026-09-16 : Vérifications

**Statut** : Terminé

**Automatique** : `npm run typecheck`, `npm test` (233 + 34), `npm run build` — tous passés.

**Au doigt (390 × 844)** — après un tap sur une carte :

| Mesure | Avant | Après |
|---|---|---|
| Fond du `⋯` tapé | `rgb(255, 242, 235)` | `rgba(0, 0, 0, 0)` — identique à son voisin |
| Ombre de la carte tapée | `--shadow-md` | `none` |
| `transform` de la case | `scale(1.15)` | `none` |
| Croix « détacher un lien » | `opacity: 0` | `0.55` |
| Croix « supprimer une étape » | `opacity: 0` | `0.55` |
| `.task-menu__key` | visible | `display: none` |

Sous-menu d'univers au doigt : un tap ouvre (dépliage en place, `position: static`), un second referme. Aucun état concurrent.

**À la souris (1440 × 900)** — carte survolée : ombre `--shadow-md` présente, ses deux raccourcis à `opacity: 1` ; carte voisine non survolée : raccourcis à `0`. `.att__del` est bien redescendu à `0` — la règle tactile ne fuit pas sur desktop.

**Au clavier (1440 × 900)** — focus sur le `⋯` d'une ligne de matrice : `.board-row__actions` s'ouvre à `60px`. Focus sur une action d'univers : `max-width: 320px`, `opacity: 1`, largeur réelle 228 px. `:focus-within` n'a pas été emporté par la garde.

**Notes** : `document.querySelectorAll(':hover')` renvoie **toujours** treize éléments après un tap, et c'est normal — l'état `:hover` du navigateur existe encore, on ne peut pas l'en empêcher. Ce qui change, c'est qu'il ne **peint** plus rien. La mesure honnête du correctif est donc la comparaison des propriétés calculées, pas le compte des éléments survolés.

Un piège de mesure rencontré : lire `getComputedStyle` dans le même tick qu'un `focus()` programmatique renvoie la valeur d'avant. Le premier relevé du chemin clavier annonçait `max-width: 0px` et laissait croire à une régression ; relu au tick suivant, il donne `320px`.
