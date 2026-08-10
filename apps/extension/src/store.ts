import { useCallback, useEffect, useState } from 'react';
import type { QuadrantKey, Board, Task, TaskPatch } from '@penduline/shared';
import { supabase } from './supabase';

const TASK_COLS =
  'id, user_id, board_id, title, quadrant, done, pinned, archived, deleted, position, pair_id, created_at, updated_at';

export interface ExtStore {
  ready: boolean;
  boards: Board[];
  tasks: Task[];
  addTask: (boardId: string, quadrant: QuadrantKey, title: string, position: number) => Promise<void>;
  patchTask: (id: string, patch: TaskPatch) => Promise<void>;
}

export function useExtStore(userId: string): ExtStore {
  const [ready, setReady] = useState(false);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [boardsRes, tasksRes] = await Promise.all([
        supabase.from('boards').select('*').order('position'),
        supabase.from('tasks').select(TASK_COLS).order('position'),
      ]);
      if (!alive) return;
      setBoards(boardsRes.data ?? []);
      setTasks((tasksRes.data as Task[] | null) ?? []);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

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
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from('tasks').update(patch).eq('id', id);
    if (error) console.error('[penduline] patchTask', error.message);
  }, []);

  return { ready, boards, tasks, addTask, patchTask };
}

// ── Dernière matrice ouverte (reprise dans le popup, TTL 2 h) ──────────────────
const ACTIVE_KEY = 'penduline-active-board';
const TTL = 2 * 60 * 60 * 1000;

export async function getActiveBoard(): Promise<string | null> {
  try {
    const res = await chrome.storage.local.get(ACTIVE_KEY);
    const v = res[ACTIVE_KEY] as { boardId: string; ts: number } | undefined;
    if (v && Date.now() - v.ts < TTL) return v.boardId;
  } catch {
    /* pas de chrome.storage (ex. preview web) */
  }
  return null;
}

export async function setActiveBoard(boardId: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [ACTIVE_KEY]: { boardId, ts: Date.now() } });
  } catch {
    /* ignore */
  }
}
