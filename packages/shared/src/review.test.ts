import { describe, expect, it } from 'vitest';
import { makeBoard, makeTask } from './test-fixtures';
import {
  ageInDays,
  DEFAULT_THRESHOLDS,
  reviewSignals,
  signalCount,
  type BoardStat,
  type ReviewSignal,
  type ReviewSignalKey,
} from './review';

/**
 * La revue est du calcul de dates sur des seuils : elle échoue en silence.
 * Un signal qui ne remonte rien ressemble exactement à un signal satisfait —
 * « rien ne traîne au parking » et « le filtre est cassé » s'affichent pareil.
 * D'où des tests qui vérifient les DEUX sens à chaque fois : ce qui doit sortir,
 * et ce qui doit rester.
 */

/** Le présent des tests. Fixe, pour que « il y a 40 jours » veuille dire quelque chose. */
const NOW = Date.parse('2026-09-01T12:00:00.000Z');

/** Un horodatage ISO à `days` jours dans le passé (négatif = futur). */
function daysAgo(days: number): string {
  return new Date(NOW - days * 24 * 60 * 60 * 1000).toISOString();
}

function stat(partial: Partial<BoardStat> & { board_id: string }): BoardStat {
  return {
    last_activity: daysAgo(0),
    eliminer_open: 0,
    eliminer_last_cleared: daysAgo(0),
    ...partial,
  };
}

function signal(signals: ReviewSignal[], key: ReviewSignalKey): ReviewSignal {
  const found = signals.find((s) => s.key === key);
  if (!found) throw new Error(`signal ${key} absent`);
  return found;
}

function taskIds(signals: ReviewSignal[], key: ReviewSignalKey): string[] {
  const s = signal(signals, key);
  if (s.kind !== 'tasks') throw new Error(`${key} n'est pas un signal de tâches`);
  return s.tasks.map((t) => t.id);
}

function boardIds(signals: ReviewSignal[], key: ReviewSignalKey): string[] {
  const s = signal(signals, key);
  if (s.kind !== 'boards') throw new Error(`${key} n'est pas un signal de matrices`);
  return s.boards.map((b) => b.id);
}

/** Le cas courant : on ne passe que ce que le test fait varier. */
function run(input: { tasks?: ReturnType<typeof makeTask>[]; boards?: ReturnType<typeof makeBoard>[]; stats?: BoardStat[] }) {
  return reviewSignals({
    tasks: input.tasks ?? [],
    boards: input.boards ?? [],
    stats: input.stats ?? [],
    now: NOW,
  });
}

describe('ageInDays', () => {
  it('mesure un âge en jours', () => {
    expect(ageInDays(daysAgo(30), NOW)).toBeCloseTo(30, 6);
  });

  // `NaN >= seuil` valant `false`, une date illisible ferait disparaître la tâche
  // du signal SANS erreur. Le `null` explicite est ce qui rend le cas visible.
  it('rend null sur une date illisible plutôt que NaN', () => {
    expect(ageInDays('pas une date', NOW)).toBeNull();
    expect(ageInDays(null, NOW)).toBeNull();
  });

  // Horloge remise à l'heure : l'âge devient négatif et aucun seuil positif ne
  // peut être franchi. La revue ne doit pas se remplir pour cette raison.
  it('rend un âge négatif pour une date future', () => {
    expect(ageInDays(daysAgo(-5), NOW)).toBeCloseTo(-5, 6);
  });
});

describe('reviewSignals', () => {
  it('rend toujours les cinq signaux, même sur un compte vide', () => {
    const signals = run({});
    expect(signals.map((s) => s.key)).toEqual([
      'parking',
      'neverMoved',
      'doing',
      'dormant',
      'eliminer',
    ]);
    // Un compte neuf ne doit pas produire un écran vide, mais cinq signaux
    // satisfaits, chacun avec sa phrase.
    expect(signals.every((s) => signalCount(s) === 0)).toBe(true);
    expect(signals.every((s) => s.empty.length > 0)).toBe(true);
  });

  describe('1 — à trier depuis trop longtemps', () => {
    it('retient les tâches du parking plus vieilles que le seuil', () => {
      const tasks = [
        makeTask({ id: 'vieille', quadrant: 'parking', created_at: daysAgo(30) }),
        makeTask({ id: 'recente', quadrant: 'parking', created_at: daysAgo(3) }),
        makeTask({ id: 'ailleurs', quadrant: 'faire', created_at: daysAgo(30) }),
      ];
      expect(taskIds(run({ tasks }), 'parking')).toEqual(['vieille']);
    });

    it('trie du plus ancien au plus récent', () => {
      const tasks = [
        makeTask({ id: 'moyenne', quadrant: 'parking', created_at: daysAgo(20) }),
        makeTask({ id: 'antique', quadrant: 'parking', created_at: daysAgo(90) }),
        makeTask({ id: 'limite', quadrant: 'parking', created_at: daysAgo(15) }),
      ];
      expect(taskIds(run({ tasks }), 'parking')).toEqual(['antique', 'moyenne', 'limite']);
    });

    // Le seuil est inclusif. Sans ce test, un décalage d'un jour passerait
    // inaperçu — c'est le genre d'écart qu'on ne voit jamais à l'œil.
    it('inclut une tâche pile sur le seuil', () => {
      const tasks = [
        makeTask({ id: 'pile', quadrant: 'parking', created_at: daysAgo(DEFAULT_THRESHOLDS.parkingDays) }),
        makeTask({ id: 'juste-avant', quadrant: 'parking', created_at: daysAgo(DEFAULT_THRESHOLDS.parkingDays - 0.5) }),
      ];
      expect(taskIds(run({ tasks }), 'parking')).toEqual(['pile']);
    });

    it("ignore l'âge du dernier changement de case", () => {
      // Déposée il y a 30 jours, « touchée » hier : elle est toujours au parking,
      // donc toujours non triée.
      const tasks = [
        makeTask({ id: 'toujours-la', quadrant: 'parking', created_at: daysAgo(30), quadrant_changed_at: daysAgo(1) }),
      ];
      expect(taskIds(run({ tasks }), 'parking')).toEqual(['toujours-la']);
    });
  });

  describe('2 — jamais reclassées', () => {
    it('retient les tâches dont la case ne bouge plus', () => {
      const tasks = [
        makeTask({ id: 'dort', quadrant: 'planifier', quadrant_changed_at: daysAgo(40) }),
        makeTask({ id: 'revue', quadrant: 'planifier', quadrant_changed_at: daysAgo(5) }),
      ];
      expect(taskIds(run({ tasks }), 'neverMoved')).toEqual(['dort']);
    });

    // C'est LE point de la migration : `updated_at` ne doit jouer aucun rôle.
    // Une tâche renommée hier mais jamais déplacée doit rester signalée.
    it('ne se laisse pas désarmer par un simple renommage', () => {
      const tasks = [
        makeTask({
          id: 'renommee-hier',
          quadrant: 'planifier',
          created_at: daysAgo(60),
          updated_at: daysAgo(1),
          quadrant_changed_at: daysAgo(60),
        }),
      ];
      expect(taskIds(run({ tasks }), 'neverMoved')).toEqual(['renommee-hier']);
    });

    // Le pendant du test précédent : déplacée récemment, elle sort du signal
    // même si elle est ancienne.
    it('exclut une tâche réellement reclassée récemment', () => {
      const tasks = [
        makeTask({ id: 'deplacee', quadrant: 'planifier', created_at: daysAgo(90), quadrant_changed_at: daysAgo(2) }),
      ];
      expect(taskIds(run({ tasks }), 'neverMoved')).toEqual([]);
    });

    // Seule dérogation assumée à la non-partition : une tâche du parking jamais
    // reclassée EST le signal 1, l'y compter deux fois serait du bruit.
    it('exclut le parking, qui est déjà le signal 1', () => {
      const tasks = [makeTask({ id: 'au-parking', quadrant: 'parking', quadrant_changed_at: daysAgo(60) })];
      const signals = run({ tasks });
      expect(taskIds(signals, 'neverMoved')).toEqual([]);
      expect(taskIds(signals, 'parking')).toEqual(['au-parking']);
    });

    it('porte une réserve sur la nouveauté de la mesure', () => {
      expect(signal(run({}), 'neverMoved').note).toMatch(/suivi des déplacements/i);
    });
  });

  describe('3 — dans « Faire » depuis trop longtemps', () => {
    it('retient les tâches arrivées dans Faire il y a longtemps', () => {
      const tasks = [
        makeTask({ id: 'eternelle', quadrant: 'faire', quadrant_changed_at: daysAgo(20) }),
        makeTask({ id: 'fraiche', quadrant: 'faire', quadrant_changed_at: daysAgo(2) }),
        makeTask({ id: 'autre-case', quadrant: 'deleguer', quadrant_changed_at: daysAgo(20) }),
      ];
      expect(taskIds(run({ tasks }), 'doing')).toEqual(['eternelle']);
    });

    // Une vieille tâche promue urgente hier n'est pas une fausse urgence : elle
    // vient d'être décidée. C'est `quadrant_changed_at` qui le sait, pas `created_at`.
    it("mesure l'arrivée dans la case, pas l'âge de la tâche", () => {
      const tasks = [
        makeTask({ id: 'promue-hier', quadrant: 'faire', created_at: daysAgo(200), quadrant_changed_at: daysAgo(1) }),
      ];
      expect(taskIds(run({ tasks }), 'doing')).toEqual([]);
    });
  });

  describe('recoupements entre signaux', () => {
    // La non-partition est un parti pris du module : ce test la verrouille, pour
    // qu'une « déduplication » bien intentionnée casse un test au lieu du produit.
    it('une tâche coincée dans Faire depuis 40 jours apparaît dans DEUX signaux', () => {
      const tasks = [makeTask({ id: 'coincee', quadrant: 'faire', quadrant_changed_at: daysAgo(40) })];
      const signals = run({ tasks });
      expect(taskIds(signals, 'doing')).toEqual(['coincee']);
      expect(taskIds(signals, 'neverMoved')).toEqual(['coincee']);
    });
  });

  describe('lignes qui ne sont pas des lignes de revue', () => {
    it('exclut les terminées, les supprimées et les étapes', () => {
      const vieux = { quadrant_changed_at: daysAgo(60), created_at: daysAgo(60) } as const;
      const tasks = [
        makeTask({ id: 'terminee', quadrant: 'planifier', done: true, ...vieux }),
        makeTask({ id: 'supprimee', quadrant: 'planifier', deleted: true, ...vieux }),
        makeTask({ id: 'etape', quadrant: 'planifier', parent_id: 'parent', ...vieux }),
        makeTask({ id: 'gardee', quadrant: 'planifier', ...vieux }),
      ];
      expect(taskIds(run({ tasks }), 'neverMoved')).toEqual(['gardee']);
    });

    it('exclut aussi les étapes du parking', () => {
      const tasks = [
        makeTask({ id: 'etape-parking', quadrant: 'parking', parent_id: 'p', created_at: daysAgo(60) }),
      ];
      expect(taskIds(run({ tasks }), 'parking')).toEqual([]);
    });
  });

  describe('4 — matrices sans activité', () => {
    it('retient les matrices silencieuses depuis plus que le seuil', () => {
      const dormante = makeBoard({ id: 'dormante' });
      const vivante = makeBoard({ id: 'vivante' });
      const signals = run({
        boards: [dormante, vivante],
        stats: [
          stat({ board_id: 'dormante', last_activity: daysAgo(40) }),
          stat({ board_id: 'vivante', last_activity: daysAgo(1) }),
        ],
      });
      expect(boardIds(signals, 'dormant')).toEqual(['dormante']);
    });

    // Le cas que la RPC existe pour couvrir : tout vient d'être terminé, donc
    // rien n'est en mémoire côté client. La matrice est très vivante.
    it('ne signale pas une matrice dont tout vient d’être terminé', () => {
      const board = makeBoard({ id: 'tout-fait' });
      const signals = run({
        boards: [board],
        // Aucune tâche ouverte en mémoire, mais la RPC voit l'activité récente.
        tasks: [],
        stats: [stat({ board_id: 'tout-fait', last_activity: daysAgo(1) })],
      });
      expect(boardIds(signals, 'dormant')).toEqual([]);
    });

    // Une matrice vide n'a pas de ligne dans `stats` (le `group by` ne produit
    // rien). Vide n'est pas dormant : reprocher à quelqu'un de ne pas avoir
    // rempli la matrice qu'il vient de créer serait exactement le ton interdit.
    it('ne signale pas une matrice sans aucune tâche', () => {
      const signals = run({ boards: [makeBoard({ id: 'neuve' })], stats: [] });
      expect(boardIds(signals, 'dormant')).toEqual([]);
    });

    it('trie de la plus silencieuse à la moins silencieuse', () => {
      const signals = run({
        boards: [makeBoard({ id: 'b1' }), makeBoard({ id: 'b2' }), makeBoard({ id: 'b3' })],
        stats: [
          stat({ board_id: 'b1', last_activity: daysAgo(30) }),
          stat({ board_id: 'b2', last_activity: daysAgo(90) }),
          stat({ board_id: 'b3', last_activity: daysAgo(60) }),
        ],
      });
      expect(boardIds(signals, 'dormant')).toEqual(['b2', 'b3', 'b1']);
    });
  });

  describe('5 — « Éliminer » qui ne se vide pas', () => {
    it('retient une case chargée dont rien ne sort depuis longtemps', () => {
      const signals = run({
        boards: [makeBoard({ id: 'bouchee' })],
        stats: [stat({ board_id: 'bouchee', eliminer_open: 5, eliminer_last_cleared: daysAgo(60) })],
      });
      expect(boardIds(signals, 'eliminer')).toEqual(['bouchee']);
    });

    // `null` = jamais rien n'en est sorti : c'est le cas le plus net du signal,
    // pas une absence de donnée à ignorer.
    it('retient une case dont rien n’est JAMAIS sorti', () => {
      const signals = run({
        boards: [makeBoard({ id: 'jamais' })],
        stats: [stat({ board_id: 'jamais', eliminer_open: 4, eliminer_last_cleared: null })],
      });
      expect(boardIds(signals, 'eliminer')).toEqual(['jamais']);
    });

    it('ignore une case peu chargée, même si rien n’en sort', () => {
      const signals = run({
        boards: [makeBoard({ id: 'presque-vide' })],
        stats: [
          stat({
            board_id: 'presque-vide',
            eliminer_open: DEFAULT_THRESHOLDS.eliminerMin - 1,
            eliminer_last_cleared: null,
          }),
        ],
      });
      expect(boardIds(signals, 'eliminer')).toEqual([]);
    });

    it('ignore une case chargée mais qui se vide', () => {
      const signals = run({
        boards: [makeBoard({ id: 'active' })],
        stats: [stat({ board_id: 'active', eliminer_open: 9, eliminer_last_cleared: daysAgo(2) })],
      });
      expect(boardIds(signals, 'eliminer')).toEqual([]);
    });

    it('trie de la plus chargée à la moins chargée', () => {
      const signals = run({
        boards: [makeBoard({ id: 'b1' }), makeBoard({ id: 'b2' })],
        stats: [
          stat({ board_id: 'b1', eliminer_open: 4, eliminer_last_cleared: null }),
          stat({ board_id: 'b2', eliminer_open: 12, eliminer_last_cleared: null }),
        ],
      });
      expect(boardIds(signals, 'eliminer')).toEqual(['b2', 'b1']);
    });
  });

  describe('seuils réglables', () => {
    it('un seuil abaissé allonge la liste', () => {
      const tasks = [makeTask({ id: 't', quadrant: 'parking', created_at: daysAgo(5) })];
      const strict = reviewSignals({ tasks, boards: [], stats: [], now: NOW });
      const laxe = reviewSignals({
        tasks,
        boards: [],
        stats: [],
        now: NOW,
        thresholds: { ...DEFAULT_THRESHOLDS, parkingDays: 3 },
      });
      expect(taskIds(strict, 'parking')).toEqual([]);
      expect(taskIds(laxe, 'parking')).toEqual(['t']);
    });

    it('les libellés reprennent le seuil en vigueur', () => {
      const signals = reviewSignals({
        tasks: [],
        boards: [],
        stats: [],
        now: NOW,
        thresholds: { ...DEFAULT_THRESHOLDS, doingDays: 3 },
      });
      expect(signal(signals, 'doing').label).toContain('3 jours');
    });
  });

  describe('données abîmées', () => {
    // Un horodatage illisible ne doit pas faire tomber l'écran entier. Il exclut
    // sa tâche du signal, et rien de plus.
    it('ignore une tâche à l’horodatage illisible sans lever', () => {
      const tasks = [
        makeTask({ id: 'cassee', quadrant: 'parking', created_at: 'pas une date' }),
        makeTask({ id: 'saine', quadrant: 'parking', created_at: daysAgo(30) }),
      ];
      expect(taskIds(run({ tasks }), 'parking')).toEqual(['saine']);
    });

    // Une matrice présente dans `stats` mais absente de `boards` (supprimée
    // depuis un autre appareil) ne doit pas apparaître dans la revue.
    it('ignore une statistique orpheline', () => {
      const signals = run({
        boards: [],
        stats: [stat({ board_id: 'disparue', last_activity: daysAgo(90), eliminer_open: 9, eliminer_last_cleared: null })],
      });
      expect(boardIds(signals, 'dormant')).toEqual([]);
      expect(boardIds(signals, 'eliminer')).toEqual([]);
    });
  });
});
