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
