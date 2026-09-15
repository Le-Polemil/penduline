import { describe, expect, it } from 'vitest';
import { borner, etatApres } from './useBalayage';

/**
 * La règle du geste, testée sans DOM — même partage que `dnd/gap.ts` : le hook
 * ne garde que le câblage Pointer Events, la décision est une fonction pure.
 */
describe('etatApres', () => {
  const L = 132; // trois boutons de 44 px

  it('reste fermé en deçà de la moitié du bandeau', () => {
    expect(etatApres(0, L)).toBe('ferme');
    expect(etatApres(-65, L)).toBe('ferme');
  });

  it('ouvre à partir de la moitié exactement', () => {
    expect(etatApres(-66, L)).toBe('ouvert');
    expect(etatApres(-132, L)).toBe('ouvert');
  });

  /* Un balayage vers la droite referme sans seuil à franchir : c'est le geste
     d'annulation, il doit répondre au premier pixel. */
  it('referme sur un décalage positif, quelle que soit sa distance', () => {
    expect(etatApres(40, L)).toBe('ferme');
  });

  /* Le bandeau est mesuré à l'exécution : avant la première mesure, il vaut
     zéro. Aucun geste ne doit alors ouvrir quoi que ce soit — sans cette garde,
     `-dx >= 0` serait vrai pour tout `dx` négatif ou nul. */
  it('n’ouvre rien tant que le bandeau n’est pas mesuré', () => {
    expect(etatApres(0, 0)).toBe('ferme');
    expect(etatApres(-500, 0)).toBe('ferme');
  });
});

describe('borner', () => {
  const L = 132;

  it('laisse passer le suivi du doigt dans la plage utile', () => {
    expect(borner(-1, L)).toBe(-1);
    expect(borner(-131, L)).toBe(-131);
  });

  /* Au-delà du bandeau la carte se décollerait du bord droit et découvrirait du
     vide : il n'y a rien de plus derrière elle. */
  it('ne découvre jamais plus que la largeur du bandeau', () => {
    expect(borner(-200, L)).toBe(-L);
  });

  /* Et elle ne dépasse jamais sa position de repos vers la droite. */
  it('ne dépasse pas la position de repos', () => {
    expect(borner(50, L)).toBe(0);
  });
});
