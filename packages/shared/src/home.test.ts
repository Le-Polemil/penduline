import { describe, expect, it } from 'vitest';
import { makeBoard, makeTask } from './test-fixtures';
import { dayHeadline, dayLabel, homeSuggestions, quadrantTotals, sinceLabel, snoozeUntil, suggestionKey } from './home';
import { reviewSignals, type BoardStat } from './review';

const NOW = Date.parse('2026-10-02T09:00:00.000Z');
const daysAgo = (d: number) => new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();

describe('quadrantTotals', () => {
  it('compte les tâches ouvertes, pas les étapes, les terminées ni les supprimées', () => {
    const totals = quadrantTotals([
      makeTask({ id: 'a', quadrant: 'faire' }),
      makeTask({ id: 'b', quadrant: 'faire', done: true }),
      makeTask({ id: 'c', quadrant: 'faire', deleted: true }),
      makeTask({ id: 'd', quadrant: 'faire', parent_id: 'a' }),
      makeTask({ id: 'e', quadrant: 'parking' }),
    ]);
    expect(totals).toEqual({ faire: 1, planifier: 0, deleguer: 0, eliminer: 0, parking: 1 });
  });
});

describe('dayHeadline', () => {
  it('dit le compte de « Faire » en toutes lettres', () => {
    expect(dayHeadline([makeTask({ id: 'a', quadrant: 'faire' }), makeTask({ id: 'b', quadrant: 'faire' })]))
      .toBe('Deux choses à faire. Le reste peut attendre.');
  });
  it('a une phrase à lui pour zéro, et des chiffres au-delà de dix', () => {
    expect(dayHeadline([makeTask({ quadrant: 'planifier' })])).toBe('Rien d’urgent. Le reste peut attendre.');
    const many = Array.from({ length: 12 }, (_, i) => makeTask({ id: `t${i}`, quadrant: 'faire' }));
    expect(dayHeadline(many)).toBe('12 choses à faire. Le reste peut attendre.');
  });
});

describe('dayLabel', () => {
  it('rend la date en français, majuscule initiale', () => {
    expect(dayLabel(Date.parse('2026-10-02T12:00:00'))).toBe('Vendredi 2 octobre');
  });
});

describe('sinceLabel', () => {
  it('passe des jours aux semaines puis aux mois', () => {
    expect(sinceLabel(1)).toBe('hier');
    expect(sinceLabel(9)).toBe('9 jours');
    expect(sinceLabel(21)).toBe('3 semaines');
    expect(sinceLabel(90)).toBe('3 mois');
    expect(sinceLabel(null)).toBe('');
  });
});

describe('homeSuggestions', () => {
  const board = makeBoard({ id: 'b1' });
  const stats: BoardStat[] = [{ board_id: 'b1', last_activity: daysAgo(0), eliminer_open: 0, eliminer_last_cleared: daysAgo(0) }];
  const tasks = [
    makeTask({ id: 'doing1', board_id: 'b1', quadrant: 'faire', quadrant_changed_at: daysAgo(9) }),
    makeTask({ id: 'doing2', board_id: 'b1', quadrant: 'faire', quadrant_changed_at: daysAgo(8) }),
    makeTask({ id: 'park', board_id: 'b1', quadrant: 'parking', created_at: daysAgo(20) }),
    makeTask({ id: 'old', board_id: 'b1', quadrant: 'planifier', quadrant_changed_at: daysAgo(40) }),
  ];
  const signals = reviewSignals({ tasks, boards: [board], stats, now: NOW });

  it('alterne les signaux plutôt que de vider le premier', () => {
    const s = homeSuggestions({ signals, now: NOW, limit: 3 });
    expect(s.map((x) => x.key)).toEqual(['doing:doing1', 'parking:park', 'neverMoved:old']);
  });

  it('porte l’ancienneté en jours pleins', () => {
    const [first] = homeSuggestions({ signals, now: NOW, limit: 1 });
    expect(first.days).toBe(9);
  });

  it('tait une suggestion mise en sommeil, jusqu’à son échéance seulement', () => {
    const snoozed = { [suggestionKey('doing', 'doing1')]: snoozeUntil(NOW, 30) };
    expect(homeSuggestions({ signals, snoozed, now: NOW, limit: 1 })[0].key).toBe('doing:doing2');
    const later = NOW + 31 * 24 * 60 * 60 * 1000;
    expect(homeSuggestions({ signals, snoozed, now: later, limit: 1 })[0].key).toBe('doing:doing1');
  });

  it('ne montre qu’une ligne par tâche, même si deux signaux la portent', () => {
    // Quarante jours dans « Faire » : à la fois une urgence qui dure ET jamais reclassée.
    const both = [makeTask({ id: 'x', board_id: 'b1', quadrant: 'faire', quadrant_changed_at: daysAgo(40) })];
    const s = homeSuggestions({ signals: reviewSignals({ tasks: both, boards: [board], stats, now: NOW }), now: NOW });
    expect(s.map((x) => x.key)).toEqual(['doing:x']);
  });
});
