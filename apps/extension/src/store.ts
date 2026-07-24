import { useCallback, useEffect, useState } from 'react';
import type { QuadrantKey, Room, Task, TaskPatch } from '@penduline/shared';
import { supabase } from './supabase';

const TASK_COLS =
  'id, user_id, room_id, title, quadrant, done, pinned, archived, deleted, position, pair_id, created_at, updated_at';

export interface ExtStore {
  ready: boolean;
  rooms: Room[];
  tasks: Task[];
  addTask: (roomId: string, quadrant: QuadrantKey, title: string, position: number) => Promise<void>;
  patchTask: (id: string, patch: TaskPatch) => Promise<void>;
}

export function useExtStore(userId: string): ExtStore {
  const [ready, setReady] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [roomsRes, tasksRes] = await Promise.all([
        supabase.from('rooms').select('*').order('position'),
        supabase.from('tasks').select(TASK_COLS).order('position'),
      ]);
      if (!alive) return;
      setRooms(roomsRes.data ?? []);
      setTasks((tasksRes.data as Task[] | null) ?? []);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  const addTask = useCallback(
    async (roomId: string, quadrant: QuadrantKey, title: string, position: number) => {
      const { data, error } = await supabase
        .from('tasks')
        .insert({ user_id: userId, room_id: roomId, title, quadrant, position })
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

  return { ready, rooms, tasks, addTask, patchTask };
}

// ── Dernière pièce ouverte (reprise dans le popup, TTL 2 h) ──────────────────
const ACTIVE_KEY = 'penduline-active-room';
const TTL = 2 * 60 * 60 * 1000;

export async function getActiveRoom(): Promise<string | null> {
  try {
    const res = await chrome.storage.local.get(ACTIVE_KEY);
    const v = res[ACTIVE_KEY] as { roomId: string; ts: number } | undefined;
    if (v && Date.now() - v.ts < TTL) return v.roomId;
  } catch {
    /* pas de chrome.storage (ex. preview web) */
  }
  return null;
}

export async function setActiveRoom(roomId: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [ACTIVE_KEY]: { roomId, ts: Date.now() } });
  } catch {
    /* ignore */
  }
}
