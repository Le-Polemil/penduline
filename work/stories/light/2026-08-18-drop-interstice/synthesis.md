---
story: "Le dépôt d'une matrice s'annule dès qu'on quitte l'interstice"
story_code: "drop-interstice"
created: 2026-08-18
completed: 2026-08-18
status: "Done"
---

# Synthèse

## Résumé

Réordonner une matrice au glisser ne fonctionnait qu'en visant un ruban de 10 px : partout
ailleurs, aucun élément n'acceptait le dépôt, le navigateur annulait le déplacement — et
le trait pointillé continuait pendant ce temps de désigner une destination. L'indicateur
et la zone active n'étaient pas au même endroit.

Le correctif ne déplace pas l'unité de rangement, il élargit la visée : **l'interstice
reste ce qui range, la ligne entière devient ce qu'on vise.** La moitié survolée décide,
et le groupe sert de repli pour ce qui n'est pas une ligne (en-tête d'univers, univers
vide, interstice de fin).

## Changements réalisés

- `gapIndexAt` : la règle de ciblage extraite en fonction pure et testée (5 cas), plutôt
  que noyée dans un gestionnaire d'événement.
- `Home.tsx` : dépôt porté sur la ligne (cible précise, `stopPropagation`) et sur le
  groupe (repli en fin de groupe) ; `onDragLeave` sur la liste pour que l'indicateur ne
  survive pas à la sortie ; `BoardGap` réduit à un repère sans gestionnaire.
- `styles.css` : le soulèvement au survol neutralisé pendant un déplacement — la cible ne
  doit pas bouger au moment où on la vise.

## Fichiers modifiés

- `apps/web/src/dnd/gap.ts` (nouveau)
- `apps/web/src/dnd/gap.test.ts` (nouveau)
- `apps/web/src/screens/Home.tsx`
- `apps/web/src/styles.css`

## Tests et validation

- **Typage** : ✅ `tsc` vert sur `shared`, `extension`, `web`
- **Tests automatiques** : ✅ 95 tests (82 `shared` + 13 `web`)
- **Build** : ✅ les trois paquets
- **Validation manuelle** : ✅ dépôt au milieu d'une ligne, rangement correct

## Notes

**Une seconde panne trouvée en chemin.** Le navigateur **fige** l'état `:hover` pendant un
glisser, et la ligne saisie était forcément survolée au départ. `.board-row:hover`
(spécificité 0,2,0) battait donc `.board-row--dragging` (0,1,0) : l'inclinaison censée
signaler la ligne en cours de déplacement ne s'appliquait jamais. Corrigée ici, puisque
c'est le même retour visuel qui était en cause.

**L'écran matrice n'a pas la même panne.** Le quadrant y attrape le dépôt en repli, et le
survol d'une carte est un troisième geste — l'appairage — avec son propre indicateur. Rien
à aligner ; constat reporté sur #74.

**Reste à trancher, hors périmètre.** Rien n'annonce qu'une ligne de matrice est
saisissable : `.board-card` porte `cursor: pointer` quand `.task` de l'écran matrice porte
`cursor: grab`. Le geste existe depuis #14 et ne se devine pas. À traiter avec la poignée
de glisser prévue pour les univers dans #73, pour que les deux listes s'annoncent pareil.

**Bug signalé pendant la story, ouvert ailleurs.** Des tâches cochées restent affichées à
jamais : `useCompletion` persiste `done: true` tout de suite et `archived: true` seulement
4 s plus tard, alors que `isVisible` n'en masque que la conjonction — et le minuteur est
annulé au démontage de l'écran. Ouvert en #75 (Vague 0).
