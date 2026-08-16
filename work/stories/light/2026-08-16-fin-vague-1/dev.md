---
story: "Fin de la Vague 1"
story_code: "fin-vague-1"
issues: [12, 13, 15]
created: 2026-08-16
status: "Done"
---

# Journal de développement

## Progression

| # | Tâche | Issue | Statut | Date |
|---|-------|-------|--------|------|
| 1 | Supprimer le doublon `packages/shared/icon.svg` | — | Terminé | 2026-08-16 |
| 2 | `board_id` dans `TaskPatch` + prop `tone` sur `Confirm` | #13 | Terminé | 2026-08-16 |
| 3 | Web — renommer une tâche | #12 | Terminé | 2026-08-16 |
| 4 | Web — sous-menu « Vers une autre matrice » + confirmation | #13 | Terminé | 2026-08-16 |
| 5 | Extension — menu `⋯` sur la carte de tâche | #12/#13 | Terminé | 2026-08-16 |
| 6 | Extension — renommer et déplacer depuis ce menu | #12/#13 | Terminé | 2026-08-16 |
| 7 | `<Loader />` : le nid pendulaire | #15 | Terminé | 2026-08-16 |
| 8 | Brancher le loader aux 4 points qui renvoient `null` | #15 | Terminé | 2026-08-16 |
| 9 | Documentation (`work/publication-extension.md`) | — | Terminé | 2026-08-16 |
| 10 | Vérifications qualité + test manuel | — | Terminé | 2026-08-16 |

## Journal

<!-- Les entrées sont ajoutées ici après chaque action concrète. -->

### 2026-08-16 — Tâches 1 à 6 (#12, #13) : renommer et changer de matrice

**Statut** : Terminé

**Actions réalisées** :
- Suppression de `packages/shared/icon.svg`, doublon orphelin.
- `board_id` ajouté à `TaskPatch` ; prop `tone` sur `Confirm`.
- Web : « Renommer » dans le menu `⋯` avec édition en place, section « Vers une
  autre matrice », confirmation quand la tâche est appairée.
- Extension : menu `⋯` créé de toutes pièces, révélé au survol, portant les mêmes
  actions.

**Fichiers modifiés** :
- `packages/shared/src/types.ts`, `packages/shared/icon.svg` (supprimé)
- `apps/web/src/screens/Matrix.tsx`, `apps/web/src/components/Confirm.tsx`
- `apps/extension/src/App.tsx`
- `apps/web/src/styles.css`, `apps/extension/src/styles.css`

**Notes** :

*🐛 Un défaut hors périmètre, trouvé en ouvrant le fichier : **l'extension cassait
encore les paires en silence.*** #51 n'avait corrigé que le web. Le popup remettait
`pair_id` à `null` à l'épinglage **et** au glisser-déposer, détruisant donc des
appairages créés sur le web — exactement le bug qu'on venait de supprimer, mais
depuis l'autre application. Corrigé : le popup a maintenant son propre `movePair()`,
et il ne reste plus un seul `pair_id: null` dans son code.

Le popup n'affiche pas les paires côte à côte (c'est une mise en page du web), mais
ne pas les *afficher* n'autorise pas à les *détruire*.

*Pas de confirmation dans l'extension*, contrairement au web : un popup de 400 px
ne peut pas empiler une modale sans se recouvrir lui-même. La partenaire suit tout
de même — l'invariant prime, et le rangement en connaissance de cause se fait sur
le web.

*Le `⋯` de l'extension n'apparaît qu'au survol.* La carte fait 376 px et porte déjà
case + titre + épingle ; un bouton permanent rognerait le titre, seul contenu utile
au repos. `:focus-within` le garde atteignable au clavier — sans quoi renommer
deviendrait impossible sans souris.

*Les matrices sont listées en une colonne*, contrairement à la grille 2×2 des cases :
un nom de matrice est libre et souvent long, une demi-largeur le tronquerait alors
que c'est le seul repère pour choisir.

### 2026-08-16 — Tâches 7 et 8 (#15) : le nid pendulaire

**Statut** : Terminé

**Actions réalisées** :
- Composant `Loader` pour le web et pour l'extension.
- Branché aux **quatre** points qui renvoyaient `null` (web ×2, extension ×2).
- `prefers-reduced-motion` : logo fixe, sans oscillation.

**Fichiers modifiés** :
- `apps/web/src/components/Loader.tsx` (nouveau), `apps/extension/src/Loader.tsx` (nouveau)
- `apps/web/src/App.tsx`, `apps/extension/src/App.tsx`
- `apps/web/src/styles.css`, `apps/extension/src/styles.css`

**Notes** :

*Le plan prévoyait d'animer `icon.svg` ; je ne l'ai pas fait.* Ce fichier sert de
**favicon**, et une SVG animée chargée comme favicon s'anime dans certains
navigateurs — un logo d'onglet qui oscille en permanence, que personne n'a demandé.
`icon.svg` reste donc strictement statique et fait foi pour le dessin ; les deux
`Loader` en portent une copie animée, avec un commentaire qui le dit dans les deux.

*Ce qui a justifié d'inliner plutôt que de charger l'image.* La demande initiale
disait « la queue se plie d'un côté ou de l'autre ». Faire pivoter l'image entière
en bloc — ce qu'aurait donné un `<img>` animé — ne plie rien : c'est un pendule
rigide. En inlinant, le col et le nid deviennent deux groupes qu'on peut faire
osciller à des amplitudes différentes (4,5° et 9°) avec un décalage de phase de
0,11 s. **C'est cet écart qui produit le pli à la jonction**, et il ne s'obtient
pas autrement sans déformer le tracé.

*Un piège CSS qui aurait tout cassé en silence* : sans `transform-box: view-box`,
`transform-origin` se résout sur la boîte englobante de **chaque** groupe. Le col
et le nid auraient alors tourné chacun autour de son propre centre, au lieu de
pendre du même point — deux morceaux qui pivotent sur eux-mêmes, pas un pendule.

*Le col mène, le nid suit* (délai négatif sur le col) : l'extrémité libre d'un
pendule est toujours en retard sur son point d'attache. L'inverse se remarque
sans qu'on sache pourquoi.

**Vérification** — l'animation ne se juge pas sur du code. Trois instants du cycle
ont été figés côte à côte avec le CSS réel de l'app :

| Instant | Rendu |
|---|---|
| t = 0 s | incliné à gauche, col et nid désalignés |
| t = 0,42 s | vertical, aligné |
| t = 0,85 s | incliné à droite, désalignement inverse |

Le pli est bien visible à la jonction aux deux extrêmes.

### 2026-08-16 — Tâches 9 et 10 : documentation et vérifications

**Statut** : Terminé

**Actions réalisées** :
- `work/publication-extension.md` : notes de la 1.1.0 réécrites pour couvrir les
  **sept** changements, et non plus quatre.
- `npm run typecheck` et `npm run build` : aucune erreur, trois workspaces.

**Notes** : le manifeste n'a pas bougé — toujours 1.1.0, toujours
`["storage", "contextMenus"]`. Un seul des sept changements touche la fiche du
Store (la capture contextuelle, livrée dans le lot précédent) ; les six autres sont
internes. Une seule soumission couvre donc toute la Vague 1.

**Reste à faire, côté utilisateur** : les points du plan de test qui demandent
l'extension chargée dans Chrome — menu `⋯` au survol, renommage et déplacement
depuis le popup, écran de chargement à l'ouverture.
