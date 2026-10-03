import { describe, expect, it } from 'vitest';
import { HOME, pathToView, viewTitle, viewToPath, type View } from './route';

const VIEWS: View[] = [
  HOME,
  { kind: 'board', id: 'abc-123' },
  { kind: 'global', scope: { kind: 'all' } },
  { kind: 'global', scope: { kind: 'universe', id: 'u-1' } },
  { kind: 'focus' },
  { kind: 'bilan', tab: 'retro' },
  { kind: 'bilan', tab: 'review' },
  { kind: 'bilan', tab: 'goals' },
];

describe('route', () => {
  it('rend la même vue après un aller-retour adresse', () => {
    for (const view of VIEWS) expect(pathToView(viewToPath(view))).toEqual(view);
  });

  it('tolère le slash final', () => {
    expect(pathToView('/bilan/revue/')).toEqual({ kind: 'bilan', tab: 'review' });
    expect(pathToView('/matrice/abc/')).toEqual({ kind: 'board', id: 'abc' });
  });

  /* Une section a une page par défaut, et l'adresse doit finir par dire laquelle
     on regarde : `/bilan` entre, puis `useRoute` la réécrit. */
  it('accepte « /bilan » tout court et l’ouvre sur la rétrospective', () => {
    expect(pathToView('/bilan')).toEqual({ kind: 'bilan', tab: 'retro' });
    expect(viewToPath({ kind: 'bilan', tab: 'retro' })).toBe('/bilan/retrospective');
  });

  /* Elles ont été publiques le temps d'une version : les laisser tomber sur
     l'accueil ferait perdre un favori sans le dire. */
  it('reconnaît encore les deux adresses d’avant le regroupement', () => {
    expect(pathToView('/revue')).toEqual({ kind: 'bilan', tab: 'review' });
    expect(pathToView('/retrospective')).toEqual({ kind: 'bilan', tab: 'retro' });
  });

  it('échappe les identifiants', () => {
    const view: View = { kind: 'board', id: 'a/b c' };
    expect(viewToPath(view)).toBe('/matrice/a%2Fb%20c');
    expect(pathToView(viewToPath(view))).toEqual(view);
  });

  it('ne reconnaît pas les adresses étrangères à l\'application', () => {
    for (const path of ['/inconnu', '/matrice', '/matrice/a/b', '/autoriser', '/invitation']) expect(pathToView(path)).toBeNull();
  });
});

describe('viewTitle', () => {
  it('reprend les libellés de la barre du haut, et le nom de la matrice', () => {
    expect(viewTitle(HOME)).toBe('Matrices');
    expect(viewTitle({ kind: 'board', id: 'x' }, 'Perso')).toBe('Perso');
    expect(viewTitle({ kind: 'board', id: 'x' })).toBeNull();
    expect(viewTitle({ kind: 'focus' })).toBe('Aujourd’hui');
    // La section ET l'onglet : « Bilan » seul ne dirait pas ce qu'on regarde.
    expect(viewTitle({ kind: 'bilan', tab: 'review' })).toBe('Bilan · Revue');
  });
});
