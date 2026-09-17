import type { Task } from '@penduline/shared';
import { describe, expect, it } from 'vitest';
import { fausseDb } from '../test-doubles';
import {
  ToolError,
  completeTask,
  createBoard,
  createTask,
  createUniverse,
  listTasks,
  moveTask,
  updateTask,
} from './tools';

const UTILISATEUR = '11111111-1111-4111-8111-111111111111';
const MATRICE = 'board-1';
const AUTRE_MATRICE = 'board-2';

function tache(over: Partial<Task> & { id: string }): Task {
  return {
    user_id: UTILISATEUR,
    board_id: MATRICE,
    title: 'une tâche',
    quadrant: 'faire',
    done: false,
    archived: false,
    deleted: false,
    position: 0,
    pair_id: null,
    parent_id: null,
    due_at: null,
    focus_day: null,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    quadrant_changed_at: '2026-09-01T00:00:00Z',
    ...over,
  } as Task;
}

function contexte(taches: Task[] = [], autres: Record<string, object[]> = {}) {
  const { db, contenu } = fausseDb({ tasks: [...taches], ...autres });
  return { ctx: { db, userId: UTILISATEUR }, contenu };
}

/** Les lignes `tasks` de la doublure, relues comme des tâches. */
const lignes = (contenu: Record<string, unknown[]>) => contenu.tasks as Task[];

describe('list_tasks', () => {
  const taches = [
    tache({ id: 'b', position: 2 }),
    tache({ id: 'a', position: 1 }),
    tache({ id: 'faite', position: 3, done: true }),
    tache({ id: 'etape', position: 4, parent_id: 'a' }),
    tache({ id: 'ailleurs', position: 5, board_id: AUTRE_MATRICE }),
    tache({ id: 'parking', position: 6, quadrant: 'parking' }),
  ];

  it('ne rend que les tâches OUVERTES de la matrice, triées par position', async () => {
    const { ctx } = contexte(taches);

    const rendues = await listTasks(ctx, { board_id: MATRICE });

    expect(rendues.map((t) => t.id)).toEqual(['a', 'b', 'parking']);
  });

  it('`tout` rend aussi les terminées et les étapes', async () => {
    const { ctx } = contexte(taches);

    const rendues = await listTasks(ctx, { board_id: MATRICE, tout: true });

    expect(rendues.map((t) => t.id)).toContain('faite');
    expect(rendues.map((t) => t.id)).toContain('etape');
  });

  it('filtre sur une case', async () => {
    const { ctx } = contexte(taches);

    const rendues = await listTasks(ctx, { board_id: MATRICE, quadrant: 'parking' });

    expect(rendues.map((t) => t.id)).toEqual(['parking']);
  });
});

describe('créations', () => {
  it('un univers se pose en FIN de liste, et se marque `agent`', async () => {
    const { ctx, contenu } = contexte([], { universes: [{ id: 'u1', position: 4 }] });

    const cree = await createUniverse(ctx, { name: 'Maison' });

    expect(cree.position).toBe(5);
    expect(contenu.universes.at(-1)).toMatchObject({
      name: 'Maison',
      origin: 'agent',
      user_id: UTILISATEUR,
    });
  });

  it('une matrice aussi, et accepte de n’être rangée nulle part', async () => {
    const { ctx, contenu } = contexte([], { boards: [{ id: 'b1', position: 0 }] });

    await createBoard(ctx, { name: 'Cuisine' });

    expect(contenu.boards.at(-1)).toMatchObject({
      name: 'Cuisine',
      origin: 'agent',
      universe_id: null,
      position: 1,
    });
  });

  it('une tâche sans case va au parking « à trier »', async () => {
    const { ctx, contenu } = contexte();

    await createTask(ctx, { board_id: MATRICE, title: 'Ranger' });

    expect(contenu.tasks[0]).toMatchObject({ quadrant: 'parking', origin: 'agent', position: 0 });
  });

  it('se place après les VISIBLES de sa case, pas après les cochées', async () => {
    const { ctx, contenu } = contexte([
      tache({ id: 'a', position: 0 }),
      tache({ id: 'b', position: 1 }),
      // Une tâche cochée n'est plus un repère : elle ne doit pas pousser la suivante.
      tache({ id: 'faite', position: 9, done: true }),
      // Une autre case ne compte pas non plus.
      tache({ id: 'autre-case', position: 20, quadrant: 'planifier' }),
    ]);

    await createTask(ctx, { board_id: MATRICE, title: 'Nouvelle', quadrant: 'faire' });

    expect(contenu.tasks.at(-1)!.position).toBe(2);
  });

  it('une étape hérite de la case de son parent', async () => {
    const { ctx, contenu } = contexte([tache({ id: 'parent', quadrant: 'planifier' })]);

    await createTask(ctx, {
      board_id: MATRICE,
      title: 'Étape',
      parent_id: 'parent',
      // Demandée explicitement, et pourtant ignorée : la case appartient au parent.
      quadrant: 'eliminer',
    });

    expect(contenu.tasks.at(-1)).toMatchObject({ parent_id: 'parent', quadrant: 'planifier' });
  });

  it('refuse une étape d’étape AVANT la base, pour rendre l’erreur lisible', async () => {
    const { ctx, contenu } = contexte([
      tache({ id: 'parent' }),
      tache({ id: 'etape', parent_id: 'parent' }),
    ]);

    await expect(
      createTask(ctx, { board_id: MATRICE, title: 'Trop profond', parent_id: 'etape' }),
    ).rejects.toThrow(/profondeur maximale/i);
    expect(contenu.tasks).toHaveLength(2);
  });
});

describe('update_task', () => {
  it('ne touche QUE la tâche visée, jamais sa partenaire', async () => {
    const { ctx, contenu } = contexte([
      tache({ id: 'a', pair_id: 'p', title: 'Gauche' }),
      tache({ id: 'b', pair_id: 'p', title: 'Droite', position: 1 }),
    ]);

    await updateTask(ctx, { task_id: 'a', title: 'Gauche renommée' });

    expect(lignes(contenu).find((t) => t.id === 'a')!.title).toBe('Gauche renommée');
    expect(lignes(contenu).find((t) => t.id === 'b')!.title).toBe('Droite');
  });

  it('retire une échéance quand on lui passe `null`', async () => {
    const { ctx, contenu } = contexte([tache({ id: 'a', due_at: '2026-10-01T00:00:00Z' })]);

    await updateTask(ctx, { task_id: 'a', due_at: null });

    expect(lignes(contenu)[0].due_at).toBeNull();
  });

  it('refuse une tâche introuvable — y compris celle d’un autre compte', async () => {
    const { ctx } = contexte();
    await expect(updateTask(ctx, { task_id: 'inconnue', title: 'x' })).rejects.toThrow(ToolError);
  });
});

describe('move_task', () => {
  it('emmène la partenaire, et la range JUSTE derrière', async () => {
    const { ctx, contenu } = contexte([
      tache({ id: 'a', pair_id: 'p', quadrant: 'parking', position: 0 }),
      tache({ id: 'b', pair_id: 'p', quadrant: 'parking', position: 1 }),
      tache({ id: 'deja-la', quadrant: 'faire', position: 7 }),
    ]);

    const writes = await moveTask(ctx, { task_id: 'a', quadrant: 'faire' });

    expect(writes).toHaveLength(2);
    const deplacee = lignes(contenu).find((t) => t.id === 'a')!;
    const partenaire = lignes(contenu).find((t) => t.id === 'b')!;
    expect(deplacee.quadrant).toBe('faire');
    expect(partenaire.quadrant).toBe('faire');
    expect(partenaire.position).toBeGreaterThan(deplacee.position);
  });

  it("n'écrit JAMAIS `quadrant_changed_at` — le trigger le tient", async () => {
    const { ctx } = contexte([tache({ id: 'a', quadrant: 'parking' })]);

    const writes = await moveTask(ctx, { task_id: 'a', quadrant: 'faire' });

    for (const w of writes) expect(w.patch).not.toHaveProperty('quadrant_changed_at');
  });

  it('change de matrice, et recalcule la position sur la DESTINATION', async () => {
    const { ctx, contenu } = contexte([
      tache({ id: 'a', quadrant: 'faire', position: 0 }),
      tache({ id: 'la-bas', board_id: AUTRE_MATRICE, quadrant: 'faire', position: 12 }),
    ]);

    await moveTask(ctx, { task_id: 'a', board_id: AUTRE_MATRICE });

    const deplacee = lignes(contenu).find((t) => t.id === 'a')!;
    expect(deplacee.board_id).toBe(AUTRE_MATRICE);
    expect(deplacee.position).toBe(13);
  });

  it('refuse de déplacer une étape : elle suit son parent', async () => {
    const { ctx } = contexte([tache({ id: 'p' }), tache({ id: 'e', parent_id: 'p' })]);

    await expect(moveTask(ctx, { task_id: 'e', quadrant: 'faire' })).rejects.toThrow(/étape/);
  });
});

describe('complete_task', () => {
  it('écrit `done` ET `archived` dans le MÊME patch', async () => {
    const { ctx, contenu } = contexte([tache({ id: 'a' })]);

    const writes = await completeTask(ctx, { task_id: 'a' });

    expect(writes).toHaveLength(1);
    expect(writes[0].patch).toMatchObject({ done: true, archived: true });
    expect(contenu.tasks[0]).toMatchObject({ done: true, archived: true });
  });

  it('défait le lien de paire DES DEUX CÔTÉS', async () => {
    const { ctx, contenu } = contexte([
      tache({ id: 'a', pair_id: 'p' }),
      tache({ id: 'b', pair_id: 'p', position: 1 }),
    ]);

    await completeTask(ctx, { task_id: 'a' });

    expect(lignes(contenu).find((t) => t.id === 'a')!.pair_id).toBeNull();
    // La partenaire reste ouverte, mais seule — un `pair_id` orphelin fausserait
    // toutes les recherches de partenaire.
    expect(lignes(contenu).find((t) => t.id === 'b')!.pair_id).toBeNull();
    expect(lignes(contenu).find((t) => t.id === 'b')!.done).toBe(false);
  });
});
