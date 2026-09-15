---
story: "Correctif Mobile 1/3 — la base"
story_code: "correctif-mobile-base"
created: 2026-09-15
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Publier l'inventaire constaté sur l'issue #89 | Terminé | 2026-09-15 |
| 2. En-tête de matrice : supprimer le débordement horizontal (`.matrix-head`, `.board-switch`) | Terminé | 2026-09-15 |
| 3. Paire empilée sous 720 px, trait de lien vertical aligné sur l'axe des cases | Terminé | 2026-09-15 |
| 4. Hook `useBalayage` + fonction pure `etatApres` et son test | Terminé | 2026-09-15 |
| 5. Bandeau d'actions `.task-swipe` dans `TaskCard`, état tenu par les 4 écrans | Terminé | 2026-09-15 |
| 6. Carte tactile sous 720 px : poignée masquée, raccourcis retirés, case et `⋯` à 44 px | Terminé | 2026-09-15 |
| 7. « Ajouter une étape » dans le menu `⋯` | Terminé | 2026-09-15 |
| 8. Cibles tactiles restantes à 44 px sous `(pointer: coarse)` | Terminé | 2026-09-15 |
| 9. Champs de saisie à 16 px sous `(pointer: coarse)` | Terminé | 2026-09-15 |
| 10. Marges de sécurité `env(safe-area-inset-*)` et `100dvh` | Terminé | 2026-09-15 |
| 11. Vérifications : typecheck, tests, build, relecture A/B 390 / 834 / 1440 | Terminé | 2026-09-15 |

## Journal

### 2026-09-15 : Inventaire publié sur #89

**Statut** : Terminé

**Actions réalisées** :
- Audit A/B mené en émulation Chrome DevTools (390 × 844 DPR 3 tactile vs 1440 × 900) sur les huit écrans, base Supabase locale enrichie de cas limites (titres longs, échéances en retard et à venir, paire, pièces jointes, étapes, corbeille remplie).
- Corps de l'issue #89 remplacé : sections A à F du relevé, tableau des cibles sous 44 px, corrections retenues, et tableau d'exclusion balayage / glisser-déposer.
- Trois constats hors périmètre renvoyés vers #90 et #92.

**Fichiers modifiés** :
- aucun (issue GitHub #89)

**Notes** : l'environnement d'audit a demandé un détour — le `.env` du dépôt pointe la production. Une `.env.local` temporaire (ignorée par git) pointe la stack Supabase locale, dont le Kong écoute en réalité sur **55321** et non 54321 comme l'annonce `supabase status` : les ports ont été décalés pour cohabiter avec d'autres stacks, et le CLI lit `config.toml` plutôt que le conteneur. Le mot de passe du compte de démo a dû être réécrit en base. À nettoyer en fin de story.

### 2026-09-15 : En-tête de matrice — débordement horizontal

**Statut** : Terminé

**Actions réalisées** :
- `.matrix-head` passe en `flex-wrap: wrap`, `.board-switch` gagne `flex: 1 1 auto; min-width: 0`.
- Sous 720 px, le formulaire de renommage d'une matrice prend la ligne entière (`.board-rename`, `.board-rename__input`).

**Fichiers modifiés** :
- `apps/web/src/styles.css`

**Notes** : la cause n'était pas l'absence d'ellipse — `.board-switch__label` la portait déjà — mais le `min-width: auto` implicite des éléments flex, qui empêchait tout parent de rétrécir sous la largeur du texte. Vérifié en émulation : vue globale à 390 px, `document.scrollWidth` passe de **471 à 390**, et le bouton corbeille repasse dans l'écran (x 306-364, deuxième ligne).

### 2026-09-15 : Paire empilée sous 720 px

**Statut** : Terminé

**Actions réalisées** :
- `.card-row` en `flex-direction: column` sous 720 px.
- `.card-row--paired::before` bascule d'un tiret horizontal centré à un tiret vertical de 10 px, `border-left` au lieu de `border-top`, calé à `left: 21px`.

**Fichiers modifiés** :
- `apps/web/src/styles.css`

**Notes** : `21px` = 12 px de rembourrage de carte + 9 px de demi-case à cocher. La mesure donne pour l'instant 42 px parce que la poignée `⠿` est encore là : l'alignement ne sera juste qu'une fois la tâche 6 faite, **à revérifier à ce moment**. `document.scrollWidth` est déjà retombé de 400 à 390.

### 2026-09-15 : Hook `useBalayage`

**Statut** : Terminé

**Actions réalisées** :
- `apps/web/src/data/useBalayage.ts` : câblage Pointer Events (seuil de 10 px, abandon si le geste est plus vertical qu'horizontal, bornage à la largeur du bandeau) et deux fonctions pures exportées, `etatApres` et `borner`.
- `apps/web/src/data/useBalayage.test.ts` : 7 tests, dont le cas « bandeau pas encore mesuré » (`largeur = 0`).

**Fichiers modifiés** :
- `apps/web/src/data/useBalayage.ts` (nouveau)
- `apps/web/src/data/useBalayage.test.ts` (nouveau)

**Notes** : deux pièges traités dès l'écriture. (1) L'avaleur de `click` est posé en phase de **capture sur le conteneur** et non sur `document` : `useTitreDepliable` écoute `.task` en bouillonnement, donc plus tard — sans cette garde, chaque balayage déplierait un titre, son garde-fou `glisse` n'étant armé que par `dragstart`, qui n'arrive jamais au doigt. Un écouteur par carte sur `document` aurait par ailleurs fait trente écouteurs globaux pour une case pleine. (2) La carte est reposée dans `fin()` et pas seulement par l'effet : après un geste avorté l'état ne change pas, l'effet ne rejoue pas, et la carte resterait où le doigt l'a laissée.

### 2026-09-15 : Bandeau d'actions, carte tactile, entrée de menu

**Statut** : Terminé

**Actions réalisées** :
- `TaskCard` : nouvelles props facultatives `swipeOpen` / `onSwipe`, conteneur `.task-swipe` inséré dans `.task-anchor` au-dessus de la seule `.task`, bandeau rendu derrière la carte avec sa largeur calculée (`nb × 44`).
- Les trois commandes (étape, aujourd'hui, échéance) sont construites **une seule fois** et posées soit sur la carte, soit dans le bandeau, selon le seuil.
- `draggable` désarmé sous 720 px ; poignée `⠿` masquée en CSS ; case à cocher et `⋯` gagnent 44 px de zone de frappe par `::after`.
- « Ajouter une étape » ajouté au menu `⋯`, avant « Attacher un lien ».
- `swipeTask` câblé dans les quatre écrans qui rendent une `TaskCard` : Matrix, Global, Focus, Review.

**Fichiers modifiés** :
- `apps/web/src/components/TaskCard.tsx`
- `apps/web/src/data/useBalayage.ts` (ajout de `SEUIL_TELEPHONE`, `LARGEUR_ACTION`, `useTelephone`)
- `apps/web/src/styles.css`
- `apps/web/src/screens/{Matrix,Global,Focus,Review}.tsx`

**Notes** :
- **Un piège d'empilement trouvé en vérifiant.** Le bandeau est positionné (`absolute`), la carte ne l'est pas : par les règles de peinture, le bandeau aurait dû passer **par-dessus** la carte. Il ne le faisait pas — mais seulement parce que `view-transition-name` crée un contexte d'empilement sur `.task` par effet de bord. Un empilement qui ne tient qu'à ça disparaîtrait au premier changement de transition : `position: relative; z-index: 1` sont désormais explicites.
- Les deux raccourcis sont rendus **une fois**, pas deux fois avec un `display: none` : deux boutons de même nom accessible par tâche seraient annoncés tous les deux par un lecteur d'écran.
- Le fanion « aujourd'hui » ne reste pas sur la carte en téléphone : le liseré `.task--today` porte déjà l'information, et un marqueur inerte aurait repris de la largeur au titre.

**Vérifié en émulation (390 px)** : titre lisible (« [AUDIT] Rappeler le plombier au … », « Détartrer la bouilloire » en entier) ; balayage de 110 px → bandeau ouvert, carte à `translateX(-132px)` ; appui ailleurs → refermé ; geste vertical de 40 px → rien ne s'ouvre ; un `click` consécutif au balayage **ne déplie pas** le titre ; l'arbre d'accessibilité n'expose que « Terminer », le titre et « Actions pour … » tant que le bandeau est fermé.

### 2026-09-15 : Cibles tactiles, champs à 16 px, marges de sécurité

**Statut** : Terminé

**Actions réalisées** :
- Un bloc `@media (pointer: coarse)` porte tout ce qui relève du DOIGT : `min-height: 44px` sur les vingt-trois familles de boutons recensées, extension de zone de frappe par `::after` là où grossir déformerait le dessin, et les quatorze déclarations de champ portées à 16 px.
- `.task { min-height: 44px }` : c'est la ligne qui doit faire la hauteur d'une cible, pas seulement ses contrôles — sans elle, la case, le `⋯` et les boutons du bandeau plafonnaient à 39 px.
- `BinModal.tsx` : la case de sélection reçoit un `<label>` de 44 px.
- Marges de sécurité sur `.userbar`, les cinq conteneurs d'écran et `.toast-stack` ; `.auth` passe en `100dvh`.

**Fichiers modifiés** :
- `apps/web/src/styles.css`
- `apps/web/src/components/BinModal.tsx`

**Notes** :
- **La leçon du lot, et elle a resservi deux fois** : la largeur et le pointeur ne mesurent pas la même chose. La case à cocher et le `⋯` d'une carte avaient d'abord été traités dans le bloc `max-width: 720px` — ils restaient donc à 18 px sur iPad, qui a pourtant un doigt. Ils sont passés sous `(pointer: coarse)`. Le projet faisait déjà l'erreur inverse avec `.task__act` sous `(hover: none)`, qui gonflait les icônes de l'iPad sans lui rendre de place.
- Une case à cocher native est un élément **remplacé** : elle n'engendre pas de `::after` et son rembourrage n'agrandit pas sa cible. D'où le `<label>` — la seule solution qui ne déforme pas le dessin.
- `max()` et non une addition pour les insets : sur un écran sans encoche l'inset vaut zéro et additionner ne changerait rien, mais sur un écran qui en a une, additionner doublerait une marge déjà suffisante.
- Le détecteur d'audit signalait `.bin-check` comme « champ sous 16 px » : une case à cocher n'entraîne pas le zoom iOS, qui ne concerne que les champs de saisie de texte. Faux positif du détecteur, pas du code.

### 2026-09-15 : Vérifications

**Statut** : Terminé

**Automatique** :
- `npm run typecheck` — passé (3 workspaces).
- `npm test` — passé : 233 + 34 tests, 5 abstentions préexistantes (`realtime.live.test.ts`, qui demande une stack locale).
- `npm run build` — passé, web + extension.

**Relecture A/B en émulation** :

| | 390 × 844 tactile | 834 × 1112 tactile (iPad) | 1024 × 768 | 1440 × 900 souris |
|---|---|---|---|---|
| `scrollWidth` | 390 | 834 | — | — |
| Cibles sous 44 px | **aucune** | **aucune** | — | — |
| Champs sous 16 px | aucun | aucun | — | — |
| Poignée `⠿` | masquée | visible | visible | visible |
| Bandeau monté | oui | non | non | non |
| Raccourcis sur la carte | non | oui (42) | oui | oui |
| Paire | empilée | côte à côte | côte à côte | côte à côte |
| `draggable` | désarmé | `true` | `true` | `true` |

Huit surfaces passées à 390 px : accueil, matrice, vue globale, aujourd'hui, revue, rétrospective, corbeille, recherche — plus le menu `⋯`. Toutes à `scrollWidth = 390` et sans cible sous 44 px.

Le menu `⋯` mesure désormais 705 px de haut (entrées à 44 px). Vérifié qu'il reste atteignable même ouvert depuis la dernière carte de la page : le document s'étend à sa hauteur (`scrollHeight` 2528, bas du menu 2528).

**Notes** : `prefers-reduced-motion` n'a pas pu être **exercé** — l'outil DevTools disponible ici n'émule que le schéma de couleurs, pas cette caractéristique média. La règle est en place (`.task-swipe > .task { transition: none }` sous `(max-width: 720px) and (prefers-reduced-motion: reduce)`) mais elle n'a pas été jouée dans un navigateur. À vérifier à la main.
