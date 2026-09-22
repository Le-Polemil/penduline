import {
  type Board,
  type BoardPlacement,
  type BoardRange,
  type QuadrantKey,
  type Task,
  type TaskWrite,
  type Universe,
  endPosition,
  isOpenRow,
  planPairDetach,
  planPairMove,
  visibleTasks,
} from '@penduline/shared';
import type { Db } from '../db';

/**
 * Les neuf outils.
 *
 * ⚠️ RÈGLE UNIQUE DE CE FICHIER : **toute écriture passe par
 * `packages/shared/src/layout.ts`.** C'est là que vivent l'appairage, les
 * positions fractionnaires et la sortie d'une tâche. Réécrire ces règles ici
 * serait exactement le défaut que la story doit éviter — il s'est déjà produit
 * une fois entre le web et le popup, corrigé d'un côté et oublié de l'autre
 * pendant plusieurs jours.
 *
 * Les outils ne font donc que trois choses : lire ce dont la règle a besoin,
 * appeler la règle, écrire ce qu'elle a rendu.
 */

export interface Contexte {
  db: Db;
  userId: string;
}

export class ToolError extends Error {}

/** Colonnes lues sur une tâche. `origin` comprise, que l'agent pose lui-même. */
const TASK_COLS =
  'id, author_id, board_id, title, quadrant, done, archived, deleted, position, pair_id, parent_id, due_at, focus_day, origin, created_at, updated_at, quadrant_changed_at, completed_at, completed_by';

async function toutesLesTaches(ctx: Contexte, boardIds: string[]): Promise<Task[]> {
  const par = await Promise.all(
    [...new Set(boardIds)].map((id) =>
      ctx.db.asUser(ctx.userId).selectAll<Task>('tasks', {
        board_id: `eq.${id}`,
        select: TASK_COLS,
      }),
    ),
  );
  return par.flat();
}

async function laTache(ctx: Contexte, taskId: string): Promise<Task> {
  const [tache] = await ctx.db
    .asUser(ctx.userId)
    .select<Task>('tasks', { id: `eq.${taskId}`, select: TASK_COLS, limit: '1' });
  // Une tâche d'un autre compte est invisible sous RLS : elle arrive ici comme
  // une tâche inexistante, et c'est exactement ce qu'il faut répondre.
  if (!tache) throw new ToolError(`tâche introuvable : ${taskId}`);
  return tache;
}

async function appliquer(ctx: Contexte, writes: TaskWrite[]): Promise<void> {
  for (const { id, patch } of writes) {
    await ctx.db.asUser(ctx.userId).update('tasks', { id: `eq.${id}` }, patch);
  }
}

// ── Lectures ─────────────────────────────────────────────────────────────────

export async function listUniverses(ctx: Contexte): Promise<Universe[]> {
  return ctx.db
    .asUser(ctx.userId)
    .selectAll<Universe>('universes', { select: '*', order: 'position.asc' });
}

export async function listBoards(
  ctx: Contexte,
  args: { universe_id?: string },
): Promise<BoardRange[]> {
  // ⚠️ Deux tables depuis #53 : la matrice ne porte plus son rangement, qui est
  // PERSONNEL (`board_placements`). L'agent voit donc aussi les matrices
  // partagées avec lui — la RLS décide, et c'est cohérent : ce sont des matrices
  // qu'il peut lire.
  //
  // Le filtre par univers se fait sur le PLACEMENT, pas sur la matrice : c'est
  // lui qui sait dans quel univers CETTE personne l'a rangée.
  const [matrices, placements] = await Promise.all([
    ctx.db.asUser(ctx.userId).selectAll<Board>('boards', { select: '*' }),
    ctx.db.asUser(ctx.userId).selectAll<BoardPlacement>('board_placements', {
      select: '*',
      order: 'position.asc',
      ...(args.universe_id ? { universe_id: `eq.${args.universe_id}` } : {}),
    }),
  ]);
  const parBoard = new Map(placements.map((p) => [p.board_id, p]));
  return matrices
    .flatMap((b) => {
      const p = parBoard.get(b.id);
      // Pas de placement = hors périmètre (filtré par univers, ou révoquée).
      return p
        ? [{ ...b, universe_id: p.universe_id, position: p.position, role: null, partagee: false }]
        : [];
    })
    .sort((a, b) => a.position - b.position);
}

export interface ListTasksArgs {
  board_id: string;
  quadrant?: QuadrantKey;
  /** Tout rendre : terminées, supprimées et étapes comprises. */
  tout?: boolean;
}

export async function listTasks(ctx: Contexte, args: ListTasksArgs): Promise<Task[]> {
  // `selectAll` et non `select` : PostgREST tronque à 1000 lignes sans rien dire
  // (#40), et un agent qui répond sur une vue amputée ne signale rien non plus.
  const taches = await toutesLesTaches(ctx, [args.board_id]);
  const gardees = args.tout ? taches : taches.filter(isOpenRow);
  return gardees
    .filter((t) => !args.quadrant || t.quadrant === args.quadrant)
    .sort((a, b) => a.position - b.position);
}

// ── Créations ────────────────────────────────────────────────────────────────

export async function createUniverse(ctx: Contexte, args: { name: string }): Promise<Universe> {
  const existants = await listUniverses(ctx);
  const [cree] = await ctx.db.asUser(ctx.userId).insert<Universe>('universes', [
    {
      user_id: ctx.userId,
      name: args.name,
      position: endPosition(existants),
      origin: 'agent',
    },
  ]);
  return cree;
}

export async function createBoard(
  ctx: Contexte,
  args: { name: string; universe_id?: string },
): Promise<BoardRange> {
  const [creee] = await ctx.db.asUser(ctx.userId).insert<Board>('boards', [
    {
      user_id: ctx.userId,
      name: args.name,
      origin: 'agent',
    },
  ]);
  // Le placement est posé par le trigger `boards_placement_proprietaire`, hors
  // univers et en fin de liste. Si l'agent a demandé un univers, on ne fait que
  // le RANGER — on ne recalcule pas la position, que la base vient de donner.
  if (args.universe_id) {
    await ctx.db
      .asUser(ctx.userId)
      .update<BoardPlacement>(
        'board_placements',
        { board_id: `eq.${creee.id}`, user_id: `eq.${ctx.userId}` },
        { universe_id: args.universe_id },
      );
  }
  const [range] = await ctx.db
    .asUser(ctx.userId)
    .select<BoardPlacement>('board_placements', { board_id: `eq.${creee.id}`, select: '*' });
  return {
    ...creee,
    universe_id: range?.universe_id ?? null,
    position: range?.position ?? 0,
    role: null,
    partagee: false,
  };
}

export interface CreateTaskArgs {
  board_id: string;
  title: string;
  quadrant?: QuadrantKey;
  parent_id?: string;
  due_at?: string;
}

export async function createTask(ctx: Contexte, args: CreateTaskArgs): Promise<Task> {
  const taches = await toutesLesTaches(ctx, [args.board_id]);

  let quadrant: QuadrantKey = args.quadrant ?? 'parking';
  let parent: Task | undefined;

  if (args.parent_id) {
    parent = taches.find((t) => t.id === args.parent_id) ?? (await laTache(ctx, args.parent_id));
    // Le `tasks_depth_guard` refuserait en base, sur un message qui parlerait de
    // trigger. Le dire ici rend l'erreur lisible par celui qui l'a provoquée.
    if (parent.parent_id) {
      throw new ToolError(
        'profondeur maximale : une étape ne peut pas en avoir. Rattachez-la au parent de premier niveau.',
      );
    }
    // Une étape n'a pas de case propre : son classement est celui du parent (#50).
    quadrant = parent.quadrant;
  }

  // La position se calcule sur les VISIBLES de la case d'arrivée, pas sur toutes
  // les lignes : une tâche cochée ou supprimée n'est plus un repère.
  const position = endPosition(
    parent
      ? taches.filter((t) => t.parent_id === parent!.id && !t.deleted)
      : visibleTasks(taches, args.board_id, quadrant),
  );

  const [creee] = await ctx.db.asUser(ctx.userId).insert<Task>('tasks', [
    {
      author_id: ctx.userId,
      board_id: args.board_id,
      title: args.title,
      quadrant,
      parent_id: args.parent_id ?? null,
      due_at: args.due_at ?? null,
      position,
      origin: 'agent',
    },
  ]);
  return creee;
}

// ── Modifications ────────────────────────────────────────────────────────────

export interface UpdateTaskArgs {
  task_id: string;
  title?: string;
  due_at?: string | null;
}

/**
 * ⚠️ N'emploie SURTOUT PAS `planPairPatch`.
 *
 * `planPairPatch` applique le même patch aux deux moitiés d'une paire : il est
 * fait pour ce qui appartient à la paire entière — la case, la matrice. Un titre
 * et une échéance n'appartiennent qu'à une tâche ; les propager renommerait la
 * partenaire au passage.
 */
export async function updateTask(ctx: Contexte, args: UpdateTaskArgs): Promise<Task> {
  const tache = await laTache(ctx, args.task_id);

  const patch: Record<string, unknown> = {};
  if (args.title !== undefined) patch.title = args.title;
  if (args.due_at !== undefined) patch.due_at = args.due_at;
  if (Object.keys(patch).length === 0) return tache;

  const [modifiee] = await ctx.db
    .asUser(ctx.userId)
    .update<Task>('tasks', { id: `eq.${tache.id}` }, patch);
  return modifiee;
}

export interface MoveTaskArgs {
  task_id: string;
  quadrant?: QuadrantKey;
  board_id?: string;
}

/**
 * ⚠️ N'écrit JAMAIS `quadrant_changed_at`.
 *
 * La base le tient par trigger, et c'est sur lui que la revue s'appuie pour
 * signaler une tâche qui stagne. L'écrire à la main le ferait mentir.
 */
export async function moveTask(ctx: Contexte, args: MoveTaskArgs): Promise<TaskWrite[]> {
  const tache = await laTache(ctx, args.task_id);
  if (tache.parent_id) {
    throw new ToolError("une étape suit son parent : déplacez le parent, pas l'étape.");
  }

  const boardId = args.board_id ?? tache.board_id;
  const quadrant = args.quadrant ?? tache.quadrant;
  const taches = await toutesLesTaches(ctx, [tache.board_id, boardId]);

  const writes = planPairMove(
    taches,
    tache,
    { quadrant, board_id: boardId },
    endPosition(visibleTasks(taches, boardId, quadrant)),
  );
  await appliquer(ctx, writes);
  return writes;
}

/**
 * Terminer une tâche.
 *
 * `planPairDetach` avec `done` ET `archived` dans le MÊME patch : l'application
 * les écrit en deux temps parce qu'elle offre quatre secondes pour annuler, et
 * cette fenêtre n'a aucun sens pour un agent. Un seul write portant l'état final
 * évite de laisser une tâche `done` sans `archived` — l'état précisément
 * corrigé par #75.
 *
 * Le lien de paire se défait, des deux côtés : la partenaire reste, seule.
 */
export async function completeTask(ctx: Contexte, args: { task_id: string }): Promise<TaskWrite[]> {
  const tache = await laTache(ctx, args.task_id);
  const taches = await toutesLesTaches(ctx, [tache.board_id]);

  const writes = planPairDetach(taches, tache, { done: true, archived: true });
  await appliquer(ctx, writes);
  return writes;
}
