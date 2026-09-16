---
story: "Correctif Desktop — divers"
story_code: "correctif-desktop-divers"
created: 2026-09-16
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Publier l'inventaire sur #92, dont la reproduction de l'item 2 | Terminé | 2026-09-16 |
| 2. Repli sur les variables de quadrant lues hors `.quad` | Terminé | 2026-09-16 |
| 3. `::view-transition-group(bin) { z-index }` | Terminé | 2026-09-16 |
| 4. Piège de focus dans `useDialog` | Terminé | 2026-09-16 |
| 5. Cartes appairées allégées (poignée et raccourcis repliés dans le `⋯`) | Terminé | 2026-09-16 |
| 6. Bouton « dissocier » sur le lien de paire | Terminé | 2026-09-16 |
| 7. `cursor: grab` seulement quand la carte est déplaçable | Terminé | 2026-09-16 |
| 8. Chevron de la revue lisible | Terminé | 2026-09-16 |
| 9. Masquer le bouton d'effacement natif de la recherche | Terminé | 2026-09-16 |
| 10. `Ctrl+Z` inerte quand une modale est ouverte | Terminé | 2026-09-16 |
| 11. Vérifications : typecheck, tests, build, relecture souris / clavier / doigt | Terminé | 2026-09-16 |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->

### 2026-09-16 : Inventaire publié sur #92

**Statut** : Terminé

**Actions réalisées** : passe desktop à 1440 × 900, avec contrôles à 1024 × 768 et 2560 × 1440. Sept constats ajoutés aux deux de l'issue, et l'item 2 **reproduit** alors qu'il était donné pour « déduit de la lecture du code ».

**Fichiers modifiés** : aucun (issue GitHub #92)

### 2026-09-16 : La case à cocher invisible, et la règle qu'elle impose

**Statut** : Terminé

**Actions réalisées** :
- Repli `var(--q-ink, …)` sur les neuf lectures de variables de quadrant qui peuvent être évaluées hors `.quad`.

**Fichiers modifiés** : `apps/web/src/styles.css`

**Notes** : le symptôme est spectaculaire, la cause est instructive. `border: 2px solid var(--q-ink)` ne perd pas une couleur quand la variable manque : la déclaration devient **invalide au calcul** et **tout le raccourci tombe** — largeur et style compris. Mesuré avant : `border-style: none`, `border-width: 0px`. Après : `solid`, `2px`, `rgb(130, 121, 106)`. La règle qui en découle vaut au-delà du ticket, et elle est écrite dans le code : toute lecture d'une variable de quadrant depuis un composant qui peut vivre hors `.quad` porte un repli.

### 2026-09-16 : L'empilement des transitions de vue

**Statut** : Terminé

**Actions réalisées** : `::view-transition-group(bin) { z-index: 100 }`, à côté de la règle de durée.

**Fichiers modifiés** : `apps/web/src/styles.css`

**Notes** : **la vérification a demandé trois essais, et les deux premiers m'ont induit en erreur.** Ralenti à 4 s, je capturais après la fin de l'animation sans le voir (`getAnimations()` renvoyait 0) ; la capture montrait bien un chevauchement, mais je ne pouvais pas dire s'il venait de l'empilement ou du simple fondu d'entrée du panneau, qui laisse voir à travers.

Le verdict est venu d'un **A/B à 15 s de ralenti** : règle neutralisée (`z-index: auto`), le panneau est **entièrement invisible**, totalement recouvert par les cartes ; règle active, il est devant et se fond normalement. Le correctif est donc réel, et le bug de l'issue — déduit de la lecture du code — était exact.

### 2026-09-16 : Le piège de focus, la paire, le curseur, le chevron, la croix, `Ctrl+Z`

**Statut** : Terminé

**Actions réalisées** :
- `useDialog` confine `Tab` : le `onKeyDown` qui interceptait `Échap` devient un aiguillage à deux touches. Une implémentation couvre les trois surfaces modales.
- `TaskCard` reçoit `paired` : une carte appairée perd sa poignée et ses deux raccourcis, qui restent dans son `⋯`.
- Le lien de paire devient un vrai `<button className="unpair">`, rendu par `Matrix.tsx` et `Global.tsx`.
- `cursor: grab` passe sur une classe `.task--saisissable` posée par le composant.
- Chevron de la revue de 12 à 17 px ; `::-webkit-search-cancel-button` masqué.
- `useUndoShortcut` ignore `Ctrl+Z` en présence d'un `[role="dialog"]`.

**Fichiers modifiés** :
- `apps/web/src/a11y/useDialog.ts`
- `apps/web/src/components/TaskCard.tsx`
- `apps/web/src/screens/{Matrix,Global}.tsx`
- `apps/web/src/data/useUndoShortcut.ts`
- `apps/web/src/styles.css`

**Notes** :
- `getComputedStyle(champ, '::-webkit-search-cancel-button')` renvoie `display: block` **alors que la croix a bien disparu** : le pseudo-élément appartient au DOM fantôme de l'agent utilisateur et n'est pas lu fidèlement. C'est la capture d'écran qui tranche, pas la mesure.
- Le bouton de dissociation n'a demandé **aucune logique** : `unpair(task)` existait déjà des deux côtés et passe par `store.group`, donc `Ctrl+Z` rétablit la paire. D'où l'absence de confirmation — la réversibilité prime.

### 2026-09-16 : Trois cibles que #89 ne pouvait pas voir

**Statut** : Terminé

**Actions réalisées** : zones de frappe étendues sur `.att__del` (39,6 px), `.sub__del` (33,6 px) et `.sub__check` (13 px), qui restaient sous 44 px.

**Fichiers modifiés** : `apps/web/src/styles.css`

**Notes** : elles n'étaient **pas mesurables** au moment de #89 — à `opacity: 0`, révélées au seul survol, le relevé les écartait comme invisibles. C'est #90 qui les a rendues visibles au doigt, donc mesurables, donc soumises à la règle de #89. Un exemple net de ce que le découpage en trois lots produit : chaque passe rend la suivante capable de voir ce qu'elle ne voyait pas.

### 2026-09-16 : Vérifications

**Statut** : Terminé

**Automatique** : `npm run typecheck`, `npm test` (233 + 37), `npm run build` — tous passés.

**À la souris, 1440 × 900** :

| Vérification | Résultat |
|---|---|
| Case à cocher, Revue | `solid`, `2px`, `rgb(130, 121, 106)` — visible |
| Curseur, carte de Revue | `auto` (était `grab`) |
| Chevron de la revue | 7,6 × 17 px (était 5,7 × 15) |
| Titres d'une paire | 138 px chacun, **non tronqués** |
| Poignées et raccourcis dans une paire | 0 et 0 |
| Croix native de la recherche | absente (constaté à l'écran) |
| Corbeille, empilement | panneau devant, A/B à 15 s de ralenti |

**Au clavier** : corbeille ouverte, `Tab` depuis « Vider la corbeille » revient à « Fermer la corbeille » ; `Maj+Tab` depuis le premier va au dernier ; le focus ne sort jamais du panneau.

**`Ctrl+Z`** : corbeille ouverte, aucun toast ; corbeille fermée, « Annulé : Ajoutée à aujourd'hui ». La fixture est revenue à son état initial.

**Au doigt, 390 × 844** : paire empilée, bouton de dissociation à 63 px de centre contre 64,5 px pour la case à cocher — **aligné à 1,5 px près** —, 44 × 44 de zone de frappe, opacité 0,55 sans survol. `scrollWidth` à 390, et **aucune cible sous 44 px** sur l'écran matrice.
