import { describe, expect, it } from 'vitest';
import { HOME, pathToView, viewTitle, viewToPath, type View } from './route';

const VIEWS: View[] = [
  HOME,
  { kind: 'board', id: 'abc-123' },
  { kind: 'global', scope: { kind: 'all' } },
  { kind: 'global', scope: { kind: 'universe', id: 'u-1' } },
  { kind: 'focus' },
  { kind: 'review' },
  { kind: 'stats' },
];

describe('route', () => {
  it('rend la même vue après un aller-retour adresse', () => {
    for (const view of VIEWS) expect(pathToView(viewToPath(view))).toEqual(view);
  });

  it('tolère le slash final', () => {
    expect(pathToView('/revue/')).toEqual({ kind: 'review' });
    expect(pathToView('/matrice/abc/')).toEqual({ kind: 'board', id: 'abc' });
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
  });
});
