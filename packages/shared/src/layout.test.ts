import { describe, expect, it } from 'vitest';
import {
  buildRows,
  countOpen,
  endPosition,
  insertPosition,
  isVisible,
  partnerOf,
  pinnedTasks,
  planPairDetach,
  planPairMove,
  positionBefore,
  visibleTasks,
} from './layout';
import { makeList, makeTask } from './test-fixtures';

/** Une liste est-elle strictement ordonnée ? Deux positions égales = ordre perdu. */
function strictlyOrdered(positions: number[]): boolean {
  return positions.every((p, i) => i === 0 || positions[i - 1] < p);
}

// ─────────────────────────────────────────────────────────────────────────────
describe('positions fractionnaires', () => {
  it('insère bien entre deux voisins', () => {
    const list = makeList(['a', 'b']);
    expect(positionBefore(list, 'b')).toBe(0.5);
  });

  it('renvoie la fin de liste quand `beforeId` est nul', () => {
    expect(positionBefore(makeList(['a', 'b']), null)).toBe(2);
  });

  it('renvoie la fin de liste quand `beforeId` est inconnu', () => {
    // Cas réel : la tâche visée vient d'être supprimée par un autre appareil.
    // Se rabattre sur la fin vaut mieux que produire une position aberrante.
    expect(positionBefore(makeList(['a', 'b']), 'fantome')).toBe(2);
  });

  it('gère la liste vide', () => {
    expect(endPosition([])).toBe(0);
    expect(positionBefore([], null)).toBe(0);
    expect(insertPosition([], 0)).toBe(0);
  });

  it('accepte tout ce qui a un id et une position, pas seulement des tâches', () => {
    // `Positioned` a été élargie pour que les matrices réutilisent la même
    // logique d'ordre (#14) : une seule implémentation pour deux usages.
    const matrices = [
      { id: 'm1', position: 0 },
      { id: 'm2', position: 1 },
    ];
    expect(positionBefore(matrices, 'm2')).toBe(0.5);
    expect(endPosition(matrices)).toBe(2);
  });

  /**
   * LE test de ce fichier.
   *
   * Chaque insertion au même endroit divise l'écart par deux. Un `double` a 52
   * bits de mantisse : passé ce seuil, la moyenne de deux voisins **égale** l'un
   * d'eux, deux positions deviennent identiques, et l'ordre cesse d'être défini.
   * Sans erreur, sans exception — juste un ordre faux.
   *
   * Plafond mesuré : **53 insertions**. La 54ᵉ produit une position exactement
   * égale à celle de sa voisine. C'est confortable — il faudrait réordonner 53
   * fois d'affilée au MÊME interstice sans jamais rien faire d'autre — mais ce
   * n'est pas infini, et personne ne l'aurait su sans le mesurer.
   *
   * L'assertion garde une marge : elle garantit un plancher plutôt que de figer
   * la valeur exacte, qui dépend de l'algorithme et non du contrat.
   */
  it('supporte au moins 50 insertions consécutives au même endroit', () => {
    let list = makeList(['a', 'b']);
    let survived = 0;

    for (let i = 0; i < 200; i++) {
      const position = positionBefore(list, 'b');
      list = [...list, makeTask({ id: `x${i}`, position })].sort(
        (p, q) => p.position - q.position,
      );
      if (!strictlyOrdered(list.map((t) => t.position))) break;
      survived = i + 1;
    }

    // 50 insertions au même endroit couvrent très largement l'usage réel : c'est
    // réordonner cinquante fois d'affilée au même interstice sans jamais rien
    // faire d'autre.
    expect(survived).toBeGreaterThanOrEqual(50);
  });

  it('insertPosition place bien avant, entre, et après les lignes existantes', () => {
    const rows = [[makeTask({ id: 'a', position: 0 })], [makeTask({ id: 'b', position: 1 })]];
    expect(insertPosition(rows, 0)).toBeLessThan(0);
    expect(insertPosition(rows, 1)).toBe(0.5);
    expect(insertPosition(rows, 2)).toBeGreaterThan(1);
  });

  it('insertPosition prend la position la plus basse d’une ligne appairée', () => {
    // Une ligne de deux cartes a deux positions : c'est la plus basse qui situe
    // la ligne, sinon insérer « avant » tomberait entre les deux moitiés.
    const rows = [
      [makeTask({ id: 'a', position: 0 }), makeTask({ id: 'a2', position: 0.001 })],
      [makeTask({ id: 'b', position: 1 })],
    ];
    expect(insertPosition(rows, 1)).toBe(0.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('appairage', () => {
  const pair = 'p1';

  it('groupe deux tâches partageant un pair_id', () => {
    const rows = buildRows([
      makeTask({ id: 'a', position: 0, pair_id: pair }),
      makeTask({ id: 'b', position: 1, pair_id: pair }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('laisse seule une tâche dont la partenaire a disparu', () => {
    // La partenaire supprimée ne fait plus partie des visibles : la survivante
    // ne doit pas pour autant disparaître ni faire planter le rendu.
    const rows = buildRows([makeTask({ id: 'a', position: 0, pair_id: pair })]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveLength(1);
  });

  it('tolère trois tâches sur le même pair_id', () => {
    // Plus atteignable par l'interface — on ne peut pas se greffer sur une paire
    // déjà formée — mais d'anciennes données peuvent le porter. On fige le
    // comportement défensif : deux appairées, la troisième seule.
    const rows = buildRows([
      makeTask({ id: 'a', position: 0, pair_id: pair }),
      makeTask({ id: 'b', position: 1, pair_id: pair }),
      makeTask({ id: 'c', position: 2, pair_id: pair }),
    ]);
    expect(rows.map((r) => r.map((t) => t.id))).toEqual([['a', 'b'], ['c']]);
  });

  it('partnerOf trouve la partenaire', () => {
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair });
    expect(partnerOf([a, b], a)?.id).toBe('b');
  });

  it('partnerOf ignore une partenaire supprimée', () => {
    // Sinon un déplacement emmènerait une tâche qui n'est plus là, et
    // ressusciterait un lien vers la corbeille.
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair, deleted: true });
    expect(partnerOf([a, b], a)).toBeNull();
  });

  it('partnerOf renvoie null sans pair_id', () => {
    const a = makeTask({ id: 'a' });
    expect(partnerOf([a, makeTask({ id: 'b' })], a)).toBeNull();
  });

  it('partnerOf ne se renvoie jamais elle-même', () => {
    const a = makeTask({ id: 'a', pair_id: pair });
    expect(partnerOf([a], a)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('matrice d’états', () => {
  /**
   * Les règles de visibilité croisent quatre drapeaux. Cette table est le seul
   * endroit du dépôt où elles sont énoncées explicitement — et certaines portent
   * des décisions produit, pas des détails d'implémentation.
   */
  const cases: Array<{
    quoi: string;
    task: Partial<ReturnType<typeof makeTask>>;
    visible: boolean;
    epinglee: boolean;
    ouverte: boolean;
  }> = [
    { quoi: 'ordinaire', task: {}, visible: true, epinglee: false, ouverte: true },
    { quoi: 'épinglée', task: { pinned: true }, visible: false, epinglee: true, ouverte: true },
    // Décision produit : une tâche cochée reste VISIBLE tant qu'elle n'est pas
    // archivée — c'est le délai d'annulation de 4 s. Mais elle ne compte plus
    // comme ouverte.
    { quoi: 'cochée, pas encore archivée', task: { done: true }, visible: true, epinglee: false, ouverte: false },
    { quoi: 'cochée et archivée', task: { done: true, archived: true }, visible: false, epinglee: false, ouverte: false },
    { quoi: 'supprimée', task: { deleted: true }, visible: false, epinglee: false, ouverte: false },
    { quoi: 'supprimée et épinglée', task: { deleted: true, pinned: true }, visible: false, epinglee: false, ouverte: false },
    // `archived` sans `done` ne devrait pas exister ; le code ne l'exclut que
    // conjointement, donc la tâche reste visible. Comportement figé tel quel.
    { quoi: 'archivée sans être cochée', task: { archived: true }, visible: true, epinglee: false, ouverte: true },
  ];

  for (const c of cases) {
    it(`${c.quoi} — visible: ${c.visible}, épinglée: ${c.epinglee}, ouverte: ${c.ouverte}`, () => {
      const t = makeTask({ quadrant: 'faire', ...c.task });
      expect(isVisible(t, 'faire')).toBe(c.visible);
      expect(visibleTasks([t], 'b1', 'faire')).toHaveLength(c.visible ? 1 : 0);
      expect(pinnedTasks([t], 'b1', 'faire')).toHaveLength(c.epinglee ? 1 : 0);
      expect(countOpen([t], 'b1', 'faire')).toBe(c.ouverte ? 1 : 0);
    });
  }

  it('ne mélange jamais deux matrices', () => {
    const ici = makeTask({ board_id: 'b1' });
    const ailleurs = makeTask({ board_id: 'b2' });
    expect(visibleTasks([ici, ailleurs], 'b1', 'faire')).toHaveLength(1);
    expect(countOpen([ici, ailleurs], 'b1', 'faire')).toBe(1);
  });

  it('trie les visibles par position', () => {
    const tasks = [makeTask({ id: 'z', position: 2 }), makeTask({ id: 'a', position: 1 })];
    expect(visibleTasks(tasks, 'b1', 'faire').map((t) => t.id)).toEqual(['a', 'z']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('préservation des paires', () => {
  const pair = 'p1';

  it('déplace une tâche seule sans rien inventer', () => {
    const t = makeTask({ id: 'a' });
    expect(planPairMove([t], t, { quadrant: 'planifier' }, 5)).toEqual([
      { id: 'a', patch: { quadrant: 'planifier', position: 5 } },
    ]);
  });

  it('emmène la partenaire, avec le MÊME patch', () => {
    // Changer de case ou de matrice concerne la paire entière : seule la
    // position diffère, pour que la partenaire se range juste derrière.
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair });
    const writes = planPairMove([a, b], a, { board_id: 'b2' }, 5);

    expect(writes).toHaveLength(2);
    expect(writes[0]).toEqual({ id: 'a', patch: { board_id: 'b2', position: 5 } });
    expect(writes[1].id).toBe('b');
    expect(writes[1].patch.board_id).toBe('b2');
    expect(writes[1].patch.position).toBeGreaterThan(5);
  });

  it('ignore une partenaire supprimée', () => {
    // Sinon le déplacement ressusciterait un lien vers la corbeille.
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair, deleted: true });
    expect(planPairMove([a, b], a, {}, 5)).toHaveLength(1);
  });

  it('ignore un pair_id orphelin', () => {
    const a = makeTask({ id: 'a', pair_id: pair });
    expect(planPairMove([a], a, {}, 5)).toHaveLength(1);
  });

  it('détache des deux côtés', () => {
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair });
    expect(planPairDetach([a, b], a)).toEqual([
      { id: 'a', patch: { pair_id: null } },
      { id: 'b', patch: { pair_id: null } },
    ]);
  });

  it('n’applique le patch propre qu’à la tâche qui part', () => {
    // La survivante perd son lien, pas son état : archiver l'une ne doit pas
    // archiver l'autre.
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair });
    const writes = planPairDetach([a, b], a, { archived: true, pinned: false });

    expect(writes[0].patch).toEqual({ archived: true, pinned: false, pair_id: null });
    expect(writes[1].patch).toEqual({ pair_id: null });
  });

  it('détache une tâche sans partenaire sans échouer', () => {
    const a = makeTask({ id: 'a' });
    expect(planPairDetach([a], a, { deleted: true })).toEqual([
      { id: 'a', patch: { deleted: true, pair_id: null } },
    ]);
  });
});
