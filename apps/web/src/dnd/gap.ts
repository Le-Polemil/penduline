/**
 * Ciblage des interstices de dépôt.
 *
 * Une liste réordonnable se dépose ENTRE ses éléments, mais on ne peut pas
 * demander à l'utilisateur de viser l'espace entre deux lignes : il fait 10 px,
 * et il ne s'ouvre qu'une fois déjà atteint. La cible offerte au curseur est
 * donc la ligne entière, coupée en deux — c'est elle qui désigne l'interstice.
 *
 * La règle vit ici plutôt que dans un gestionnaire d'événement pour être
 * testable sans DOM, comme `planBoardReorder` l'a été pour le clavier.
 * Elle reste dans `apps/web` et non dans `packages/shared` : c'est une décision
 * d'écran, et l'extension n'a pas de liste de matrices à réordonner.
 */

/** Ce qu'on a besoin de savoir d'une ligne : où elle commence, et sa hauteur. */
export interface RowRect {
  top: number;
  height: number;
}

/**
 * L'interstice désigné par un survol de la ligne d'indice `index`.
 *
 * Moitié haute ⇒ l'interstice qui la précède (`index`), moitié basse ⇒ celui qui
 * la suit (`index + 1`). Pile au milieu compte pour la moitié basse : il faut
 * bien trancher, et la comparaison stricte laisse le point médian d'un côté.
 */
export function gapIndexAt(pointerY: number, rect: RowRect, index: number): number {
  return pointerY < rect.top + rect.height / 2 ? index : index + 1;
}

/**
 * Traduit un interstice en `beforeId`, ou reconnaît un déplacement nul.
 *
 * `gapIndexAt` dit *où* on dépose ; les fonctions de position, elles, attendent
 * l'élément **devant lequel** insérer (`null` = à la fin). Ce passage-là est le
 * point où l'on se trompe : les deux interstices qui BORDENT l'élément déplacé —
 * juste au-dessus et juste au-dessous de lui — désignent sa propre place. Les
 * traiter comme un déplacement produirait une écriture réseau pour un ordre
 * identique à l'écran.
 *
 * D'où trois retours distincts, et la nuance entre les deux derniers compte :
 *
 *   'x'    insérer avant `x`
 *   null   insérer à la fin
 *   false  ne rien faire
 *
 * `list` contient l'élément déplacé, à sa place actuelle : c'est la liste
 * affichée, pas une liste déjà amputée. Un élément absent de la liste (déplacé
 * depuis ailleurs) n'a pas de place à border — tous les interstices sont alors
 * de vrais déplacements.
 */
export function dropTarget<T extends { id: string }>(
  list: T[],
  draggedId: string,
  gapIndex: number,
): string | null | false {
  const from = list.findIndex((x) => x.id === draggedId);
  if (from !== -1 && (gapIndex === from || gapIndex === from + 1)) return false;
  return list[gapIndex]?.id ?? null;
}
