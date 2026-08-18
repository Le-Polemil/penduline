---
story: "Le dépôt d'une matrice s'annule dès qu'on quitte l'interstice"
story_code: "drop-interstice"
created: 2026-08-18
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Extraire la règle de ciblage (`apps/web/src/dnd/gap.ts`) et la tester | Terminé | 2026-08-18 |
| 2. Déplacer le dépôt du ruban vers la ligne et le groupe (`Home.tsx`) | Terminé | 2026-08-18 |
| 3. Stabiliser la géométrie pendant un déplacement (`styles.css`) | Terminé | 2026-08-18 |
| 4. Écran matrice : vérifier l'écart et reporter le constat sur #74 | Terminé | 2026-08-18 |
| 5. Qualité : `npm run typecheck` + `npm run test` | Terminé | 2026-08-18 |
| 6. Validation manuelle (plan de test du plan.md) | En attente | |

## Journal

### 2026-08-18 : Extraire la règle de ciblage et la tester

**Statut** : Terminé

**Actions réalisées** :
- Créé `gapIndexAt(pointerY, rect, index)` : moitié haute ⇒ interstice `index`, moitié
  basse ⇒ `index + 1`, point médian tranché vers le bas.
- Cinq cas de test : moitié haute, moitié basse, point médian, décalage selon l'indice de
  la ligne, et hauteur nulle (ligne en cours de rendu).
- `npm run test -w @penduline/web` : 2 fichiers, 13 tests verts.

**Fichiers modifiés** :
- `apps/web/src/dnd/gap.ts` (nouveau)
- `apps/web/src/dnd/gap.test.ts` (nouveau)

**Notes** : la règle reste dans `apps/web` et non dans `packages/shared` — l'extension n'a
pas de liste de matrices à réordonner, et `Global.tsx` pose déjà le principe que les
décisions d'écran ne remontent pas dans les fonctions partagées. Le cas de la hauteur
nulle a été ajouté après coup : `rect.height / 2` sur une ligne non encore mesurée doit
rendre un indice utilisable, pas un `NaN` silencieux.

### 2026-08-18 : Déplacer le dépôt du ruban vers la ligne

**Statut** : Terminé

**Actions réalisées** :
- `onDragOver` / `onDrop` portés sur le `<div>` qui enveloppe interstice + ligne, avec
  `stopPropagation()` et résolution par `gapIndexAt`, puis
  `dropAt(universeId, group.boards[at]?.id ?? null)`.
- Mêmes gestionnaires en repli sur `<section class="uni">`, résolus en fin de groupe :
  c'est ce qui rend l'en-tête d'univers et un groupe vide déposables.
- `onDragLeave` sur `.board-list`, gardé par `contains(relatedTarget)`, pour effacer
  l'indicateur quand on quitte vraiment la liste.
- `BoardGap` réduit à `active` : plus aucun gestionnaire, il n'est qu'un repère.
- `npm run typecheck` vert sur les trois workspaces.

**Fichiers modifiés** :
- `apps/web/src/screens/Home.tsx`

**Notes** : le dépôt sur soi-même reste neutralisé sans code supplémentaire — `moveBoard`
sort déjà sur `id === beforeId` (`store.ts:104`). L'ordre des deux niveaux de dépôt tient
au `stopPropagation()` de la ligne : sans lui, le repli du groupe écraserait l'indice
précis en fin de groupe.

### 2026-08-18 : Stabiliser la géométrie pendant un déplacement

**Statut** : Terminé

**Actions réalisées** :
- `.board-list--dragging` posé tant qu'un déplacement est en cours.
- Le soulèvement `:hover` est neutralisé pendant un déplacement, sauf sur la ligne saisie.
- `transform: rotate(-1deg) scale(1.01)` sorti de `.board-row--dragging` vers
  `.board-row.board-row--dragging`, placé après `:hover`.

**Fichiers modifiés** :
- `apps/web/src/styles.css`

**Notes** : découverte au passage — le navigateur **fige** l'état `:hover` pendant un
glisser, et la ligne saisie était forcément survolée au départ. `.board-row:hover`
(spécificité 0,2,0) battait donc `.board-row--dragging` (0,1,0) : l'inclinaison qui
signale la ligne en cours de déplacement ne s'appliquait jamais. Corrigé en même temps,
puisque c'est le même retour visuel qui était en cause.

### 2026-08-18 : Écran matrice — vérifié, aucun correctif

**Statut** : Terminé

**Actions réalisées** :
- Relecture du modèle de dépôt de `Matrix.tsx` et du contrat `split` de `TaskCard`.
- Constat reporté en commentaire sur #74.

**Fichiers modifiés** : aucun.

**Notes** : ce n'est pas la même panne. Le quadrant attrape le dépôt en repli
(`Matrix.tsx:413-424`), donc rien n'annule ; et le survol d'une carte n'est pas un raté de
visée mais un troisième geste — l'appairage (`split.over` / `split.drop`,
`Matrix.tsx:280-283`), avec son propre indicateur. L'indicateur y dit donc déjà la vérité.
Reste le ruban étroit de `.row-gap` (8 px) : confort de visée, à ouvrir séparément.

### 2026-08-18 : Vérifications qualité

**Statut** : Terminé

**Actions réalisées** :
- `npm run typecheck` : vert sur `shared`, `extension` et `web`.
- `npm run test` : 95 tests verts (82 `shared` + 13 `web`).
- `npm run build` : les trois paquets se construisent.

**Notes** : pas de linter dans ce dépôt — la qualité tient à `tsc`, aux tests et au build.

### 2026-08-18 : Bug signalé en cours de story — hors périmètre

**Statut** : Reporté en ticket

**Notes** : signalé par l'utilisateur pendant le développement — des tâches cochées
restent affichées à jamais. Cause identifiée à la lecture : `useCompletion` persiste
`done: true` tout de suite et `archived: true` seulement 4 s plus tard, alors que
`isVisible` n'en masque que la conjonction ; le minuteur est annulé au démontage de
l'écran (`useCompletion.ts:24`), donc revenir à l'accueil ou recharger fige la tâche dans
un état intermédiaire persisté. Ouvert en #75 (Vague 0), non traité ici : sans rapport
avec le glisser-déposer, et son correctif touche l'écriture, pas la vue.
