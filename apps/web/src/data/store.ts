import { useCallback, useEffect, useState } from 'react';
import type { QuadrantKey, Room, Task, TaskPatch } from '@penduline/shared';
import { supabase } from '../lib/supabase';

/** Colonnes de tâche qu'on lit/écrit (l'ordre suit le schéma). */
const TASK_COLS =
  'id, user_id, room_id, title, quadrant, done, pinned, archived, deleted, position, pair_id, created_at, updated_at';

/** Données seed créées au premier lancement d'un compte vide (comme la maquette). */
const SEED: { name: string; tasks: { title: string; quadrant: QuadrantKey; pinned?: boolean }[] }[] = [
  {
    name: 'Cuisine',
    tasks: [
      { title: "Fuite sous l'évier", quadrant: 'faire', pinned: true },
      { title: 'Ampoule grillée', quadrant: 'faire' },
      { title: 'Repeindre le plafond', quadrant: 'planifier' },
      { title: 'Détartrer la bouilloire', quadrant: 'planifier' },
      { title: 'Appeler le plombier', quadrant: 'deleguer' },
      { title: 'Trier le tiroir à sacs', quadrant: 'eliminer' },
      { title: 'Acheter un nouveau grille-pain ?', quadrant: 'parking' },
    ],
  },
  {
    name: 'Salle de bain',
    tasks: [
      { title: 'Joint de douche à refaire', quadrant: 'faire' },
      { title: 'Remplacer le miroir', quadrant: 'planifier' },
    ],
  },
  { name: 'Salon', tasks: [{ title: "Fixer l'étagère", quadrant: 'planifier' }] },
  { name: 'Garage', tasks: [] },
];

export interface Store {
  ready: boolean;
  rooms: Room[];
  tasks: Task[];
  addRoom: (name?: string) => Promise<string | null>;
  addTask: (roomId: string, quadrant: QuadrantKey, title: string, position: number) => Promise<void>;
  patchTask: (id: string, patch: TaskPatch) => Promise<void>;
  reload: () => Promise<void>;
}

export function useStore(userId: string): Store {
  const [ready, setReady] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  const load = useCallback(async () => {
    const [roomsRes, tasksRes] = await Promise.all([
      supabase.from('rooms').select('*').order('position'),
      supabase.from('tasks').select(TASK_COLS).order('position'),
    ]);

    let loadedRooms = roomsRes.data ?? [];
    let loadedTasks = (tasksRes.data as Task[] | null) ?? [];

    // Premier lancement : compte vide → on sème les pièces d'exemple.
    if (!roomsRes.error && loadedRooms.length === 0) {
      const seeded = await seed(userId);
      loadedRooms = seeded.rooms;
      loadedTasks = seeded.tasks;
    }

    setRooms(loadedRooms);
    setTasks(loadedTasks);
    setReady(true);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addRoom = useCallback(
    async (name = 'Nouvelle pièce') => {
      const position = Math.max(0, ...rooms.map((r) => r.position)) + 1;
      const { data, error } = await supabase
        .from('rooms')
        .insert({ user_id: userId, name, position })
        .select('*')
        .single();
      if (error || !data) return null;
      setRooms((rs) => [...rs, data]);
      return data.id as string;
    },
    [rooms, userId],
  );

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
    // Optimiste : on applique localement, puis on persiste.
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    const { error } = await supabase.from('tasks').update(patch).eq('id', id);
    if (error) console.error('[penduline] patchTask', error.message);
  }, []);

  return { ready, rooms, tasks, addRoom, addTask, patchTask, reload: load };
}

async function seed(userId: string): Promise<{ rooms: Room[]; tasks: Task[] }> {
  const roomRows = SEED.map((r, i) => ({ user_id: userId, name: r.name, position: i }));
  const { data: createdRooms, error } = await supabase.from('rooms').insert(roomRows).select('*');
  if (error || !createdRooms) return { rooms: [], tasks: [] };

  const taskRows = createdRooms.flatMap((room) => {
    const spec = SEED.find((s) => s.name === room.name);
    return (spec?.tasks ?? []).map((t, i) => ({
      user_id: userId,
      room_id: room.id,
      title: t.title,
      quadrant: t.quadrant,
      pinned: t.pinned ?? false,
      position: i,
    }));
  });

  let createdTasks: Task[] = [];
  if (taskRows.length) {
    const { data } = await supabase.from('tasks').insert(taskRows).select(TASK_COLS);
    createdTasks = (data as Task[] | null) ?? [];
  }
  return {
    rooms: [...createdRooms].sort((a, b) => a.position - b.position),
    tasks: createdTasks,
  };
}
