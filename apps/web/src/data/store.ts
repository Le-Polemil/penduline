import { useCallback, useEffect, useState } from 'react';
import type { QuadrantKey, Board, Task, TaskPatch } from '@penduline/shared';
import { supabase } from '../lib/supabase';

/** Colonnes de tâche qu'on lit/écrit (l'ordre suit le schéma). */
const TASK_COLS =
  'id, user_id, board_id, title, quadrant, done, pinned, archived, deleted, position, pair_id, created_at, updated_at';

export interface Store {
  ready: boolean;
  boards: Board[];
  tasks: Task[];
  /** Le nom vient toujours de l'utilisateur : pas de défaut, pas de seed. */
  addBoard: (name: string) => Promise<string | null>;
  addTask: (boardId: string, quadrant: QuadrantKey, title: string, position: number) => Promise<void>;
  patchTask: (id: string, patch: TaskPatch) => Promise<void>;
  reload: () => Promise<void>;
}

export function useStore(userId: string): Store {
  const [ready, setReady] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async () => {
    const [boardsRes, tasksRes] = await Promise.all([
      supabase.from('boards').select('*').order('position'),
      supabase.from('tasks').select(TASK_COLS).order('position'),
    ]);

    // Compte vide → on laisse vide. Le découpage appartient à l'utilisateur :
    // semer des exemples imposerait une lecture (naguère : les pièces d'une maison).
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

  return { ready, boards, tasks, addBoard, addTask, patchTask, reload: load };
}

