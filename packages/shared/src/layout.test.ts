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
  planBoardReorder,
  planPairDetach,
  planPairMove,
  planReorder,
  progress,
  attachmentsOf,
  CAPTURE_TTL_MS,
  deadlineStatus,
  formatDeadline,
  fromLocalInput,
  isOverdue,
  SOON_MS,
  splitOverdue,
  toLocalInput,
  deleteLabel,
  hostLabel,
  isFreshCapture,
  isSafeUrl,
  normalizeUrl,
  isOpenRow,
  planDelete,
  planRestore,
  subtasksOf,
  positionBefore,
  summarizeUniverse,
  visibleTasks,
} from './layout';
import { makeAttachment, makeBoard, makeList, makeTask, makeUniverse } from './test-fixtures';

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

  it('insertPosition n’atterrit jamais entre les deux moitiés d’une paire', () => {
    // Une ligne appairée occupe DEUX positions. L'insertion doit tomber en dehors
    // de cet intervalle, des deux côtés — la propriété compte, pas la valeur.
    //
    // L'écart est ici volontairement large (0 et 2) : avec une paire serrée, les
    // deux bornes se confondent et le test passe même quand le calcul est faux.
    const paire = [makeTask({ id: 'a', position: 0 }), makeTask({ id: 'a2', position: 2 })];
    const apres = makeTask({ id: 'b', position: 3 });

    // Avant la paire : sous sa carte la plus basse.
    expect(insertPosition([paire, [apres]], 0)).toBeLessThan(0);
    // Après la paire : au-dessus de sa carte la plus haute. C'est le cas que
    // l'ancrage sur le minimum se trompait — il rendait 1,5, soit pile entre les
    // deux moitiés.
    const entre = insertPosition([paire, [apres]], 1);
    expect(entre).toBeGreaterThan(2);
    expect(entre).toBeLessThan(3);
    // En fin de liste, même règle : au-dessus du maximum de la dernière ligne.
    expect(insertPosition([[apres], paire], 2)).toBeGreaterThan(2);
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
    // ⚠️ RENVERSÉ PAR #75. Cette ligne disait auparavant `visible: true`, au nom
    // du délai d'annulation de 4 s — le délai était donc encodé dans le MODÈLE DE
    // DONNÉES, et une tâche dont l'archivage n'arrivait jamais restait affichée
    // pour toujours. Le délai vit désormais en mémoire (paramètre `pending`) :
    // `done` suffit à masquer, quel que soit `archived`.
    { quoi: 'cochée, pas encore archivée', task: { done: true }, visible: false, epinglee: false, ouverte: false },
    { quoi: 'cochée et archivée', task: { done: true, archived: true }, visible: false, epinglee: false, ouverte: false },
    // Une épinglée cochée quitte aussi la zone des épinglées, même règle.
    { quoi: 'épinglée et cochée', task: { pinned: true, done: true }, visible: false, epinglee: false, ouverte: false },
    { quoi: 'supprimée', task: { deleted: true }, visible: false, epinglee: false, ouverte: false },
    { quoi: 'supprimée et épinglée', task: { deleted: true, pinned: true }, visible: false, epinglee: false, ouverte: false },
    // `archived` sans `done` ne devrait pas exister. Le masquage portant
    // désormais sur `done` seul, cet état reste visible — inchangé par #75.
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

  /**
   * L'exception qui porte le délai d'annulation depuis #75.
   *
   * Une tâche cochée est masquée d'emblée ; `pending` la garde à l'écran le temps
   * qu'on puisse annuler. C'est ce qui permet d'écrire `done` ET `archived` d'un
   * seul coup, donc de ne plus laisser d'état intermédiaire en base.
   */
  it('`pending` garde une tâche cochée visible, elle seule', () => {
    const cochee = makeTask({ id: 'cochee', done: true, archived: true });
    const autre = makeTask({ id: 'autre', done: true, archived: true });

    expect(visibleTasks([cochee, autre], 'b1', 'faire')).toHaveLength(0);
    expect(visibleTasks([cochee, autre], 'b1', 'faire', 'cochee').map((t) => t.id)).toEqual(['cochee']);
    expect(isVisible(cochee, 'faire', 'cochee')).toBe(true);
    expect(isVisible(autre, 'faire', 'cochee')).toBe(false);
  });

  it('`pending` vaut aussi dans la zone des épinglées', () => {
    // Sinon cocher une épinglée la ferait disparaître sans délai d'annulation.
    const t = makeTask({ id: 'p', pinned: true, done: true, archived: true });
    expect(pinnedTasks([t], 'b1', 'faire')).toHaveLength(0);
    expect(pinnedTasks([t], 'b1', 'faire', 'p')).toHaveLength(1);
  });

  it('`pending` ne ressuscite ni une supprimée ni une tâche d’une autre case', () => {
    // Le délai d'annulation ne concerne QUE la complétion.
    const morte = makeTask({ id: 'x', deleted: true });
    const ailleurs = makeTask({ id: 'y', done: true, archived: true, quadrant: 'planifier' });
    expect(visibleTasks([morte], 'b1', 'faire', 'x')).toHaveLength(0);
    expect(visibleTasks([ailleurs], 'b1', 'faire', 'y')).toHaveLength(0);
  });

  it('`pending` ne change rien aux compteurs', () => {
    // Les pastilles de l'accueil doivent tomber DÈS le clic : la tâche est faite,
    // même si on peut encore revenir en arrière.
    const t = makeTask({ done: true, archived: true });
    expect(countOpen([t], 'b1', 'faire')).toBe(0);
  });

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
describe('résumé d’un univers replié', () => {
  it('compte les matrices et leurs tâches ouvertes', () => {
    const a = makeBoard({ id: 'a' });
    const b = makeBoard({ id: 'b' });
    const tasks = [
      makeTask({ board_id: 'a' }),
      makeTask({ board_id: 'a' }),
      makeTask({ board_id: 'b' }),
    ];
    expect(summarizeUniverse([a, b], tasks)).toEqual({ boards: 2, tasks: 3 });
  });

  it('rend un groupe vide sans lever', () => {
    expect(summarizeUniverse([], [makeTask()])).toEqual({ boards: 0, tasks: 0 });
  });

  it('exclut les tâches cochées et les supprimées', () => {
    // Un en-tête replié annonce ce qui RESTE à faire. Compter la corbeille et
    // les archives ferait mentir le chiffre au premier coup d'œil.
    const a = makeBoard({ id: 'a' });
    const tasks = [
      makeTask({ board_id: 'a' }),
      makeTask({ board_id: 'a', done: true }),
      makeTask({ board_id: 'a', done: true, archived: true }),
      makeTask({ board_id: 'a', deleted: true }),
    ];
    expect(summarizeUniverse([a], tasks).tasks).toBe(1);
  });

  it('compte les tâches épinglées : elles restent à faire', () => {
    const a = makeBoard({ id: 'a' });
    expect(summarizeUniverse([a], [makeTask({ board_id: 'a', pinned: true })]).tasks).toBe(1);
  });

  it('ignore les tâches des matrices hors du groupe', () => {
    // Le résumé d'un univers ne doit rien emprunter à un autre.
    const a = makeBoard({ id: 'a' });
    const tasks = [makeTask({ board_id: 'a' }), makeTask({ board_id: 'ailleurs' })];
    expect(summarizeUniverse([a], tasks).tasks).toBe(1);
  });

  it('compte toutes les cases confondues', () => {
    // Contrairement à `countOpen`, le résumé n'a pas de quadrant : un en-tête
    // replié parle de l'univers entier.
    const a = makeBoard({ id: 'a' });
    const tasks = [
      makeTask({ board_id: 'a', quadrant: 'faire' }),
      makeTask({ board_id: 'a', quadrant: 'planifier' }),
      makeTask({ board_id: 'a', quadrant: 'deleguer' }),
    ];
    expect(summarizeUniverse([a], tasks).tasks).toBe(3);
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

// ─────────────────────────────────────────────────────────────────────────────
describe('réordonnancement au clavier — tâches', () => {
  it('monte une tâche d’un cran', () => {
    const list = makeList(['a', 'b', 'c']);
    const plan = planReorder(list, list[1], -1)!;
    expect(plan.writes).toHaveLength(1);
    expect(plan.writes[0].id).toBe('b');
    // Entre `a` (0) et rien avant : `insertPosition` ouvre l'espace en dessous de 0.
    expect(plan.writes[0].patch.position).toBeLessThan(0);
    expect([plan.index, plan.total]).toEqual([1, 3]);
  });

  it('descend une tâche d’un cran', () => {
    const list = makeList(['a', 'b', 'c']);
    const plan = planReorder(list, list[0], 1)!;
    expect(plan.writes[0].patch.position).toBeGreaterThan(1);
    expect(plan.writes[0].patch.position).toBeLessThan(2);
    expect([plan.index, plan.total]).toEqual([2, 3]);
  });

  it('rend `null` aux deux extrémités', () => {
    // C'est ce qui permet à l'appelant de griser ses boutons sans rien savoir de
    // la structure des lignes.
    const list = makeList(['a', 'b']);
    expect(planReorder(list, list[0], -1)).toBeNull();
    expect(planReorder(list, list[1], 1)).toBeNull();
  });

  it('rend `null` dans une case à une seule ligne', () => {
    const only = makeTask({ id: 'seule' });
    expect(planReorder([only], only, -1)).toBeNull();
    expect(planReorder([only], only, 1)).toBeNull();
  });

  it('fait franchir une paire d’un seul saut, sans la traverser', () => {
    // LE test de cette fonction. Une paire est UNE ligne : descendre `a` d'un cran
    // doit la faire passer sous les DEUX cartes appairées, pas se glisser entre.
    const a = makeTask({ id: 'a', position: 0 });
    const p1 = makeTask({ id: 'p1', position: 1, pair_id: 'p' });
    const p2 = makeTask({ id: 'p2', position: 2, pair_id: 'p' });
    const plan = planReorder([a, p1, p2], a, 1)!;
    expect(plan.writes[0].patch.position).toBeGreaterThan(2);
    expect([plan.index, plan.total]).toEqual([2, 2]);
  });

  it('emmène la partenaire quand c’est la paire qu’on déplace', () => {
    const p1 = makeTask({ id: 'p1', position: 0, pair_id: 'p' });
    const p2 = makeTask({ id: 'p2', position: 1, pair_id: 'p' });
    const c = makeTask({ id: 'c', position: 2 });
    const plan = planReorder([p1, p2, c], p1, 1)!;
    // Deux écritures : l'invariant d'appairage passe par `planPairMove`.
    expect(plan.writes.map((w) => w.id).sort()).toEqual(['p1', 'p2']);
    expect(plan.writes[0].patch.position).toBeGreaterThan(2);
  });

  it('réordonne une épinglée parmi les épinglées, jamais parmi les autres', () => {
    // Les deux zones sont distinctes à l'écran : mélanger les listes ferait
    // sauter la tâche d'une zone à l'autre sans qu'on l'ait demandé.
    const pin1 = makeTask({ id: 'pin1', position: 0, pinned: true });
    const pin2 = makeTask({ id: 'pin2', position: 1, pinned: true });
    const libre = makeTask({ id: 'libre', position: 2 });
    const tasks = [pin1, pin2, libre];

    const plan = planReorder(tasks, pin2, -1)!;
    expect(plan.writes[0].id).toBe('pin2');
    expect([plan.index, plan.total]).toEqual([1, 2]); // 2 lignes : les épinglées seules

    // Et une épinglée seule dans sa zone ne bouge pas, même s'il reste des
    // ordinaires en dessous.
    expect(planReorder([pin1, libre], pin1, 1)).toBeNull();
  });

  it('ignore les tâches d’une autre case et les supprimées', () => {
    const ici = makeTask({ id: 'ici', position: 0 });
    const ailleurs = makeTask({ id: 'ailleurs', position: 1, quadrant: 'planifier' });
    const morte = makeTask({ id: 'morte', position: 2, deleted: true });
    expect(planReorder([ici, ailleurs, morte], ici, 1)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('réordonnancement au clavier — matrices', () => {
  const groupe = () => [
    makeBoard({ id: 'a', position: 0 }),
    makeBoard({ id: 'b', position: 1 }),
    makeBoard({ id: 'c', position: 2 }),
  ];

  it('monte une matrice : elle se place avant sa voisine du dessus', () => {
    const list = groupe();
    expect(planBoardReorder(list, list[1], -1)).toEqual({ beforeId: 'a', index: 1, total: 3 });
  });

  it('descend une matrice : AVANT LE SUIVANT DU SUIVANT', () => {
    // La subtilité qui n'avait aucun test. `positionBefore` ne sait qu'insérer
    // AVANT une cible : viser `c` ferait revenir la matrice où elle était.
    const list = groupe();
    expect(planBoardReorder(list, list[0], 1)).toEqual({ beforeId: 'c', index: 2, total: 3 });
  });

  it('descendre l’avant-dernière vise la fin de liste', () => {
    const list = groupe();
    expect(planBoardReorder(list, list[1], 1)).toEqual({ beforeId: null, index: 3, total: 3 });
  });

  it('rend `null` aux extrémités', () => {
    const list = groupe();
    expect(planBoardReorder(list, list[0], -1)).toBeNull();
    expect(planBoardReorder(list, list[2], 1)).toBeNull();
  });

  it('ne compte que les matrices du même univers', () => {
    // La position d'une matrice est scopée à son univers (#17) : une matrice
    // d'ailleurs ne doit ni servir de repère ni gonfler le total.
    const rangee = makeBoard({ id: 'r1', universe_id: 'u', position: 0 });
    const autre = makeBoard({ id: 'r2', universe_id: 'u', position: 1 });
    const libre = makeBoard({ id: 'libre', position: 0 });
    const all = [rangee, autre, libre];
    expect(planBoardReorder(all, rangee, 1)).toEqual({ beforeId: null, index: 2, total: 2 });
    expect(planBoardReorder(all, libre, 1)).toBeNull();
  });

  it('trie par position, pas par ordre de chargement', () => {
    const z = makeBoard({ id: 'z', position: 2 });
    const a = makeBoard({ id: 'a', position: 0 });
    expect(planBoardReorder([z, a], a, 1)).toEqual({ beforeId: null, index: 2, total: 2 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('sous-tâches — un seul niveau', () => {
  it('une sous-tâche n’est jamais une ligne de la grille', () => {
    // C'est la règle qui fait tenir tout le reste : elle s'affiche sous son
    // parent, pas dans la case.
    const parent = makeTask({ id: 'p' });
    const etape = makeTask({ id: 'e', parent_id: 'p' });
    expect(visibleTasks([parent, etape], 'b1', 'faire').map((t) => t.id)).toEqual(['p']);
    expect(isVisible(etape, 'faire')).toBe(false);
  });

  it('une sous-tâche ne s’épingle pas', () => {
    // Épingler, c'est remonter en haut d'une case — or elle n'en a pas.
    const etape = makeTask({ id: 'e', parent_id: 'p', pinned: true });
    expect(pinnedTasks([etape], 'b1', 'faire')).toHaveLength(0);
  });

  it('les sous-tâches ne comptent pas dans le compteur de case', () => {
    // Sans ça, un parent à douze étapes écraserait visuellement la matrice.
    const parent = makeTask({ id: 'p' });
    const etapes = [1, 2, 3].map((n) => makeTask({ id: `e${n}`, parent_id: 'p' }));
    expect(countOpen([parent, ...etapes], 'b1', 'faire')).toBe(1);
  });

  it('`pending` ne ressuscite pas une sous-tâche dans la grille', () => {
    // Le délai d'annulation vaut pour les lignes de grille, pas pour ce qui n'y
    // figure pas.
    const etape = makeTask({ id: 'e', parent_id: 'p', done: true, archived: true });
    expect(visibleTasks([etape], 'b1', 'faire', 'e')).toHaveLength(0);
  });

  it('`subtasksOf` rend les étapes triées, sans les supprimées', () => {
    const tasks = [
      makeTask({ id: 'z', parent_id: 'p', position: 2 }),
      makeTask({ id: 'a', parent_id: 'p', position: 1 }),
      makeTask({ id: 'morte', parent_id: 'p', position: 0, deleted: true }),
      makeTask({ id: 'ailleurs', parent_id: 'autre' }),
    ];
    expect(subtasksOf(tasks, 'p').map((t) => t.id)).toEqual(['a', 'z']);
  });

  it('`progress` compte les faites sur le total', () => {
    const tasks = [
      makeTask({ id: 'a', parent_id: 'p', done: true }),
      makeTask({ id: 'b', parent_id: 'p', done: true }),
      makeTask({ id: 'c', parent_id: 'p' }),
      // Une étape supprimée sort du décompte : elle n'est plus une étape.
      makeTask({ id: 'd', parent_id: 'p', deleted: true }),
    ];
    expect(progress(tasks, 'p')).toEqual({ done: 2, total: 3 });
  });

  it('un parent sans étape rend un total nul', () => {
    // L'appelant s'en sert pour ne rien afficher du tout.
    expect(progress([makeTask({ id: 'p' })], 'p')).toEqual({ done: 0, total: 0 });
  });

  it('une paire reste une paire, les sous-tâches n’y changent rien', () => {
    const a = makeTask({ id: 'a', pair_id: 'x', position: 0 });
    const b = makeTask({ id: 'b', pair_id: 'x', position: 1 });
    const etape = makeTask({ id: 'e', parent_id: 'a', position: 0 });
    const rows = buildRows(visibleTasks([a, b, etape], 'b1', 'faire'));
    expect(rows).toHaveLength(1);
    expect(rows[0].map((t) => t.id)).toEqual(['a', 'b']);
  });
});

describe('suppression et restauration d’un parent (#50)', () => {
  it('supprimer un parent emporte ses étapes — la base ne le fait pas', () => {
    // `on delete cascade` ne joue qu’au vidage définitif : notre suppression est
    // douce, donc la cascade est ici, dans le plan d’écriture.
    const p = makeTask({ id: 'p' });
    const tasks = [p, makeTask({ id: 'e1', parent_id: 'p' }), makeTask({ id: 'e2', parent_id: 'p' })];
    const writes = planDelete(tasks, p);
    expect(writes.map((w) => w.id).sort()).toEqual(['e1', 'e2', 'p']);
    expect(writes.filter((w) => w.id !== 'p').every((w) => w.patch.deleted === true)).toBe(true);
  });

  it('supprimer une paire emporte les étapes de la tâche désignée', () => {
    const p = makeTask({ id: 'p', pair_id: 'x' });
    const mate = makeTask({ id: 'm', pair_id: 'x' });
    const tasks = [p, mate, makeTask({ id: 'e', parent_id: 'p' })];
    expect(planDelete(tasks, p).map((w) => w.id).sort()).toEqual(['e', 'm', 'p']);
  });

  it('restaurer un parent relève ses étapes supprimées, sans les décocher', () => {
    const p = makeTask({ id: 'p', deleted: true });
    const tasks = [
      p,
      makeTask({ id: 'faite', parent_id: 'p', done: true, deleted: true }),
      makeTask({ id: 'vivante', parent_id: 'p' }),
    ];
    const writes = planRestore(tasks, p);
    expect(writes.map((w) => w.id)).toEqual(['p', 'faite']);
    // L’étape cochée avant la suppression revient cochée : elle n’a rien demandé.
    expect(writes[1].patch).toEqual({ deleted: false });
  });

  it('l’annonce de suppression dit combien d’étapes partent avec', () => {
    const p = makeTask({ id: 'p' });
    expect(deleteLabel([p], p)).toBe('Supprimée');
    expect(deleteLabel([p, makeTask({ id: 'a', parent_id: 'p' })], p)).toBe('Supprimée avec 1 étape');
    expect(
      deleteLabel([p, makeTask({ id: 'a', parent_id: 'p' }), makeTask({ id: 'b', parent_id: 'p' })], p),
    ).toBe('Supprimée avec 2 étapes');
  });
});

describe('isOpenRow — le point unique où « ouverte » se décide', () => {
  it('compte une tâche ouverte, écarte terminée, supprimée et étape', () => {
    expect(isOpenRow(makeTask({ id: 'a' }))).toBe(true);
    expect(isOpenRow(makeTask({ id: 'b', done: true }))).toBe(false);
    expect(isOpenRow(makeTask({ id: 'c', deleted: true }))).toBe(false);
    // Le cas qui a fait mentir les trois compteurs : une matrice de cinq tâches
    // en annonçait six dès qu'on ajoutait une étape.
    expect(isOpenRow(makeTask({ id: 'd', parent_id: 'a' }))).toBe(false);
  });
});

describe('pièces jointes (#78)', () => {
  it('rend les liens d’une tâche, triés, et ignore ceux des autres', () => {
    const all = [
      makeAttachment({ id: 'x', task_id: 't1', position: 1 }),
      makeAttachment({ id: 'y', task_id: 't2', position: 0 }),
      makeAttachment({ id: 'z', task_id: 't1', position: 0 }),
    ];
    expect(attachmentsOf(all, 't1').map((a) => a.id)).toEqual(['z', 'x']);
  });

  it('la pastille porte le nom donné, à défaut le domaine sans « www. »', () => {
    expect(hostLabel(makeAttachment({ label: 'Issue 78' }))).toBe('Issue 78');
    expect(hostLabel(makeAttachment({ url: 'https://www.lemonde.fr/un/article' }))).toBe('lemonde.fr');
    // Un nom fait d’espaces ne vaut pas un nom.
    expect(hostLabel(makeAttachment({ label: '   ', url: 'https://github.com/a/b' }))).toBe('github.com');
  });

  it('refuse tout ce qui n’est pas http(s) — le champ AVANT la base', () => {
    expect(isSafeUrl('https://exemple.test/a')).toBe(true);
    expect(isSafeUrl('http://exemple.test/a')).toBe(true);
    // Celui-là finirait cliquable dans l’app web s’il passait.
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('  JavaScript:alert(1)  ')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>')).toBe(false);
    expect(isSafeUrl('ftp://exemple.test/a')).toBe(false);
    expect(isSafeUrl('pas une url')).toBe(false);
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl(`https://exemple.test/${'a'.repeat(2100)}`)).toBe(false);
  });

  it('complète le schéma manquant, et LUI SEUL', () => {
    expect(normalizeUrl('github.com/x')).toBe('https://github.com/x');
    expect(normalizeUrl('  exemple.test  ')).toBe('https://exemple.test');
    // Un schéma déjà là n’est jamais réécrit : sinon `javascript:` deviendrait
    // `https://javascript:` et passerait la validation au lieu d’être refusé.
    expect(normalizeUrl('http://exemple.test')).toBe('http://exemple.test');
    expect(normalizeUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
    expect(normalizeUrl('')).toBe('');
  });

  it('un schéma exotique complété ne devient pas acceptable pour autant', () => {
    expect(isSafeUrl(normalizeUrl('javascript:alert(1)'))).toBe(false);
    expect(isSafeUrl(normalizeUrl('github.com/x'))).toBe(true);
  });
});

describe('fraîcheur d’une capture en attente (#78)', () => {
  const t0 = 1_700_000_000_000;

  it('accepte ce qui vient d’être déposé, refuse ce qui a vieilli', () => {
    expect(isFreshCapture(t0, t0)).toBe(true);
    expect(isFreshCapture(t0, t0 + CAPTURE_TTL_MS)).toBe(true);
    // Une seconde de trop : le popup a été rouvert à la main, bien plus tard.
    expect(isFreshCapture(t0, t0 + CAPTURE_TTL_MS + 1)).toBe(false);
  });

  it('tolère une horloge remise à l’heure, refuse une date absente', () => {
    // Le brouillon vient forcément d’être écrit : le montrer est le bon choix.
    expect(isFreshCapture(t0 + 60_000, t0)).toBe(true);
    expect(isFreshCapture(Number.NaN, t0)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('échéances (#19)', () => {
  const t0 = 1_700_000_000_000;
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;
  const iso = (ms: number) => new Date(ms).toISOString();
  /** Une tâche datée, à `delta` millisecondes de `t0`. */
  const due = (id: string, delta: number, partial = {}) =>
    makeTask({ id, due_at: iso(t0 + delta), ...partial });

  it('les trois états, et leurs frontières exactes', () => {
    expect(deadlineStatus(null, t0)).toBe(null);
    // L’instant pile : déjà en retard. Une échéance « à maintenant » est due.
    expect(deadlineStatus(iso(t0), t0)).toBe('overdue');
    expect(deadlineStatus(iso(t0 - 1), t0)).toBe('overdue');
    expect(deadlineStatus(iso(t0 + 1), t0)).toBe('soon');
    expect(deadlineStatus(iso(t0 + SOON_MS), t0)).toBe('soon');
    // Une milliseconde de plus, et le signal s’éteint.
    expect(deadlineStatus(iso(t0 + SOON_MS + 1), t0)).toBe('neutral');
  });

  it('une date illisible n’allume pas la case en rouge', () => {
    // Elle peut venir d’un client tiers ou d’une colonne bricolée à la main :
    // la traiter comme « en retard » ferait remonter n’importe quoi en tête.
    expect(deadlineStatus('pas une date', t0)).toBe(null);
    expect(deadlineStatus('', t0)).toBe(null);
    expect(isOverdue(makeTask({ due_at: 'n’importe quoi' }), t0)).toBe(false);
  });

  it('les dépassées remontent, la plus vieille dette en tête', () => {
    const rows = [
      [makeTask({ id: 'sans' })],
      [due('recent', -60_000)],
      [due('futur', +DAY)],
      [due('vieux', -10 * DAY)],
    ];
    const { overdue, rest } = splitOverdue(rows, t0);
    expect(overdue.map((r) => r[0].id)).toEqual(['vieux', 'recent']);
    // Ce qui n’est pas dépassé n’est pas trié : une échéance future ne bouscule
    // personne, elle se contente d’un badge.
    expect(rest.map((r) => r[0].id)).toEqual(['sans', 'futur']);
  });

  it('LE test de ce bloc : `rest` garde l’ordre reçu, donc l’ordre des positions', () => {
    // `insertPosition` moyenne les positions de deux lignes voisines. Si
    // `splitOverdue` réordonnait `rest`, le glisser-déposer déposerait à côté.
    const rows = [
      [makeTask({ id: 'a', position: 0 })],
      [due('retard', -DAY, { position: 1 })],
      [makeTask({ id: 'b', position: 2 })],
      [makeTask({ id: 'c', position: 3 })],
    ];
    const { rest } = splitOverdue(rows, t0);
    expect(strictlyOrdered(rest.flat().map((t) => t.position))).toBe(true);
    expect(rest.flat().map((t) => t.id)).toEqual(['a', 'b', 'c']);
  });

  it('une paire dont une seule carte est dépassée reste entière', () => {
    // Découper sur les cartes la fendrait entre deux zones — l’invariant que #60
    // a coûté cher à établir.
    const paire = [
      makeTask({ id: 'gauche', pair_id: 'p', position: 0 }),
      due('droite', -DAY, { pair_id: 'p', position: 1 }),
    ];
    const { overdue, rest } = splitOverdue([paire, [makeTask({ id: 'seule', position: 2 })]], t0);
    expect(overdue).toHaveLength(1);
    expect(overdue[0].map((t) => t.id)).toEqual(['gauche', 'droite']);
    expect(rest.flat().map((t) => t.id)).toEqual(['seule']);
  });

  it('une dépassée ne se réordonne pas : son rang appartient à son échéance', () => {
    const tasks = [
      makeTask({ id: 'a', position: 0 }),
      due('retard', -DAY, { position: 1 }),
      makeTask({ id: 'b', position: 2 }),
    ];
    const retard = tasks[1];
    expect(planReorder(tasks, retard, -1, t0)).toBe(null);
    expect(planReorder(tasks, retard, 1, t0)).toBe(null);
  });

  it('mais une dépassée ÉPINGLÉE le reste : l’épinglage garde la préséance', () => {
    const tasks = [
      makeTask({ id: 'p1', pinned: true, position: 0 }),
      due('p2', -DAY, { pinned: true, position: 1 }),
    ];
    const plan = planReorder(tasks, tasks[1], -1, t0);
    expect(plan).not.toBe(null);
    expect(plan?.index).toBe(1);
  });

  it('le réordonnancement ignore la zone « en retard » dans son décompte', () => {
    // Trois lignes ordinaires et une dépassée : « descendre » la première
    // ordinaire doit la placer entre `b` et `c`, sans jamais compter la dépassée
    // comme une voisine.
    const tasks = [
      due('retard', -DAY, { position: 0 }),
      makeTask({ id: 'a', position: 1 }),
      makeTask({ id: 'b', position: 2 }),
      makeTask({ id: 'c', position: 3 }),
    ];
    const plan = planReorder(tasks, tasks[1], 1, t0);
    expect(plan?.total).toBe(3);
    expect(plan?.index).toBe(2);
    const position = plan?.writes.find((w) => w.id === 'a')?.patch.position as number;
    expect(position).toBeGreaterThan(2);
    expect(position).toBeLessThan(3);
  });

  it('la vue globale rend les trois zones, matrice par matrice', () => {
    const board = makeBoard({ id: 'b1' });
    const tasks = [
      makeTask({ id: 'epingle', board_id: 'b1', pinned: true, position: 0 }),
      due('retard', -DAY, { board_id: 'b1', position: 1 }),
      makeTask({ id: 'normale', board_id: 'b1', position: 2 }),
    ];
    const [groupe] = groupTasksByBoard(tasks, [board], 'faire', null, t0);
    expect(groupe.pinned.flat().map((t) => t.id)).toEqual(['epingle']);
    expect(groupe.overdue.flat().map((t) => t.id)).toEqual(['retard']);
    expect(groupe.rows.flat().map((t) => t.id)).toEqual(['normale']);
  });

  it('le libellé est relatif tant qu’il se lit, absolu ensuite', () => {
    expect(formatDeadline(iso(t0 - 1), t0)).toBe('en retard');
    expect(formatDeadline(iso(t0 + 30 * 60_000), t0)).toBe('dans 30 min');
    expect(formatDeadline(iso(t0 + 3 * HOUR), t0)).toBe('dans 3 h');
    expect(formatDeadline(iso(t0 + 30 * HOUR), t0)).toBe('demain');
    expect(formatDeadline(iso(t0 + 4 * DAY), t0)).toBe('dans 4 j');
    // Au-delà d’une semaine, « dans 23 j » n’aide plus personne à s’organiser.
    expect(formatDeadline(iso(t0 + 23 * DAY), t0)).toMatch(/^le /);
  });

  it('la saisie locale devient un instant UTC, et se relit à l’identique', () => {
    // L’aller-retour est la seule assertion indépendante du fuseau de la machine
    // qui exécute les tests — et c’est exactement la propriété qui compte.
    const stocke = fromLocalInput('2026-09-03T18:30');
    expect(stocke).not.toBe(null);
    expect(stocke).toMatch(/Z$/);
    expect(toLocalInput(stocke as string)).toBe('2026-09-03T18:30');
  });

  it('un champ vidé retire l’échéance plutôt que d’écrire une date fausse', () => {
    expect(fromLocalInput('')).toBe(null);
    expect(fromLocalInput('   ')).toBe(null);
    expect(fromLocalInput('pas une date')).toBe(null);
    expect(toLocalInput('pas une date')).toBe('');
  });

  it('l’instant stocké ne bouge pas quand le fuseau d’affichage change', () => {
    // Deux écritures du MÊME instant, l’une en UTC, l’autre décalée : le statut
    // et le libellé doivent être identiques. C’est le critère « les échéances
    // passent la frontière de fuseau ».
    const utc = '2026-09-03T16:30:00.000Z';
    const paris = '2026-09-03T18:30:00+02:00';
    expect(Date.parse(utc)).toBe(Date.parse(paris));
    expect(deadlineStatus(utc, t0)).toBe(deadlineStatus(paris, t0));
    expect(toLocalInput(utc)).toBe(toLocalInput(paris));
  });
});
