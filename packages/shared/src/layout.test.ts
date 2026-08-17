import { describe, expect, it } from 'vitest';
import {
  buildRows,
  countOpen,
  endPosition,
  groupByUniverse,
  groupTasksByBoard,
  insertPosition,
  isVisible,
  orderedBoards,
  partnerOf,
  pinnedTasks,
  planPairDetach,
  planPairMove,
  positionBefore,
  visibleTasks,
} from './layout';
import { makeBoard, makeList, makeTask, makeUniverse } from './test-fixtures';

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

// ─────────────────────────────────────────────────────────────────────────────
describe('placement de la partenaire', () => {
  const pair = 'p1';

  it('se glisse entre la tâche déplacée et la voisine suivante', () => {
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair });
    const voisine = makeTask({ id: 'v', position: 10 });
    const [, mate] = planPairMove([a, b, voisine], a, {}, 4);
    expect(mate.patch.position).toBeGreaterThan(4);
    expect(mate.patch.position).toBeLessThan(10);
  });

  it('se pose après quand il n’y a pas de voisine', () => {
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair });
    const [, mate] = planPairMove([a, b], a, {}, 4);
    expect(mate.patch.position).toBe(5);
  });

  it('ne déborde pas sur la voisine, même dans un interstice minuscule', () => {
    // LE cas que la correction règle. Un décalage fixe de 0,001 ferait atterrir
    // la partenaire au-delà de `v` dès que l'écart passe sous ce seuil — ce qui
    // arrive après une dizaine d'insertions au même endroit.
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair });
    const voisine = makeTask({ id: 'v', position: 0.5005 });
    const [task, mate] = planPairMove([a, b, voisine], a, {}, 0.50025);

    expect(mate.patch.position).toBeGreaterThan(task.patch.position!);
    expect(mate.patch.position).toBeLessThan(0.5005);
  });

  it('cherche la voisine dans la case d’ARRIVÉE, pas celle de départ', () => {
    // Le patch dit où la paire va. Lire les voisines de la case d'origine
    // placerait la partenaire d'après un voisinage qu'elle vient de quitter.
    const a = makeTask({ id: 'a', quadrant: 'faire', pair_id: pair });
    const b = makeTask({ id: 'b', quadrant: 'faire', pair_id: pair });
    const iciTresProche = makeTask({ id: 'ici', quadrant: 'faire', position: 4.0001 });
    const laBas = makeTask({ id: 'la', quadrant: 'planifier', position: 10 });

    const [, mate] = planPairMove([a, b, iciTresProche, laBas], a, { quadrant: 'planifier' }, 4);
    // La voisine pertinente est `la` (position 10), pas `ici` (4,0001).
    expect(mate.patch.position).toBe(7);
  });

  it('ignore les voisines supprimées', () => {
    const a = makeTask({ id: 'a', pair_id: pair });
    const b = makeTask({ id: 'b', pair_id: pair });
    const fantome = makeTask({ id: 'f', position: 4.5, deleted: true });
    const [, mate] = planPairMove([a, b, fantome], a, {}, 4);
    expect(mate.patch.position).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('regroupement par univers', () => {
  it('respecte l’ordre des univers et place le groupe sans univers en dernier', () => {
    const boulot = makeUniverse({ id: 'boulot', name: 'Boulot', position: 1 });
    const perso = makeUniverse({ id: 'perso', name: 'Perso', position: 0 });
    const groups = groupByUniverse(
      [boulot, perso],
      [makeBoard({ id: 'seule' }), makeBoard({ id: 'p1', universe_id: 'perso' })],
    );

    expect(groups.map((g) => g.universe?.name ?? 'sans')).toEqual(['Perso', 'Boulot', 'sans']);
    expect(groups[0].boards.map((b) => b.id)).toEqual(['p1']);
    expect(groups[2].boards.map((b) => b.id)).toEqual(['seule']);
  });

  it('trie les matrices par position à l’intérieur d’un groupe', () => {
    const u = makeUniverse({ id: 'u' });
    const groups = groupByUniverse(
      [u],
      [
        makeBoard({ id: 'z', universe_id: 'u', position: 2 }),
        makeBoard({ id: 'a', universe_id: 'u', position: 1 }),
      ],
    );
    expect(groups[0].boards.map((b) => b.id)).toEqual(['a', 'z']);
  });

  it('conserve un univers vide', () => {
    // Un univers fraîchement créé n'a aucune matrice : le faire disparaître le
    // rendrait inatteignable, y compris comme cible de dépôt.
    const groups = groupByUniverse([makeUniverse({ id: 'u', name: 'Neuf' })], []);
    expect(groups[0].universe?.name).toBe('Neuf');
    expect(groups[0].boards).toEqual([]);
  });

  it('garde le groupe sans univers même vide', () => {
    // C'est la cible de dépôt qui permet de SORTIR une matrice de son univers.
    const groups = groupByUniverse([makeUniverse({ id: 'u' })], [makeBoard({ universe_id: 'u' })]);
    expect(groups[groups.length - 1].universe).toBeNull();
  });

  it('ne perd pas une matrice dont l’univers a disparu', () => {
    // Donnée incohérente — un univers supprimé ailleurs, un identifiant erroné.
    // Une matrice ne doit JAMAIS s'évaporer de l'écran à cause de ça.
    const groups = groupByUniverse([], [makeBoard({ id: 'orpheline', universe_id: 'fantome' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].universe).toBeNull();
    expect(groups[0].boards.map((b) => b.id)).toEqual(['orpheline']);
  });

  it('rend un seul groupe quand il n’y a aucun univers', () => {
    // L'état de TOUS les comptes au lendemain de la migration.
    const groups = groupByUniverse([], [makeBoard({ id: 'a' }), makeBoard({ id: 'b' })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].boards).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('vue globale — matrices à plat', () => {
  it('suit l’ordre de l’accueil : univers, puis position, non rangées en dernier', () => {
    const perso = makeUniverse({ id: 'perso', position: 0 });
    const boulot = makeUniverse({ id: 'boulot', position: 1 });
    const flat = orderedBoards(
      [boulot, perso],
      [
        makeBoard({ id: 'libre' }),
        makeBoard({ id: 'b2', universe_id: 'boulot', position: 1 }),
        makeBoard({ id: 'p1', universe_id: 'perso' }),
        makeBoard({ id: 'b1', universe_id: 'boulot', position: 0 }),
      ],
    );
    expect(flat.map((b) => b.id)).toEqual(['p1', 'b1', 'b2', 'libre']);
  });

  it('place en fin une matrice dont l’univers a disparu, sans la perdre', () => {
    const flat = orderedBoards(
      [makeUniverse({ id: 'u' })],
      [makeBoard({ id: 'orpheline', universe_id: 'fantome' }), makeBoard({ id: 'rangee', universe_id: 'u' })],
    );
    expect(flat.map((b) => b.id)).toEqual(['rangee', 'orpheline']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('vue globale — regroupement des tâches par matrice', () => {
  const maison = makeBoard({ id: 'maison', name: 'Maison' });
  const boulot = makeBoard({ id: 'boulot', name: 'Boulot' });

  it('rend un groupe par matrice, dans l’ordre reçu', () => {
    const groups = groupTasksByBoard(
      [makeTask({ board_id: 'boulot' }), makeTask({ board_id: 'maison' })],
      [maison, boulot],
      'faire',
    );
    expect(groups.map((g) => g.board.name)).toEqual(['Maison', 'Boulot']);
  });

  it('n’ouvre AUCUN groupe pour une matrice sans rien à montrer dans la case', () => {
    // Sinon : 5 cases × N matrices de cadres vides, dont la quasi-totalité inutiles.
    const groups = groupTasksByBoard([makeTask({ board_id: 'maison' })], [maison, boulot], 'faire');
    expect(groups).toHaveLength(1);
    expect(groups[0].board.id).toBe('maison');
  });

  it('ignore les tâches d’une autre case et celles d’une matrice hors portée', () => {
    const groups = groupTasksByBoard(
      [
        makeTask({ id: 'ici', board_id: 'maison', quadrant: 'faire' }),
        makeTask({ id: 'ailleurs', board_id: 'maison', quadrant: 'planifier' }),
        makeTask({ id: 'hors-portee', board_id: 'boulot', quadrant: 'faire' }),
      ],
      [maison],
      'faire',
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.flat().map((t) => t.id)).toEqual(['ici']);
  });

  it('sépare les épinglées des ordinaires, dans le bon groupe', () => {
    const groups = groupTasksByBoard(
      [
        makeTask({ id: 'p', board_id: 'maison', pinned: true }),
        makeTask({ id: 'o', board_id: 'maison' }),
        makeTask({ id: 'autre', board_id: 'boulot', pinned: true }),
      ],
      [maison, boulot],
      'faire',
    );
    expect(groups[0].pinned.flat().map((t) => t.id)).toEqual(['p']);
    expect(groups[0].rows.flat().map((t) => t.id)).toEqual(['o']);
    expect(groups[1].pinned.flat().map((t) => t.id)).toEqual(['autre']);
    expect(groups[1].rows).toEqual([]);
  });

  it('conserve l’ordre manuel propre à chaque matrice', () => {
    // Deux matrices peuvent porter les MÊMES positions : c'est précisément
    // pourquoi la vue regroupe au lieu de trier à plat.
    const groups = groupTasksByBoard(
      [
        makeTask({ id: 'm2', board_id: 'maison', position: 1 }),
        makeTask({ id: 'm1', board_id: 'maison', position: 0 }),
        makeTask({ id: 'b2', board_id: 'boulot', position: 1 }),
        makeTask({ id: 'b1', board_id: 'boulot', position: 0 }),
      ],
      [maison, boulot],
      'faire',
    );
    expect(groups[0].rows.flat().map((t) => t.id)).toEqual(['m1', 'm2']);
    expect(groups[1].rows.flat().map((t) => t.id)).toEqual(['b1', 'b2']);
  });

  it('garde une paire sur une seule ligne, dans le cadre de sa matrice', () => {
    const groups = groupTasksByBoard(
      [
        makeTask({ id: 'a', board_id: 'maison', pair_id: 'p', position: 0 }),
        makeTask({ id: 'b', board_id: 'maison', pair_id: 'p', position: 0.5 }),
      ],
      [maison],
      'faire',
    );
    expect(groups[0].rows).toHaveLength(1);
    expect(groups[0].rows[0].map((t) => t.id)).toEqual(['a', 'b']);
  });

  it('dégrade une paire à cheval sur deux matrices en deux cartes simples', () => {
    // Inatteignable par l'interface — `planPairMove` emmène toujours la
    // partenaire — mais d'anciennes données peuvent le porter. Deux cartes
    // valent mieux qu'une ligne fausse, et infiniment mieux qu'un plantage.
    const groups = groupTasksByBoard(
      [
        makeTask({ id: 'a', board_id: 'maison', pair_id: 'p' }),
        makeTask({ id: 'b', board_id: 'boulot', pair_id: 'p' }),
      ],
      [maison, boulot],
      'faire',
    );
    expect(groups[0].rows).toEqual([[expect.objectContaining({ id: 'a' })]]);
    expect(groups[1].rows).toEqual([[expect.objectContaining({ id: 'b' })]]);
  });

  it('rend une liste vide quand la portée ne contient aucune matrice', () => {
    // Un univers vide choisi comme portée : l'écran doit pouvoir le dire.
    expect(groupTasksByBoard([makeTask()], [], 'faire')).toEqual([]);
  });
});
