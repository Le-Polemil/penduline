import { describe, expect, it } from 'vitest';
import { pop, push, UNDO_DEPTH, type UndoEntry } from './undo';

const entree = (label: string): UndoEntry => ({ label, inverses: [{ id: label, patch: {} }] });

describe('pile d’annulation', () => {
  it('empile dans l’ordre', () => {
    const p = push(push([], entree('a')), entree('b'));
    expect(p.map((e) => e.label)).toEqual(['a', 'b']);
  });

  it('écarte le plus ancien au-delà de la profondeur', () => {
    // Sinon la pile grossit sans fin, et on finit par annuler des gestes dont
    // plus personne ne se souvient.
    let p: UndoEntry[] = [];
    for (let i = 0; i < UNDO_DEPTH + 5; i++) p = push(p, entree(`g${i}`));
    expect(p).toHaveLength(UNDO_DEPTH);
    expect(p[0].label).toBe('g5');
    expect(p[UNDO_DEPTH - 1].label).toBe(`g${UNDO_DEPTH + 4}`);
  });

  it('dépile la dernière, et rend le reste', () => {
    const p = push(push([], entree('a')), entree('b'));
    const { rest, entry } = pop(p);
    expect(entry?.label).toBe('b');
    expect(rest.map((e) => e.label)).toEqual(['a']);
  });

  it('sur une pile vide, ne rend rien et ne casse rien', () => {
    const { rest, entry } = pop([]);
    expect(entry).toBeNull();
    expect(rest).toEqual([]);
  });

  it('ne modifie jamais la pile reçue', () => {
    // Les deux fonctions servent dans des `setState` : muter l'entrée ferait
    // manquer le re-rendu, React comparant les références.
    const origine = [entree('a')];
    push(origine, entree('b'));
    pop(origine);
    expect(origine.map((e) => e.label)).toEqual(['a']);
  });
});
