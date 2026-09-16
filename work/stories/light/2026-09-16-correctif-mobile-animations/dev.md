---
story: "Correctif Mobile 3/3 — les animations"
story_code: "correctif-mobile-animations"
created: 2026-09-16
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Publier l'inventaire et les mesures sur l'issue #91 | Terminé | 2026-09-16 |
| 2. `prefers-reduced-motion` : couverture globale en fin de feuille | Terminé | 2026-09-16 |
| 3. `withVT()` court-circuite l'API View Transitions sous la préférence | Terminé | 2026-09-16 |
| 4. Alléger l'ouverture de « ＋ ajouter » et re-mesurer | **Annulée** — la remesure a démenti le motif | 2026-09-16 |
| 5. Supprimer les images-clés mortes `mm-pinpulse` | Terminé | 2026-09-16 |
| 6. Verrou de non-régression `styles.test.ts` | Terminé | 2026-09-16 |
| 7. Vérifier le rendu du délai d'annulation de 4 s en mobile | Terminé | 2026-09-16 |
| 8. Vérifications : typecheck, tests, build, mesures, relecture desktop | Terminé | 2026-09-16 |

## Journal

### 2026-09-16 : Inventaire publié sur #91, puis corrigé

**Statut** : Terminé

**Actions réalisées** :
- Mesures sous bridage CPU 4× à 390 × 844, par intervalles entre trames.
- Corps de l'issue #91 remplacé, puis **corrigé** après la remesure (voir la tâche 4).

**Fichiers modifiés** : aucun (issue GitHub #91)

**Notes** : l'inventaire initial contenait une erreur d'attribution que j'ai publiée avant de la découvrir. Elle est rectifiée dans l'issue, dans une section « Ce que la remesure a démenti » plutôt qu'en réécrivant l'historique — le raisonnement erroné a de la valeur pour le prochain qui le referait.

### 2026-09-16 : `prefers-reduced-motion`, du cas par cas au plancher

**Statut** : Terminé

**Actions réalisées** :
- Plancher global en fin de `styles.css` : `*, *::before, *::after` avec `animation-duration`, `animation-iteration-count`, `transition-duration` et `scroll-behavior` en `!important`.
- `withVT()` court-circuite `startViewTransition` sous la préférence, par une fonction `mouvementReduit()` documentée.

**Fichiers modifiés** :
- `apps/web/src/styles.css`
- `apps/web/src/lib/viewTransition.ts`

**Notes** :
- `0.01ms` et non `none` : une durée quasi nulle laisse jouer les `animation-fill-mode` et les états finaux, là où `animation: none` ferait retomber certains éléments sur leur état **initial** — une carte en `mm-in … backwards` resterait à `opacity: 0`.
- Les huit blocs existants restent **au-dessus** du plancher, et ce n'est pas un doublon : eux préservent un **état** (le liseré de `.task--flash`, le `rotate: 0deg` du nid), le plancher ne supprime qu'une **durée**. Un nid arrêté de travers se lirait comme un défaut d'affichage.
- Le CSS ne peut pas atteindre `::view-transition-*` : ces pseudo-éléments vivent dans une couche que le sélecteur universel de la feuille ne voit pas. D'où la seconde expression de la même frontière, en JS — troisième occurrence de ce motif après `useTelephone` (#89) et `usePointeurFin` (#90).
- Vérifié dans le CSSOM : 9 blocs `prefers-reduced-motion`, dont le plancher, parsé et ses déclarations bien marquées `!important`. Le navigateur normalise le sélecteur en `*, ::before, ::after`.

### 2026-09-16 : Images-clés mortes

**Statut** : Terminé

**Actions réalisées** : suppression de `@keyframes mm-pinpulse`, déclarée et utilisée zéro fois.

**Fichiers modifiés** : `apps/web/src/styles.css`

**Notes** : reste de l'épinglage, remplacé par l'engagement du jour (#49). Le commentaire de `.task--today` disait que la pulsation avait été écartée ; les images-clés, elles, étaient restées.

### 2026-09-16 : Tâche 4 — **annulée par la remesure**

**Statut** : Annulée

**Ce qui était prévu** : retirer `padding-right` (`.add-input`) et `margin-left` (`.add-word`) de la transition d'ouverture de « ＋ ajouter », parce que l'audit la donnait à **58,4 ms** sur sa première trame, attribués aux quatre propriétés de disposition animées simultanément.

**Ce que la remesure a montré** :

| | Pire trame | Trames perdues |
|---|---|---|
| 1<sup>re</sup> ouverture | 58,5 ms | 1 |
| 2<sup>e</sup> | 9,1 ms | 0 |
| 3<sup>e</sup> | 9,2 ms | 0 |

Les 58 ms sont un **coût de premier passage**, pas un coût par animation. Pour en avoir le cœur net, A/B exact dans la même session — réinjection des deux seules propriétés retirées par une feuille de style temporaire, échauffement, puis cinq passes de chaque côté, **dans les deux ordres** :

| | Médiane sur 5 passes |
|---|---|
| Avec les quatre propriétés | **9,3 ms** |
| Avec deux propriétés en moins | **9,3 ms** |

Zéro trame perdue des deux côtés, dans les deux ordres.

**Décision** : le changement est **revenu en arrière**. Il n'achetait rien de mesurable, et le ticket demande explicitement de mesurer plutôt que de supposer — ce qui vaut aussi pour le correctif. Une note de mesure détaillée est posée à la place, dans le commentaire de `.add-cue`, pour que le prochain qui lira « quatre propriétés de disposition animées » ne refasse pas le même raisonnement.

**Fichiers modifiés** : `apps/web/src/styles.css` (commentaire seul, au net)

### 2026-09-16 : Verrou de non-régression sur la feuille de styles

**Statut** : Terminé

**Actions réalisées** :
- `apps/web/src/styles.test.ts` : trois assertions — toute `@keyframes` déclarée est utilisée, le plancher global existe, aucune règle `:hover` hors de la garde `(hover: hover)` sauf `a:hover`.
- `apps/web/src/vite-env-node.d.ts` : deux signatures minimales de `node:fs` / `node:url`.

**Fichiers modifiés** :
- `apps/web/src/styles.test.ts` (nouveau)
- `apps/web/src/vite-env-node.d.ts` (nouveau)

**Notes** :
- **`?raw` ne marche pas sur un `.css`.** `pwa/manifest.test.ts` l'utilise avec succès sur un `.webmanifest`, mais le greffon CSS de Vite revendique l'extension `.css` avant que la requête `?raw` ne soit honorée : l'import renvoie une chaîne **vide**. Le test serait passé sur un fichier inexistant, c'est-à-dire n'aurait rien verrouillé. `assetsInclude` et `import.meta.glob({ query: '?raw' })` donnent le même vide. D'où `node:fs`.
- **`@types/node` a été installé puis retiré.** `tsconfig.json` restreint volontairement `"types"` à `["vite/client"]`, et y ajouter `"node"` rendrait `process`, `Buffer` et `__dirname` visibles dans tout le code d'une app qui tourne dans un navigateur. Deux signatures déclarées à la main coûtent moins cher que cette perte.
- **Le verrou a été éprouvé** : en ajoutant temporairement des images-clés inutilisées et une règle `:hover` non gardée, deux des trois tests échouent. Un verrou qu'on n'a pas vu échouer ne verrouille rien.

### 2026-09-16 : Le délai d'annulation en mobile

**Statut** : Terminé

**Actions réalisées** : relevé du toast à 390 px après avoir coché une tâche.

**Fichiers modifiés** : aucun — rien à corriger.

**Notes** : toast large de 289 px sur 390 (x 50 → 340), posé à 26 px du bas via `calc(26px + env(safe-area-inset-bottom))` mis en place par #89, cible « Annuler » de **80,6 × 48,5 px**, `scrollWidth` à 390. Rien à reprendre. Le mécanisme lui-même est sain depuis #75 : le minuteur ne porte plus d'écriture.

### 2026-09-16 : Vérifications

**Statut** : Terminé

**Automatique** : `npm run typecheck`, `npm test` (233 + 37, dont 3 nouveaux), `npm run build` — tous passés.

**Mesures à 390 × 844, bridage CPU 4×** — aucune animation ne perd de trame au régime établi : « ＋ ajouter » 9,3 ms, menu `⋯` 9,3 ms, clignotement d'arrivée 9,3 ms sur 1,6 s × 2, balayage de carte 0 trame perdue.

**Desktop 1440 × 900** — durées intactes (`.task` 0,18 s, écran 0,3 s, `::view-transition-group` 0,28 s), ouverture de « ＋ ajouter » à 12,9 ms, menu à 9,3 ms.

**Réserve assumée** : `prefers-reduced-motion` **n'a pas pu être exercé**. L'outil d'émulation disponible ne couvre pas cette caractéristique média. Ce qui a été prouvé : les 9 blocs sont présents dans le CSSOM, le plancher est parsé et ses quatre déclarations portent bien `!important`, et la garde JS est en place. Ce qui reste à constater dans un vrai navigateur, préférence activée : que plus rien ne bouge, que le nid s'arrête **droit**, et que la corbeille s'ouvre sans transition de vue.
