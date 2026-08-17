import { useCallback, useEffect, useState } from 'react';
import {
  positionBefore,
  type QuadrantKey,
  type Board,
  type Task,
  type TaskPatch,
  type Universe,
} from '@penduline/shared';
import { supabase } from '../lib/supabase';

/** Colonnes de tâche qu'on lit/écrit (l'ordre suit le schéma). */
const TASK_COLS =
  'id, user_id, board_id, title, quadrant, done, pinned, archived, deleted, position, pair_id, created_at, updated_at';

export interface Store {
  ready: boolean;
  universes: Universe[];
  boards: Board[];
  tasks: Task[];
  /** Le nom vient toujours de l'utilisateur : pas de défaut, pas de seed. */
  addBoard: (name: string) => Promise<string | null>;
  renameBoard: (id: string, name: string) => Promise<void>;
  /**
   * Range une matrice dans un univers (`null` = aucun) et la place juste avant
   * `beforeId` de ce groupe ; `beforeId` null = en fin de groupe.
   *
   * Un seul appel pour les deux, parce que c'est un seul geste : déposer une
   * matrice dans un groupe l'y range ET l'y positionne.
   */
  moveBoard: (id: string, universeId: string | null, beforeId: string | null) => Promise<void>;
  addUniverse: (name: string) => Promise<string | null>;
  renameUniverse: (id: string, name: string) => Promise<void>;
  reorderUniverse: (id: string, beforeId: string | null) => Promise<void>;
  /** Les matrices de l'univers SURVIVENT : `on delete set null` les délie. */
  deleteUniverse: (id: string) => Promise<void>;
  /** Supprime la matrice ET ses tâches (cascade assurée par la clé étrangère). */
  deleteBoard: (id: string) => Promise<void>;
  addTask: (boardId: string, quadrant: QuadrantKey, title: string, position: number) => Promise<void>;
  patchTask: (id: string, patch: TaskPatch) => Promise<void>;
  /** Suppression DÉFINITIVE (contrairement au drapeau `deleted`, qui est réversible). */
  purgeTasks: (ids: string[]) => Promise<void>;
  reload: () => Promise<void>;
}

export function useStore(userId: string): Store {
  const [ready, setReady] = useState(false);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async () => {
    const [universesRes, boardsRes, tasksRes] = await Promise.all([
      supabase.from('universes').select('*').order('position'),
      supabase.from('boards').select('*').order('position'),
      supabase.from('tasks').select(TASK_COLS).order('position'),
    ]);

    // Compte vide → on laisse vide. Le découpage appartient à l'utilisateur :
    // semer des exemples imposerait une lecture (naguère : les pièces d'une maison).
    // Aucun univers n'est créé non plus : c'est l'état de tous les comptes au
    // lendemain de la migration, et il doit rester parfaitement utilisable.
    setUniverses(universesRes.data ?? []);
    setBoards(boardsRes.data ?? []);
    setTasks((tasksRes.data as Task[] | null) ?? []);
    setReady(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const addBoard = useCallback(
    async (name: string) => {
      const position = Math.max(0, ...boards.map((r) => r.position)) + 1;
      const { data, error } = await supabase
        .from('boards')
        .insert({ user_id: userId, name, position })
        .select('*')
        .single();
      if (error || !data) return null;
      setBoards((rs) => [...rs, data]);
      return data.id as string;
    },
    [boards, userId],
  );

  const renameBoard = useCallback(async (id: string, name: string) => {
    setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, name } : b)));
    const { error } = await supabase.from('boards').update({ name }).eq('id', id);
    if (error) console.error('[penduline] renameBoard', error.message);
  }, []);

  /**
   * Position fractionnaire, calculée par le helper déjà utilisé pour les tâches
   * (`packages/shared`) : une seule logique d'ordre pour tout le produit.
   *
   * La position d'une matrice est scopée à son univers, exactement comme celle
   * d'une tâche l'est à `(board, quadrant)` — on ne compare donc qu'aux matrices
   * du groupe d'arrivée.
   */
  const moveBoard = useCallback(
    async (id: string, universeId: string | null, beforeId: string | null) => {
      if (id === beforeId) return;
      const position = positionBefore(
        // Le groupe cible, la matrice déplacée exclue : elle ne peut pas servir
        // de repère à son propre déplacement.
        boards.filter((b) => b.universe_id === universeId && b.id !== id),
        beforeId,
      );
      setBoards((bs) =>
        bs
          .map((b) => (b.id === id ? { ...b, universe_id: universeId, position } : b))
          .sort((a, b) => a.position - b.position),
      );
      const { error } = await supabase
        .from('boards')
        .update({ universe_id: universeId, position })
        .eq('id', id);
      if (error) console.error('[penduline] moveBoard', error.message);
    },
    [boards],
  );

  // ── Univers ────────────────────────────────────────────────────────────────
  // Mêmes formes que les fonctions `*Board` : mise à jour optimiste, puis
  // persistance, et une trace en console si l'écriture échoue.
  const addUniverse = useCallback(
    async (name: string) => {
      const position = Math.max(0, ...universes.map((u) => u.position)) + 1;
      const { data, error } = await supabase
        .from('universes')
        .insert({ user_id: userId, name, position })
        .select('*')
        .single();
      if (error || !data) {
        console.error('[penduline] addUniverse', error?.message);
        return null;
      }
      setUniverses((us) => [...us, data]);
      return data.id as string;
    },
    [universes, userId],
  );

  const renameUniverse = useCallback(async (id: string, name: string) => {
    setUniverses((us) => us.map((u) => (u.id === id ? { ...u, name } : u)));
    const { error } = await supabase.from('universes').update({ name }).eq('id', id);
    if (error) console.error('[penduline] renameUniverse', error.message);
  }, []);

  const reorderUniverse = useCallback(
    async (id: string, beforeId: string | null) => {
      if (id === beforeId) return;
      const position = positionBefore(universes.filter((u) => u.id !== id), beforeId);
      setUniverses((us) =>
        us.map((u) => (u.id === id ? { ...u, position } : u)).sort((a, b) => a.position - b.position),
      );
      const { error } = await supabase.from('universes').update({ position }).eq('id', id);
      if (error) console.error('[penduline] reorderUniverse', error.message);
    },
    [universes],
  );

  const deleteUniverse = useCallback(
    async (id: string) => {
      // `on delete set null` suffirait à faire survivre les matrices — mais pas
      // à les ranger. Les positions étant scopées par univers, les libérées
      // arriveraient avec des positions qui COLLISIONNENT avec celles déjà sans
      // univers, et s'intercalleraient dans un ordre arbitraire.
      // On les renumérote donc explicitement à la suite, avant de supprimer.
      const freed = boards.filter((b) => b.universe_id === id).sort((a, b) => a.position - b.position);
      const loose = boards.filter((b) => b.universe_id === null);
      let next = loose.length ? Math.max(...loose.map((b) => b.position)) + 1 : 0;
      const moved = freed.map((b) => ({ id: b.id, position: next++ }));

      setUniverses((us) => us.filter((u) => u.id !== id));
      setBoards((bs) =>
        bs
          .map((b) => {
            const m = moved.find((x) => x.id === b.id);
            return m ? { ...b, universe_id: null, position: m.position } : b;
          })
          .sort((a, b) => a.position - b.position),
      );

      for (const m of moved) {
        const { error } = await supabase
          .from('boards')
          .update({ universe_id: null, position: m.position })
          .eq('id', m.id);
        if (error) console.error('[penduline] deleteUniverse/board', error.message);
      }
      const { error } = await supabase.from('universes').delete().eq('id', id);
      if (error) console.error('[penduline] deleteUniverse', error.message);
    },
    [boards],
  );

  const deleteBoard = useCallback(async (id: string) => {
    // Les tâches partent avec la matrice : `tasks.board_id` porte un
    // `on delete cascade`. On nettoie l'état local en conséquence.
    setBoards((bs) => bs.filter((b) => b.id !== id));
    setTasks((ts) => ts.filter((t) => t.board_id !== id));
    const { error } = await supabase.from('boards').delete().eq('id', id);
    if (error) console.error('[penduline] deleteBoard', error.message);
  }, []);

  const addTask = useCallback(
    async (boardId: string, quadrant: QuadrantKey, title: string, position: number) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({ user_id: userId, board_id: boardId, title, quadrant, position })
        .select(TASK_COLS)
        .single();
      if (error || !data) return;
      setTasks((ts) => [...ts, data as Task]);
    },
    [userId],
  );

  const patchTask = useCallback(async (id: string, patch: TaskPatch) => {
    // Optimiste : on applique localement, puis on persiste.
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from('tasks').update(patch).eq('id', id);
    if (error) console.error('[penduline] patchTask', error.message);
  }, []);

  const purgeTasks = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setTasks((ts) => ts.filter((t) => !ids.includes(t.id)));
    const { error } = await supabase.from('tasks').delete().in('id', ids);
    if (error) console.error('[penduline] purgeTasks', error.message);
  }, []);

  return {
    ready,
    boards,
    tasks,
    universes,
    addBoard,
    renameBoard,
    moveBoard,
    deleteBoard,
    addUniverse,
    renameUniverse,
    reorderUniverse,
    deleteUniverse,
    addTask,
    patchTask,
    purgeTasks,
    reload: load,
  };
}

