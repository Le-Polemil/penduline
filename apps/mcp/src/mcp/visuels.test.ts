import type { BoardRange, Task, Universe } from '@penduline/shared';
import { describe, expect, it } from 'vitest';
import {
  LIGNES_PAR_CASE,
  SANS_UNIVERS,
  lienApp,
  pluriel,
  retardALaCloture,
  vueAjout,
  vueDeplacement,
  vueMatrice,
  vueMatrices,
  vueModification,
  vueTerminee,
} from './visuels';

/**
 * Les modèles de vue des visuels. La page HTML n'a aucune logique : tout ce qui
 * pourrait être faux à l'écran se vérifie donc ici.
 */

const MAINTENANT = Date.parse('2026-10-02T12:00:00Z');
const HEURE = 60 * 60 * 1000;
const iso = (decalage: number) => new Date(MAINTENANT + decalage).toISOString();

function tache(over: Partial<Task> & { id: string }): Task {
  return {
    author_id: 'u',
    board_id: 'b1',
    title: over.id,
    quadrant: 'faire',
    done: false,
    archived: false,
    deleted: false,
    position: 0,
    pair_id: null,
    parent_id: null,
    due_at: null,
    focus_day: null,
    origin: 'user',
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    quadrant_changed_at: '2026-09-01T00:00:00Z',
    completed_at: null,
    ...over,
  } as Task;
}

const MATRICE = { id: 'b1', name: 'Cuisine' };

describe('vueMatrice', () => {
  it('range chaque tâche OUVERTE dans sa case, et ignore cochées, supprimées, étapes', () => {
    const v = vueMatrice(
      {
        board: MATRICE,
        universe: { name: 'Maison' },
        taches: [
          tache({ id: 'a', quadrant: 'faire' }),
          tache({ id: 'b', quadrant: 'planifier' }),
          tache({ id: 'faite', quadrant: 'faire', done: true }),
          tache({ id: 'jetee', quadrant: 'faire', deleted: true }),
          tache({ id: 'etape', quadrant: 'faire', parent_id: 'a' }),
          tache({ id: 'p', quadrant: 'parking' }),
          tache({ id: 'ailleurs', board_id: 'b2' }),
        ],
      },
      MAINTENANT,
    );

    expect(v.surtitre).toBe('Penduline · Maison');
    expect(v.matrice).toBe('Cuisine');
    expect(v.cases.map((c) => c.key)).toEqual(['faire', 'planifier', 'deleguer', 'eliminer']);
    expect(v.cases[0].taches.map((t) => t.id)).toEqual(['a']);
    expect(v.cases[1].taches.map((t) => t.id)).toEqual(['b']);
    expect(v.parking.taches.map((t) => t.id)).toEqual(['p']);
    expect(v.pied).toBe('3 tâches ouvertes');
    expect(v.luA).toBe(new Date(MAINTENANT).toISOString());
  });

  it('remonte les dépassées en tête et garde une paire d’un seul tenant', () => {
    const v = vueMatrice(
      {
        board: MATRICE,
        universe: null,
        taches: [
          tache({ id: 'un', position: 1, pair_id: 'P' }),
          tache({ id: 'deux', position: 2 }),
          tache({ id: 'trois', position: 3, pair_id: 'P' }),
          tache({ id: 'retard', position: 4, due_at: iso(-HEURE) }),
        ],
      },
      MAINTENANT,
    );

    expect(v.cases[0].taches.map((t) => t.id)).toEqual(['retard', 'un', 'trois', 'deux']);
    expect(v.cases[0].taches[0].echeance).toEqual({ texte: 'en retard', statut: 'overdue' });
    expect(v.pied).toBe('4 tâches ouvertes · 1 en retard');
    expect(v.surtitre).toBe('Penduline');
  });

  it('pose la pastille « agent » et le libellé d’échéance de l’app', () => {
    const v = vueMatrice(
      {
        board: MATRICE,
        universe: null,
        taches: [tache({ id: 'a', origin: 'agent', due_at: iso(3 * HEURE) })],
      },
      MAINTENANT,
    );

    expect(v.cases[0].taches[0]).toEqual({
      id: 'a',
      titre: 'a',
      agent: true,
      echeance: { texte: 'dans 3 h', statut: 'soon' },
    });
  });

  it('tronque une case trop longue, mais garde le compte EXACT', () => {
    const taches = Array.from({ length: LIGNES_PAR_CASE + 3 }, (_, i) =>
      tache({ id: `t${i}`, position: i }),
    );

    const [faire] = vueMatrice({ board: MATRICE, universe: null, taches }, MAINTENANT).cases;

    expect(faire.taches).toHaveLength(LIGNES_PAR_CASE);
    expect(faire.reste).toBe(3);
    expect(faire.ouvertes).toBe(LIGNES_PAR_CASE + 3);
    expect(faire.aria).toBe(`Faire, ${LIGNES_PAR_CASE + 3} tâches`);
  });

  it('accorde au singulier', () => {
    const v = vueMatrice(
      { board: MATRICE, universe: null, taches: [tache({ id: 'seule' })] },
      MAINTENANT,
    );
    expect(v.pied).toBe('1 tâche ouverte');
    expect(v.cases[0].aria).toBe('Faire, 1 tâche');
    expect(v.cases[1].aria).toBe('Planifier, 0 tâche');
  });

  it('avec un filtre, les autres cases sont « non lues » et le pied le dit', () => {
    const v = vueMatrice(
      {
        board: MATRICE,
        universe: null,
        taches: [tache({ id: 'a', quadrant: 'planifier' })],
        filtre: 'planifier',
      },
      MAINTENANT,
    );

    expect(v.cases.filter((c) => c.masquee).map((c) => c.key)).toEqual([
      'faire',
      'deleguer',
      'eliminer',
    ]);
    expect(v.cases[0].aria).toBe('Faire, non lue');
    expect(v.parking.masquee).toBe(true);
    expect(v.pied).toBe('1 tâche ouverte dans Planifier');
  });

  it('n’expose qu’un lien http(s)', () => {
    const base = { board: MATRICE, universe: null, taches: [] };
    expect(vueMatrice({ ...base, lien: 'https://penduline.zozios.app' }).lien).toBe(
      'https://penduline.zozios.app/',
    );
    expect(vueMatrice({ ...base, lien: 'javascript:alert(1)' }).lien).toBeNull();
    expect(vueMatrice(base).lien).toBeNull();
    expect(lienApp('pas une url')).toBeNull();
  });
});

describe('vueMatrices', () => {
  const univers = (id: string, name: string, position: number) =>
    ({ id, name, position, user_id: 'u', created_at: '', origin: 'user' }) as Universe;
  const matrice = (id: string, name: string, universe_id: string | null, position: number) =>
    ({
      id,
      name,
      universe_id,
      position,
      user_id: 'u',
      created_at: '',
      origin: 'user',
      role: null,
      partagee: false,
    }) as BoardRange;

  const universes = [univers('boulot', 'Boulot', 2), univers('maison', 'Maison', 1), univers('vide', 'Vide', 3)];
  const boards = [
    matrice('cuisine', 'Cuisine', 'maison', 1),
    matrice('semaine', 'Cette semaine', 'boulot', 2),
    matrice('demenagement', 'Déménagement', 'maison', 3),
    matrice('unjour', 'Un jour peut-être', null, 4),
  ];
  const taches = [
    tache({ id: '1', board_id: 'cuisine', quadrant: 'faire', due_at: iso(-HEURE) }),
    tache({ id: '2', board_id: 'cuisine', quadrant: 'faire' }),
    tache({ id: '3', board_id: 'cuisine', quadrant: 'eliminer' }),
    tache({ id: '4', board_id: 'cuisine', quadrant: 'parking' }),
    tache({ id: 'x', board_id: 'cuisine', quadrant: 'faire', done: true }),
    tache({ id: '5', board_id: 'semaine', quadrant: 'planifier' }),
  ];

  const v = vueMatrices({ boards, universes, taches, lien: 'https://penduline.test' }, MAINTENANT);

  it('regroupe par univers, dans l’ordre des univers, hors-univers en dernier', () => {
    expect(v.groupes.map((g) => g.nom)).toEqual(['Maison', 'Boulot', SANS_UNIVERS]);
    expect(v.groupes[0].matrices.map((m) => m.nom)).toEqual(['Cuisine', 'Déménagement']);
    expect(v.groupes.at(-1)?.horsUnivers).toBe(true);
  });

  it('compte les OUVERTES par case, et signale le retard', () => {
    const cuisine = v.groupes[0].matrices[0];
    expect(cuisine.comptes).toEqual({ faire: 2, planifier: 0, deleguer: 0, eliminer: 1, parking: 1 });
    expect(cuisine.ouvertes).toBe(4);
    expect(cuisine.meta).toBe('1 en retard');
    expect(cuisine.alerte).toBe(true);
    expect(cuisine.aria).toBe('Faire 2, Planifier 0, Déléguer 0, Éliminer 1, À trier 1');
  });

  it('« N tâches » sans retard, « vide » sans rien', () => {
    expect(v.groupes[1].matrices[0].meta).toBe('1 tâche');
    expect(v.groupes[0].matrices[1].meta).toBe('vide');
    expect(v.groupes[0].matrices[1].alerte).toBe(false);
  });

  it('résume en pied, sans compter « Sans univers » comme un univers', () => {
    expect(v.pied).toBe('4 matrices · 2 univers · 5 tâches ouvertes');
  });

  it('une matrice rangée dans un univers inconnu tombe dans « Sans univers »', () => {
    const w = vueMatrices(
      { boards: [matrice('m', 'Partagée', 'univers-d-un-autre', 1)], universes: [], taches: [] },
      MAINTENANT,
    );
    expect(w.groupes).toEqual([
      expect.objectContaining({ nom: SANS_UNIVERS, horsUnivers: true }),
    ]);
    expect(w.pied).toBe('1 matrice · 0 tâche ouverte');
  });
});

describe('écritures', () => {
  const ou = { matrice: 'Cuisine', univers: 'Maison' };

  it('ajout : la case d’arrivée, le chemin, la pastille agent et l’échéance', () => {
    const v = vueAjout(
      { tache: tache({ id: 'a', title: 'Racheter des joints', origin: 'agent', due_at: iso(30 * HEURE) }), ou },
      MAINTENANT,
    );
    expect(v).toMatchObject({
      vue: 'ecriture',
      type: 'ajout',
      titre: 'Racheter des joints',
      chemin: 'Maison › Cuisine',
      case: { key: 'faire', label: 'Faire' },
      surtitre: 'Ajoutée dans Faire',
      agent: true,
      echeance: { texte: 'demain', statut: 'neutral' },
    });
  });

  it('ajout au parking, et ajout d’une étape', () => {
    expect(vueAjout({ tache: tache({ id: 'p', quadrant: 'parking' }), ou: { matrice: 'Cuisine', univers: null } }))
      .toMatchObject({ surtitre: 'Ajoutée dans À trier', chemin: 'Cuisine' });
    expect(
      vueAjout({ tache: tache({ id: 'e', parent_id: 'p1' }), ou, parent: tache({ id: 'p1', title: 'Rétro' }) }),
    ).toMatchObject({ surtitre: 'Étape de « Rétro »' });
  });

  it('modification', () => {
    expect(vueModification({ tache: tache({ id: 'a', quadrant: 'deleguer' }), ou })).toMatchObject({
      type: 'modification',
      surtitre: 'Modifiée · Déléguer',
    });
  });

  it('déplacement : d’où, vers où, et la partenaire qui a suivi', () => {
    const avant = tache({ id: 'a', title: 'Préparer la rétro', quadrant: 'planifier', pair_id: 'P' });
    const mate = tache({ id: 'b', title: 'Réserver la salle', quadrant: 'planifier', pair_id: 'P' });
    const v = vueDeplacement({
      avant,
      taches: [avant, mate],
      writes: [
        { id: 'a', patch: { quadrant: 'faire', board_id: 'b1', position: 3 } },
        { id: 'b', patch: { quadrant: 'faire', board_id: 'b1', position: 4 } },
      ],
      ou: { matrice: 'Cette semaine', univers: 'Boulot' },
    });
    expect(v).toMatchObject({
      type: 'deplacement',
      de: { key: 'planifier', label: 'Planifier' },
      vers: { key: 'faire', label: 'Faire' },
      paire: 'Réserver la salle',
      chemin: 'Boulot › Cette semaine',
    });
  });

  it('déplacement vers une autre matrice : le chemin dit les deux', () => {
    const avant = tache({ id: 'a' });
    const v = vueDeplacement({
      avant,
      taches: [avant],
      writes: [{ id: 'a', patch: { quadrant: 'faire', board_id: 'b2', position: 0 } }],
      ou: { matrice: 'Déménagement', univers: 'Maison' },
      depart: ou,
    });
    expect(v).toMatchObject({ chemin: 'Maison › Cuisine → Maison › Déménagement', paire: null });
  });

  it('terminée : le retard à la clôture, et la paire défaite', () => {
    const avant = tache({ id: 'a', title: "Fuite sous l'évier", pair_id: 'P', due_at: iso(-30 * HEURE) });
    const mate = tache({ id: 'b', title: 'Racheter des joints', pair_id: 'P' });
    const v = vueTerminee(
      {
        avant,
        taches: [avant, mate],
        writes: [
          { id: 'a', patch: { done: true, archived: true, pair_id: null } },
          { id: 'b', patch: { pair_id: null } },
        ],
        ou,
      },
      MAINTENANT,
    );
    expect(v).toMatchObject({
      type: 'terminee',
      retard: 'était en retard d’un jour',
      paireDefaite: { titre: 'Racheter des joints', case: { key: 'faire', label: 'Faire' } },
    });
  });

  it('le retard à la clôture se dit en heures, puis en jours', () => {
    expect(retardALaCloture(null, MAINTENANT)).toBeNull();
    expect(retardALaCloture(iso(HEURE), MAINTENANT)).toBeNull();
    expect(retardALaCloture(iso(-10 * 60_000), MAINTENANT)).toBe('était tout juste en retard');
    expect(retardALaCloture(iso(-5 * HEURE), MAINTENANT)).toBe('était en retard de 5 h');
    expect(retardALaCloture(iso(-72 * HEURE), MAINTENANT)).toBe('était en retard de 3 jours');
  });
});

describe('pluriel', () => {
  it('zéro et un au singulier, comme en français', () => {
    expect(pluriel(0, 'tâche')).toBe('0 tâche');
    expect(pluriel(1, 'tâche')).toBe('1 tâche');
    expect(pluriel(2, 'tâche')).toBe('2 tâches');
    expect(pluriel(3, 'univers', 'univers')).toBe('3 univers');
  });
});
