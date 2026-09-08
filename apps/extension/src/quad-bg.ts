import type { Quadrant } from '@penduline/shared';

/**
 * Le fond d'une case dans le panneau.
 *
 * « À trier » n'a pas de fond propre : `PARK.bg` vaut `'transparent'`
 * (packages/shared/src/quadrants.ts), parce que sur le web la zone occupe toute
 * la largeur sous la grille et se fond dans la page. Dans le panneau elle est
 * une case comme les autres, il lui faut donc un fond — même repli neutre que
 * celui déjà appliqué au rendu de la corbeille côté web.
 *
 * Module à part et non fonction locale : la tuile (App) et les pastilles du
 * menu ⋯ (TaskMenu) la veulent tous les deux, et faire remonter le menu vers
 * App créerait un import circulaire.
 */
export function quadBg(q: Quadrant): string {
  return q.bg === 'transparent' ? 'var(--color-neutral-200)' : q.bg;
}
