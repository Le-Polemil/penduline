import { describe, expect, it } from 'vitest';
import { dropTarget, gapIndexAt } from './gap';

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

describe('dropTarget', () => {
  /** Trois éléments : les interstices vont de 0 (avant `a`) à 3 (après `c`). */
  const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('rend l’élément devant lequel insérer', () => {
    expect(dropTarget(list, 'a', 2)).toBe('c');
    expect(dropTarget(list, 'c', 1)).toBe('b');
  });

  it('rend `null` pour l’interstice de fin', () => {
    expect(dropTarget(list, 'a', 3)).toBeNull();
  });

  it('rend `false` sur les deux interstices qui bordent l’élément déplacé', () => {
    // Le cœur de la règle : déposer un élément juste au-dessus ou juste
    // au-dessous de lui-même le laisse où il est. Sans ce cas, chaque geste
    // avorté produirait une écriture réseau pour un ordre inchangé.
    expect(dropTarget(list, 'b', 1)).toBe(false);
    expect(dropTarget(list, 'b', 2)).toBe(false);
  });

  it('rend `false` aux bornes de la liste', () => {
    expect(dropTarget(list, 'a', 0)).toBe(false);
    expect(dropTarget(list, 'c', 3)).toBe(false);
  });

  it('ne confond pas « à la fin » et « ne rien faire »', () => {
    // `null` et `false` sont tous deux falsy : les distinguer est ce qui
    // sépare « déplacer en dernier » de « geste nul ».
    expect(dropTarget(list, 'a', 3)).toBeNull();
    expect(dropTarget(list, 'c', 3)).toBe(false);
  });

  it('traite tous les interstices comme réels si l’élément n’est pas dans la liste', () => {
    // Cas défensif : rien à border, donc rien à annuler.
    expect(dropTarget(list, 'fantome', 0)).toBe('a');
    expect(dropTarget(list, 'fantome', 3)).toBeNull();
  });

  it('gère la liste vide', () => {
    expect(dropTarget([], 'a', 0)).toBeNull();
  });

  it('gère une liste d’un seul élément : aucun déplacement possible', () => {
    const solo = [{ id: 'a' }];
    expect(dropTarget(solo, 'a', 0)).toBe(false);
    expect(dropTarget(solo, 'a', 1)).toBe(false);
  });
});
