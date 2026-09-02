import { describe, expect, it } from 'vitest';
import { makeTask } from './test-fixtures';
import {
  FOCUS_DEFAULT,
  focusBilan,
  focusDayLabel,
  focusRefusal,
  focusRemaining,
  focusToday,
  localDay,
  localDayBefore,
} from './index';

/**
 * Le cœur de ce ticket est un changement de jour, et c'est la seule chose qu'un
 * test manuel ne peut pas provoquer : on ne va pas attendre demain pour savoir
 * si la sélection se vide. D'où le jour en paramètre partout, et des tests qui
 * font passer minuit sans toucher à l'horloge.
 */

const AUJOURDHUI = '2026-09-07'; // un lundi
const HIER = '2026-09-06'; // dimanche
const VENDREDI = '2026-09-04';

function choisie(id: string, day: string | null, partial: Parameters<typeof makeTask>[0] = {}) {
  return makeTask({ id, focus_day: day, ...partial });
}

describe('localDay', () => {
  it('rend le jour au format YYYY-MM-DD', () => {
    expect(localDay(Date.parse('2026-09-07T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // Le piège que `toISOString().slice(0, 10)` aurait introduit : à Paris, tout ce
  // qui est fait après 22 h serait attribué au lendemain, et la sélection du soir
  // se viderait sous les doigts de l'utilisateur.
  it('suit le jour LOCAL et non le jour UTC', () => {
    // 21 h 30 UTC le 7 = 23 h 30 à Paris le 7, mais aussi le 7 en UTC : on prend
    // donc un cas où les deux divergent réellement selon le fuseau de la machine.
    const soir = Date.parse('2026-09-07T22:30:00Z');
    const local = localDay(soir);
    const utc = new Date(soir).toISOString().slice(0, 10);
    // On n'impose pas la valeur — elle dépend du fuseau de la machine de test —
    // mais on vérifie que `localDay` s'accorde à `toLocaleDateString`, donc au
    // fuseau local, et pas à UTC par accident.
    expect(local).toBe(new Date(soir).toLocaleDateString('en-CA'));
    // Et que le test a du sens : sur une machine décalée, les deux diffèrent.
    if (new Date(soir).getTimezoneOffset() !== 0) expect(local).not.toBe(utc);
  });

  it('recule d’un nombre de jours', () => {
    const t = Date.parse('2026-09-07T12:00:00Z');
    expect(localDayBefore(0, t)).toBe(localDay(t));
    expect(localDayBefore(7, t)).toBe(localDay(t - 7 * 86400000));
  });
});

describe('focusToday', () => {
  it('ne retient que les tâches du jour demandé', () => {
    const tasks = [
      choisie('aujourdhui', AUJOURDHUI),
      choisie('hier', HIER),
      choisie('jamais', null),
    ];
    expect(focusToday(tasks, AUJOURDHUI).map((t) => t.id)).toEqual(['aujourdhui']);
  });

  // LE test du ticket : la sélection se vide au changement de jour, sans qu'on
  // ait rien effacé. C'est la propriété qui rend l'expiration gratuite.
  it('se vide au passage au jour suivant, sans effacement', () => {
    const tasks = [choisie('t', AUJOURDHUI)];
    expect(focusToday(tasks, AUJOURDHUI)).toHaveLength(1);
    // Le lendemain, la MÊME donnée ne correspond plus.
    expect(focusToday(tasks, '2026-09-08')).toHaveLength(0);
    // Et la valeur est toujours là — c'est elle qui permettra le bilan.
    expect(tasks[0].focus_day).toBe(AUJOURDHUI);
  });

  // Une tâche cochée reste affichée, marquée faite : la faire disparaître
  // effacerait la preuve de l'avancement, qui est la moitié de l'écran.
  it('garde les tâches terminées du jour', () => {
    const tasks = [
      choisie('faite', AUJOURDHUI, { done: true, archived: true }),
      choisie('a-faire', AUJOURDHUI),
    ];
    expect(focusToday(tasks, AUJOURDHUI)).toHaveLength(2);
  });

  it('place ce qui reste à faire avant ce qui est fait', () => {
    const tasks = [
      choisie('faite', AUJOURDHUI, { done: true, title: 'Aaa' }),
      choisie('a-faire', AUJOURDHUI, { title: 'Zzz' }),
    ];
    expect(focusToday(tasks, AUJOURDHUI).map((t) => t.id)).toEqual(['a-faire', 'faite']);
  });

  it('écarte les supprimées et les étapes', () => {
    const tasks = [
      choisie('supprimee', AUJOURDHUI, { deleted: true }),
      choisie('etape', AUJOURDHUI, { parent_id: 'p' }),
      choisie('gardee', AUJOURDHUI),
    ];
    expect(focusToday(tasks, AUJOURDHUI).map((t) => t.id)).toEqual(['gardee']);
  });
});

describe('la limite', () => {
  it('compte les places restantes', () => {
    const tasks = [choisie('a', AUJOURDHUI), choisie('b', AUJOURDHUI)];
    expect(focusRemaining(tasks, AUJOURDHUI, FOCUS_DEFAULT)).toBe(1);
  });

  it('ne descend jamais sous zéro', () => {
    // Une sélection plus large que la limite est possible : l'utilisateur a pu
    // baisser son réglage après avoir choisi.
    const tasks = [1, 2, 3, 4, 5].map((i) => choisie(`t${i}`, AUJOURDHUI));
    expect(focusRemaining(tasks, AUJOURDHUI, FOCUS_DEFAULT)).toBe(0);
  });

  it('n’oppose aucun refus tant qu’il reste une place', () => {
    expect(focusRefusal([choisie('a', AUJOURDHUI)], AUJOURDHUI, FOCUS_DEFAULT)).toBeNull();
  });

  // Le refus porte sa raison : un blocage muet se lit comme un bug, un blocage
  // expliqué se lit comme une intention.
  it('refuse en donnant son motif, jamais en silence', () => {
    const tasks = [1, 2, 3].map((i) => choisie(`t${i}`, AUJOURDHUI));
    const refus = focusRefusal(tasks, AUJOURDHUI, FOCUS_DEFAULT);
    expect(refus).toBeTruthy();
    expect(refus).toContain('3');
    expect(refus).toMatch(/limite/i);
  });

  it('compte séparément les jours', () => {
    const tasks = [1, 2, 3].map((i) => choisie(`h${i}`, HIER));
    // Trois tâches hier ne consomment aucune place aujourd'hui.
    expect(focusRefusal(tasks, AUJOURDHUI, FOCUS_DEFAULT)).toBeNull();
  });
});

describe('focusBilan', () => {
  it('se tait quand il n’y a jamais rien eu', () => {
    expect(focusBilan([choisie('t', null)], AUJOURDHUI)).toBeNull();
  });

  it('se tait quand la seule sélection est celle du jour', () => {
    expect(focusBilan([choisie('t', AUJOURDHUI)], AUJOURDHUI)).toBeNull();
  });

  it('sépare ce qui a été fait de ce qui repart', () => {
    const tasks = [
      choisie('faite', HIER, { done: true, archived: true }),
      choisie('repartie', HIER),
      choisie('aujourdhui', AUJOURDHUI),
    ];
    const bilan = focusBilan(tasks, AUJOURDHUI);
    expect(bilan?.day).toBe(HIER);
    expect(bilan?.done.map((t) => t.id)).toEqual(['faite']);
    expect(bilan?.returned.map((t) => t.id)).toEqual(['repartie']);
  });

  // Le jour le plus récent AVANT aujourd'hui, et non « hier ». Un lundi matin,
  // le bilan doit porter sur vendredi — c'est même le cas le plus fréquent.
  it('remonte au dernier jour de sélection, week-end sauté', () => {
    const tasks = [
      choisie('vendredi-faite', VENDREDI, { done: true }),
      choisie('vendredi-repartie', VENDREDI),
      // Rien le samedi ni le dimanche.
    ];
    const bilan = focusBilan(tasks, AUJOURDHUI);
    expect(bilan?.day).toBe(VENDREDI);
    expect(bilan?.done).toHaveLength(1);
    expect(bilan?.returned).toHaveLength(1);
  });

  it('ne mélange pas deux jours de sélection', () => {
    const tasks = [choisie('vendredi', VENDREDI), choisie('hier', HIER)];
    const bilan = focusBilan(tasks, AUJOURDHUI);
    expect(bilan?.day).toBe(HIER);
    expect(bilan?.returned.map((t) => t.id)).toEqual(['hier']);
  });

  it('écarte une tâche supprimée depuis', () => {
    const tasks = [
      choisie('jetee', HIER, { deleted: true }),
      choisie('gardee', HIER),
    ];
    const bilan = focusBilan(tasks, AUJOURDHUI);
    expect(bilan?.done).toEqual([]);
    expect(bilan?.returned.map((t) => t.id)).toEqual(['gardee']);
  });
});

describe('focusDayLabel', () => {
  it('nomme le jour en français', () => {
    expect(focusDayLabel('2026-09-04')).toMatch(/vendredi/i);
    expect(focusDayLabel('2026-09-04')).toMatch(/septembre/i);
  });

  // Midi UTC en interne : assez loin des deux bords pour qu'aucun fuseau ne
  // fasse basculer le jour affiché.
  it('ne décale pas le jour selon le fuseau', () => {
    expect(focusDayLabel('2026-09-04')).toContain('4');
  });
});
