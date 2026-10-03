import { describe, expect, it } from 'vitest';
import { makeTask } from './test-fixtures';
import { GOAL_THRESHOLDS, goalScore, goalTrend, type GoalFact } from './index';

/**
 * Le barème est la seule chose de l'écran que personne ne peut vérifier à l'œil :
 * un score est un nombre, et un nombre faux reste plausible. D'où des cas écrits
 * un par un, et `now` en paramètre — « il y a huit jours » ne se fabrique pas à
 * la main sans déplacer le présent.
 */

const MIDI = Date.parse('2026-10-03T12:00:00.000Z');
const JOUR = 24 * 60 * 60;

/**
 * ⚠️ `makeTask` pose `quadrant_changed_at` au 1ᵉʳ janvier, soit neuf mois avant
 * `MIDI` : une tâche qu'un test veut FRAÎCHE doit le dire explicitement, sinon
 * elle arrive vieille et déclenche les pénalités d'ancienneté.
 */
const FRAIS = new Date(MIDI - 60 * 60 * 1000).toISOString();

function fait(partial: Partial<GoalFact> = {}): GoalFact {
  return {
    quadrant: 'faire',
    deleted: false,
    in_quadrant_seconds: 0,
    on_time: null,
    by_other: false,
    ...partial,
  };
}

/** Les points de PÉRIODE d'une case — ceux qui se comparent d'une fenêtre à l'autre. */
function pointsDe(score: ReturnType<typeof goalScore>, q: string) {
  return score.quadrants.find((x) => x.quadrant === q)!.points;
}
/** Les pénalités d'INSTANT d'une case, tirées des tâches encore ouvertes. */
function instantDe(score: ReturnType<typeof goalScore>, q: string) {
  return score.quadrants.find((x) => x.quadrant === q)!.snapshot;
}
function ligne(score: ReturnType<typeof goalScore>, q: string, key: string) {
  return score.quadrants.find((x) => x.quadrant === q)!.lines.find((l) => l.key === key)!;
}

describe('goalScore — Faire', () => {
  it('récompense ce qui a été traité vite, et pas ce qui a traîné', () => {
    const score = goalScore({
      facts: [
        fait({ in_quadrant_seconds: 2 * JOUR }),
        fait({ in_quadrant_seconds: 40 * JOUR }),
      ],
      now: MIDI,
    });
    expect(ligne(score, 'faire', 'fast').n).toBe(1);
    expect(ligne(score, 'faire', 'slow').n).toBe(1);
    expect(pointsDe(score, 'faire')).toBe(2 + 1);
  });

  it('place la frontière SUR le seuil, pas après', () => {
    const score = goalScore({
      facts: [fait({ in_quadrant_seconds: GOAL_THRESHOLDS.faireDays * JOUR })],
      now: MIDI,
    });
    expect(ligne(score, 'faire', 'fast').n).toBe(1);
  });

  it('retire un point par urgence ouverte dont l’échéance est passée', () => {
    const score = goalScore({
      facts: [],
      open: [
        makeTask({ quadrant: 'faire', due_at: new Date(MIDI - JOUR * 1000).toISOString() }),
        makeTask({ quadrant: 'faire', due_at: new Date(MIDI + JOUR * 1000).toISOString() }),
        makeTask({ quadrant: 'faire' }),
      ],
      now: MIDI,
    });
    // Une pénalité d'instant : elle ne se rattache à aucune période.
    expect(instantDe(score, 'faire')).toBe(-1);
    expect(pointsDe(score, 'faire')).toBe(0);
  });

  it('ne compte pas une date illisible comme un retard', () => {
    const score = goalScore({
      facts: [],
      open: [makeTask({ quadrant: 'faire', due_at: 'pas-une-date' })],
      now: MIDI,
    });
    expect(instantDe(score, 'faire')).toBe(0);
  });
});

describe('goalScore — Planifier', () => {
  it('distingue « datée et tenue », « en retard » et « jamais datée »', () => {
    const score = goalScore({
      facts: [
        fait({ quadrant: 'planifier', on_time: true }),
        fait({ quadrant: 'planifier', on_time: false }),
        fait({ quadrant: 'planifier', on_time: null }),
      ],
      now: MIDI,
    });
    expect(ligne(score, 'planifier', 'on_time').n).toBe(1);
    expect(ligne(score, 'planifier', 'late').n).toBe(1);
    expect(ligne(score, 'planifier', 'no_due').n).toBe(1);
    // La tâche sans date a bien été faite : elle ne coûte rien, elle ne rapporte rien.
    expect(pointsDe(score, 'planifier')).toBe(4 + 1 + 0);
  });
});

describe('goalScore — Déléguer', () => {
  it('note au plus haut la seule délégation constatée', () => {
    const score = goalScore({
      facts: [fait({ quadrant: 'deleguer', by_other: true, in_quadrant_seconds: 90 * JOUR })],
      now: MIDI,
    });
    expect(pointsDe(score, 'deleguer')).toBe(5);
  });

  /* Le point le plus facile à casser du fichier : si `by_other` cessait d'être
     exclusif, une tâche déléguée serait notée DEUX fois — et pénalisée pour le
     temps qu'elle a passé chez son destinataire, qui est ce qu'on voulait. */
  it('n’ajoute pas la durée au bonus : les deux cas sont exclusifs', () => {
    const score = goalScore({
      facts: [fait({ quadrant: 'deleguer', by_other: true, in_quadrant_seconds: 0 })],
      now: MIDI,
    });
    expect(ligne(score, 'deleguer', 'fast').n).toBe(0);
    expect(ligne(score, 'deleguer', 'slow').n).toBe(0);
    expect(pointsDe(score, 'deleguer')).toBe(5);
  });

  it('récompense la passation courte et pas celle qu’on a gardée', () => {
    const score = goalScore({
      facts: [
        fait({ quadrant: 'deleguer', in_quadrant_seconds: JOUR }),
        fait({ quadrant: 'deleguer', in_quadrant_seconds: 30 * JOUR }),
      ],
      now: MIDI,
    });
    expect(pointsDe(score, 'deleguer')).toBe(3 + 1);
  });

  it('retire un point par tâche qui dort dans la case', () => {
    const vieille = new Date(MIDI - 20 * JOUR * 1000).toISOString();
    const score = goalScore({
      facts: [],
      open: [
        makeTask({ quadrant: 'deleguer', quadrant_changed_at: vieille }),
        makeTask({ quadrant: 'deleguer', quadrant_changed_at: FRAIS }),
      ],
      now: MIDI,
    });
    expect(instantDe(score, 'deleguer')).toBe(-1);
  });
});

describe('goalScore — Éliminer', () => {
  it('récompense la disparition et punit la complétion', () => {
    const score = goalScore({
      facts: [
        fait({ quadrant: 'eliminer', deleted: true }),
        fait({ quadrant: 'eliminer', deleted: false }),
      ],
      now: MIDI,
    });
    expect(pointsDe(score, 'eliminer')).toBe(2 - 2);
  });
});

describe('goalScore — À trier', () => {
  /* Il n'y a rien à gagner au parking, et c'est le constat : une tâche bien
     triée en SORT, et se fait noter dans sa nouvelle case. */
  it('ne compte que ce qui y est resté', () => {
    const vieille = new Date(MIDI - 30 * JOUR * 1000).toISOString();
    const score = goalScore({
      facts: [],
      open: [
        makeTask({ quadrant: 'parking', quadrant_changed_at: vieille }),
        makeTask({ quadrant: 'parking', quadrant_changed_at: FRAIS }),
      ],
      now: MIDI,
    });
    expect(instantDe(score, 'parking')).toBe(-1);
    expect(score.quadrants.find((q) => q.quadrant === 'parking')!.lines).toHaveLength(1);
  });
});

describe('goalScore — ce qui ne se mesure pas', () => {
  /* `quadrant_changed_at` n'existe que depuis la revue périodique : avant elle,
     aucune durée. Ces tâches ne doivent pas être notées à zéro en silence. */
  it('compte à part les tâches dont la durée est inconnue, sans les pénaliser', () => {
    const score = goalScore({
      facts: [
        fait({ quadrant: 'faire', in_quadrant_seconds: null }),
        fait({ quadrant: 'deleguer', in_quadrant_seconds: null }),
      ],
      now: MIDI,
    });
    expect(score.unmeasured).toBe(2);
    expect(score.total).toBe(0);
  });

  it('ne compte pas comme non mesurée une case qui ne se juge pas sur la durée', () => {
    const score = goalScore({
      facts: [
        fait({ quadrant: 'planifier', in_quadrant_seconds: null, on_time: true }),
        fait({ quadrant: 'eliminer', in_quadrant_seconds: null, deleted: true }),
        fait({ quadrant: 'deleguer', in_quadrant_seconds: null, by_other: true }),
      ],
      now: MIDI,
    });
    expect(score.unmeasured).toBe(0);
    expect(score.total).toBe(4 + 2 + 5);
  });
});

describe('goalScore — le total', () => {
  it('additionne les cinq cases, pénalités comprises', () => {
    const score = goalScore({
      facts: [
        fait({ quadrant: 'faire', in_quadrant_seconds: JOUR }),
        fait({ quadrant: 'planifier', on_time: true }),
        fait({ quadrant: 'deleguer', by_other: true }),
        fait({ quadrant: 'eliminer', deleted: false }),
      ],
      open: [makeTask({ quadrant: 'parking', quadrant_changed_at: new Date(MIDI - 30 * JOUR * 1000).toISOString() })],
      now: MIDI,
    });
    expect(score.total).toBe(2 + 4 + 5 - 2 - 1);
    // Et le total se décompose : ce qui est daté d'un côté, l'instant de l'autre.
    expect(score.points).toBe(2 + 4 + 5 - 2);
    expect(score.snapshot).toBe(-1);
    expect(score.counted).toBe(4);
  });

  it('écarte les étapes et les tâches supprimées du compte des ouvertes', () => {
    const score = goalScore({
      facts: [],
      open: [
        makeTask({ quadrant: 'parking', parent_id: 'p', quadrant_changed_at: new Date(MIDI - 30 * JOUR * 1000).toISOString() }),
        makeTask({ quadrant: 'parking', deleted: true, quadrant_changed_at: new Date(MIDI - 30 * JOUR * 1000).toISOString() }),
      ],
      now: MIDI,
    });
    expect(score.total).toBe(0);
  });
});

describe('goalTrend', () => {
  it('dit l’écart avec la période précédente, et rien quand il n’y en a pas', () => {
    expect(goalTrend(78, null)).toBeNull();
    expect(goalTrend(78, 64)).toBe('+14 par rapport à la période précédente');
    expect(goalTrend(50, 64)).toBe('−14 par rapport à la période précédente');
    expect(goalTrend(64, 64)).toBe('autant que la période précédente');
  });
});
