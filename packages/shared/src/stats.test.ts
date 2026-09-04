import { describe, expect, it } from 'vitest';
import { makeBoard } from './test-fixtures';
import {
  parseCompletionStats,
  periodStart,
  SENTENCE_MIN,
  statsReadings,
  statsSentence,
  type CompletionStats,
  type QuadrantKey,
} from './index';

/**
 * Les statistiques échouent de la pire façon : en restant plausibles.
 *
 * Un délai moyen faux de 15 jours au lieu de 1,6 ne ressemble pas à un bug, il
 * ressemble à un chiffre. Une semaine creuse absente de la courbe ne laisse
 * aucune trace. Une part manquante passe pour un arrondi. D'où des tests qui
 * calculent la valeur attendue À LA MAIN plutôt que de la relire du code.
 */

const DAY = 24 * 60 * 60;

/** Un agrégat de case : `n` tâches ayant vécu `days` jours chacune. */
function quad(quadrant: QuadrantKey, n: number, days: number) {
  return { quadrant, completed: n, age_seconds_total: n * days * DAY };
}

function board(board_id: string, quadrant: QuadrantKey, n: number, days: number) {
  return { board_id, quadrant, completed: n, age_seconds_total: n * days * DAY };
}

function stats(partial: Partial<CompletionStats> = {}): CompletionStats {
  return { by_quadrant: [], by_week: [], by_board: [], ...partial };
}

describe('periodStart', () => {
  it('recule de la durée de la période', () => {
    const now = Date.parse('2026-09-02T12:00:00.000Z');
    expect(periodStart('30j', now)).toBe('2026-08-03T12:00:00.000Z');
    expect(periodStart('12m', now)).toBe('2025-09-02T12:00:00.000Z');
  });
});

describe('parseCompletionStats', () => {
  it('lit une réponse bien formée', () => {
    const parsed = parseCompletionStats({
      by_quadrant: [{ quadrant: 'faire', completed: 3, age_seconds_total: 100 }],
      by_week: [{ week: '2026-08-24', quadrant: 'faire', completed: 3 }],
      by_board: [{ board_id: 'b1', quadrant: 'faire', completed: 3, age_seconds_total: 100 }],
    });
    expect(parsed.by_quadrant).toEqual([{ quadrant: 'faire', completed: 3, age_seconds_total: 100 }]);
    expect(parsed.by_week).toHaveLength(1);
    expect(parsed.by_board).toHaveLength(1);
  });

  // Le `jsonb` n'a aucun typage à la frontière : PostgREST le livre en `unknown`,
  // et une évolution du SQL ne casserait ni `tsc` ni le build — seulement l'écran,
  // chez l'utilisateur. Chacun de ces cas doit rendre du vide, jamais lever.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['une chaîne', 'pas un objet'],
    ['un nombre', 42],
    ['un objet vide', {}],
    ['des sections nulles', { by_quadrant: null, by_week: null, by_board: null }],
    ['des sections non tabulaires', { by_quadrant: {}, by_week: 'x', by_board: 7 }],
  ])('rend du vide sur %s, sans lever', (_nom, raw) => {
    const parsed = parseCompletionStats(raw);
    expect(parsed).toEqual({ by_quadrant: [], by_week: [], by_board: [] });
  });

  it('écarte les entrées dont la case est inconnue', () => {
    const parsed = parseCompletionStats({
      by_quadrant: [
        { quadrant: 'faire', completed: 1, age_seconds_total: 0 },
        { quadrant: 'inventée', completed: 99, age_seconds_total: 0 },
        { completed: 5 },
        null,
      ],
    });
    expect(parsed.by_quadrant).toEqual([{ quadrant: 'faire', completed: 1, age_seconds_total: 0 }]);
  });

  // Un agrégat qui devient `null` côté SQL (une somme sur zéro ligne) ne doit pas
  // produire `NaN` : il se propagerait dans toutes les divisions en aval.
  it('remplace un compte illisible par zéro plutôt que par NaN', () => {
    const parsed = parseCompletionStats({
      by_quadrant: [{ quadrant: 'faire', completed: null, age_seconds_total: 'x' }],
    });
    expect(parsed.by_quadrant[0]).toEqual({ quadrant: 'faire', completed: 0, age_seconds_total: 0 });
  });

  it('accepte un nombre livré en chaîne (bigint de PostgREST)', () => {
    // `age_seconds_total` est un `bigint` en SQL, et PostgREST sérialise les
    // bigint en CHAÎNE pour ne pas perdre de précision en JavaScript.
    const parsed = parseCompletionStats({
      by_quadrant: [{ quadrant: 'faire', completed: 2, age_seconds_total: '172800' }],
    });
    expect(parsed.by_quadrant[0].age_seconds_total).toBe(172800);
  });
});

describe('statsReadings', () => {
  it('rend des lectures vides sur un compte neuf', () => {
    const r = statsReadings({ stats: stats(), boards: [] });
    expect(r.total).toBe(0);
    expect(r.avgDays).toBeNull();
    expect(r.weeks).toEqual([]);
    expect(r.boards).toEqual([]);
    // Les cases restent listées, à zéro : une case absente se lirait comme une
    // case qu'on a oublié d'afficher.
    expect(r.byQuadrant).toHaveLength(5);
    expect(r.byQuadrant.every((q) => q.completed === 0 && q.share === 0)).toBe(true);
  });

  describe('le piège de la moyenne de moyennes', () => {
    // LE test qui protège tout le fichier. 100 tâches à 1 jour et 2 tâches à
    // 30 jours :
    //   juste  → (100×1 + 2×30) / 102 = 160/102 ≈ 1,6 j
    //   faux   → (1 + 30) / 2         = 15,5 j
    // Les deux sont plausibles à l'œil, et c'est bien le problème.
    const deuxCases = stats({
      by_quadrant: [quad('faire', 100, 1), quad('planifier', 2, 30)],
    });

    it('divise sur les totaux, pas sur les moyennes', () => {
      const r = statsReadings({ stats: deuxCases, boards: [] });
      expect(r.total).toBe(102);
      expect(r.avgDays).toBeCloseTo(1.6, 5);
      expect(r.avgDays).not.toBeCloseTo(15.5, 1);
    });

    it('applique la même règle matrice par matrice', () => {
      const r = statsReadings({
        stats: stats({
          by_board: [board('b1', 'faire', 100, 1), board('b1', 'planifier', 2, 30)],
        }),
        boards: [makeBoard({ id: 'b1', name: 'Boulot' })],
      });
      expect(r.boards[0].completed).toBe(102);
      expect(r.boards[0].avgDays).toBeCloseTo(1.6, 5);
    });
  });

  describe('parts par case', () => {
    it('calcule des parts qui totalisent 100 %', () => {
      const r = statsReadings({
        stats: stats({
          by_quadrant: [quad('faire', 50, 1), quad('planifier', 25, 10), quad('deleguer', 25, 2)],
        }),
        boards: [],
      });
      const parts = new Map(r.byQuadrant.map((q) => [q.quadrant, q.share]));
      expect(parts.get('faire')).toBe(50);
      expect(parts.get('planifier')).toBe(25);
      expect(parts.get('deleguer')).toBe(25);
      expect(r.byQuadrant.reduce((n, q) => n + q.share, 0)).toBe(100);
    });

    // « À trier » est une case comme les autres pour cette lecture : on peut
    // cocher une tâche sans l'avoir classée. L'omettre la laisserait dans le
    // dénominateur sans jamais l'afficher, et le manque passerait pour un arrondi.
    it('compte « À trier » dans la répartition', () => {
      const r = statsReadings({
        stats: stats({ by_quadrant: [quad('faire', 3, 1), quad('parking', 1, 1)] }),
        boards: [],
      });
      const park = r.byQuadrant.find((q) => q.quadrant === 'parking');
      expect(park?.completed).toBe(1);
      expect(park?.share).toBe(25);
      expect(r.byQuadrant.reduce((n, q) => n + q.share, 0)).toBe(100);
    });

    it('rend un délai nul pour une case sans complétion', () => {
      const r = statsReadings({ stats: stats({ by_quadrant: [quad('faire', 2, 3)] }), boards: [] });
      expect(r.byQuadrant.find((q) => q.quadrant === 'faire')?.avgDays).toBe(3);
      expect(r.byQuadrant.find((q) => q.quadrant === 'eliminer')?.avgDays).toBeNull();
    });
  });

  describe('semaines', () => {
    // La RPC ne rend rien pour une semaine sans complétion — un `group by` ne
    // produit pas de groupe vide. Sans comblement, deux points éloignés d'un mois
    // s'affichent côte à côte et l'inactivité devient invisible.
    it('comble les semaines creuses à zéro', () => {
      const r = statsReadings({
        stats: stats({
          by_week: [
            { week: '2026-08-03', quadrant: 'faire', completed: 4 },
            { week: '2026-08-31', quadrant: 'faire', completed: 2 },
          ],
        }),
        boards: [],
      });
      expect(r.weeks.map((w) => w.week)).toEqual([
        '2026-08-03',
        '2026-08-10',
        '2026-08-17',
        '2026-08-24',
        '2026-08-31',
      ]);
      expect(r.weeks.map((w) => w.total)).toEqual([4, 0, 0, 0, 2]);
    });

    it('additionne les cases d’une même semaine', () => {
      const r = statsReadings({
        stats: stats({
          by_week: [
            { week: '2026-08-31', quadrant: 'faire', completed: 2 },
            { week: '2026-08-31', quadrant: 'planifier', completed: 3 },
          ],
        }),
        boards: [],
      });
      expect(r.weeks).toHaveLength(1);
      expect(r.weeks[0].total).toBe(5);
      expect(r.weeks[0].byQuadrant.faire).toBe(2);
      expect(r.weeks[0].byQuadrant.planifier).toBe(3);
      // Les cinq clés existent, à zéro : un graphique empilé lit toutes les
      // séries, il ne doit pas rencontrer d'`undefined`.
      expect(r.weeks[0].byQuadrant.eliminer).toBe(0);
    });

    it('ne comble rien quand il n’y a aucune semaine', () => {
      expect(statsReadings({ stats: stats(), boards: [] }).weeks).toEqual([]);
    });
  });

  describe('matrices', () => {
    it('trie de la plus productive à la moins productive', () => {
      const r = statsReadings({
        stats: stats({
          by_board: [board('b1', 'faire', 3, 1), board('b2', 'faire', 9, 1)],
        }),
        boards: [makeBoard({ id: 'b1', name: 'Perso' }), makeBoard({ id: 'b2', name: 'Boulot' })],
      });
      expect(r.boards.map((b) => b.name)).toEqual(['Boulot', 'Perso']);
    });

    it('désigne la case dominante de chaque matrice', () => {
      const r = statsReadings({
        stats: stats({
          by_board: [board('b1', 'faire', 2, 1), board('b1', 'planifier', 7, 1)],
        }),
        boards: [makeBoard({ id: 'b1', name: 'Perso' })],
      });
      expect(r.boards[0].dominant).toBe('planifier');
    });

    // Une matrice supprimée depuis un autre appareil garde ses complétions en
    // base mais n'a plus de nom. Afficher son UUID serait pire que la taire.
    it('tait une matrice absente de la liste connue', () => {
      const r = statsReadings({
        stats: stats({ by_board: [board('disparue', 'faire', 5, 1)] }),
        boards: [],
      });
      expect(r.boards).toEqual([]);
    });
  });
});

describe('statsSentence', () => {
  function phrase(by_quadrant: ReturnType<typeof quad>[]): string | null {
    return statsSentence(statsReadings({ stats: stats({ by_quadrant }), boards: [] }));
  }

  // Mieux vaut se taire que généraliser sur trois tâches : une phrase creuse
  // abîme la confiance dans toutes les autres.
  it('se tait en dessous du seuil de matière', () => {
    expect(phrase([quad('faire', SENTENCE_MIN - 1, 1)])).toBeNull();
  });

  it('parle à partir du seuil', () => {
    expect(phrase([quad('faire', SENTENCE_MIN, 1)])).toBeTruthy();
  });

  it('se tait sur un compte vide', () => {
    expect(statsSentence(statsReadings({ stats: stats(), boards: [] }))).toBeNull();
  });

  it('énonce la part de la case dominante', () => {
    const p = phrase([quad('faire', 6, 1), quad('planifier', 4, 1)]);
    expect(p).toContain('60 %');
    expect(p).toContain('Faire');
  });

  it('désigne la case dominante et non la première déclarée', () => {
    const p = phrase([quad('faire', 2, 1), quad('eliminer', 8, 1)]);
    expect(p).toContain('Éliminer');
    expect(p).toContain('80 %');
  });

  // Un « Planifier » lent est le fonctionnement NORMAL de la méthode. Sans cette
  // mention, le chiffre se lit comme un retard et l'écran devient un reproche —
  // ce que le ticket interdit explicitement.
  it('précise que le rythme de « Planifier » est celui attendu', () => {
    const p = phrase([quad('planifier', 10, 20)]);
    expect(p).toContain('20 jours');
    expect(p).toMatch(/rythme attendu/i);
  });

  // Vu sur des données réelles : cinq cases à 20 % chacune produisaient « 20 % de
  // ce que vous avez terminé venait de Faire » — vraie au chiffre, fausse au sens,
  // puisqu'elle désigne une case au hasard parmi cinq égales.
  it('n’affirme aucune dominance quand les cases sont à égalité', () => {
    const p = phrase([
      quad('faire', 10, 1),
      quad('planifier', 10, 1),
      quad('deleguer', 10, 1),
      quad('eliminer', 10, 1),
    ]);
    expect(p).toMatch(/uniformément/i);
    expect(p).not.toMatch(/venait de/);
  });

  it('se tait aussi sur une dominance trop faible', () => {
    // 12 contre 10 : un écart réel, mais pas une dominance (rapport 1,2 < 1,5).
    expect(phrase([quad('faire', 12, 1), quad('planifier', 10, 1)])).toMatch(/uniformément/i);
  });

  it('parle dès que la dominance est franche', () => {
    // 20 contre 10 : rapport 2,0.
    const p = phrase([quad('faire', 20, 1), quad('planifier', 10, 1)]);
    expect(p).toContain('venait de');
    expect(p).toContain('Faire');
  });

  it('parle quand une seule case est active', () => {
    expect(phrase([quad('deleguer', 8, 1)])).toContain('Déléguer');
  });

  // « ont attendu 0 jours en moyenne » n'apprend rien et fait douter du reste.
  // Le cas est courant : la plupart des tâches sont créées et cochées le même jour.
  it('omet le délai quand il est inférieur à un jour', () => {
    const p = phrase([quad('faire', 20, 0.2), quad('planifier', 2, 0.2)]);
    expect(p).not.toMatch(/en moyenne/);
    expect(p).not.toMatch(/0 jour/);
  });

  it('annonce le délai dès qu’il atteint un jour', () => {
    expect(phrase([quad('faire', 20, 3), quad('planifier', 2, 3)])).toMatch(/3 jours en moyenne/);
  });

  it('ne qualifie jamais la personne', () => {
    // Le ticket exige un ton factuel. On vérifie l'absence du registre
    // évaluatif, dont l'exemple du ticket lui-même (« tu éteins des incendies »)
    // était le contre-modèle.
    for (const q of ['faire', 'planifier', 'deleguer', 'eliminer', 'parking'] as QuadrantKey[]) {
      const p = phrase([quad(q, 10, 3)]);
      expect(p).not.toMatch(/incendie|tu |devrais|mauvais|trop de|attention/i);
    }
  });
});
