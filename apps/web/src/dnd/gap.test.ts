import { describe, expect, it } from 'vitest';
import { gapIndexAt } from './gap';

/**
 * Le bug corrigé par cette règle était invisible au typage comme aux tests : le
 * dépôt fonctionnait, mais seulement sur une bande de 10 px, et échouait partout
 * ailleurs. Ce qui se vérifie ici est le contrat d'usage — la ligne entière est
 * une cible, et sa moitié décide de l'interstice.
 */

/** Une ligne de 60 px commençant à 100 : milieu à 130. */
const row = { top: 100, height: 60 };

describe('gapIndexAt', () => {
  it('désigne l’interstice précédent depuis la moitié haute', () => {
    expect(gapIndexAt(100, row, 3)).toBe(3);
    expect(gapIndexAt(129, row, 3)).toBe(3);
  });

  it('désigne l’interstice suivant depuis la moitié basse', () => {
    expect(gapIndexAt(131, row, 3)).toBe(4);
    expect(gapIndexAt(160, row, 3)).toBe(4);
  });

  it('tranche le point médian vers l’interstice suivant', () => {
    expect(gapIndexAt(130, row, 3)).toBe(4);
  });

  it('se décale avec l’indice de la ligne survolée', () => {
    expect(gapIndexAt(100, row, 0)).toBe(0);
    expect(gapIndexAt(160, row, 0)).toBe(1);
  });

  // Une ligne en cours de rendu peut être mesurée à zéro : la règle doit rendre
  // un indice utilisable plutôt que de dépendre d'une division par une hauteur
  // nulle. Le survol y compte comme une moitié basse — pas comme une erreur.
  it('reste défini sur une ligne de hauteur nulle', () => {
    expect(gapIndexAt(100, { top: 100, height: 0 }, 2)).toBe(3);
  });
});
