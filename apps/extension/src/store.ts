import { useCallback, useEffect, useState } from 'react';
import { classifyWriteFailure, isSafeUrl, normalizeUrl } from '@penduline/shared';
import type { QuadrantKey, Board, Task, TaskPatch, Universe } from '@penduline/shared';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { useToast } from './toast';

const TASK_COLS =
  'id, user_id, board_id, title, quadrant, done, pinned, archived, deleted, position, pair_id, parent_id, due_at, focus_day, created_at, updated_at';

export interface ExtStore {
  ready: boolean;
  /** Lecture seule : créer et ranger des univers reste l'affaire du web. */
  universes: Universe[];
  boards: Board[];
  tasks: Task[];
  /** Le nom vient toujours de l'utilisateur : pas de défaut, pas de seed. */
  addBoard: (name: string) => Promise<string | null>;
  addTask: (boardId: string, quadrant: QuadrantKey, title: string, position: number) => Promise<void>;
  /**
   * Capture depuis le formulaire (#78) : la tâche ET son lien, en une fois.
   *
   * `false` = rien n'a été écrit, et le formulaire garde la saisie. Un échec sur
   * le lien seul ne condamne pas la tâche : mieux vaut une tâche sans son lien
   * qu'une capture perdue.
   */
  captureTask: (boardId: string, title: string, position: number, url: string) => Promise<boolean>;
  patchTask: (id: string, patch: TaskPatch) => Promise<void>;
}

/**
 * Le déroulé commun aux écritures, version panneau.
 *
 * Miroir réduit de `apps/web/src/data/persist.ts` : il partage la
 * classification (`classifyWriteFailure`, dans `@penduline/shared`) mais pas le
 * code, l'extension n'ayant ni pile de toasts ni vue à mémoriser. Les trois
 * écritures du panneau sont trop peu nombreuses pour valoir un paquet commun de
 * plus, et une abstraction partagée aurait dû porter les deux hôtes.
 */
interface ExtWriteOp<T> {
  label: string;
  apply?: () => void;
  revert?: () => void;
  write: () => PromiseLike<{ data: T | null; error: PostgrestError | null; status: number }>;
  /** Ce qui reste à faire de la ligne renvoyée. Rejoué au réessai (voir le web). */
  commit?: (data: T) => void;
}

function usePersist() {
  const { show } = useToast();

  return useCallback(
    async function persist<T>(op: ExtWriteOp<T>): Promise<{ ok: boolean; data: T | null }> {
      op.apply?.();
      let { data, error, status } = await op.write();

      // Même raisonnement que côté web (`apps/web/src/data/persist.ts`), et le
      // panneau y est encore plus exposé : il reste ouvert des heures, sans
      // aucun `visibilitychange` pour réveiller le renouvellement automatique.
      if (error && classifyWriteFailure(error, status, op.label).kind === 'session') {
        const { error: refus } = await supabase.auth.refreshSession();
        if (!refus) ({ data, error, status } = await op.write());
      }

      if (!error) {
        if (data !== null) op.commit?.(data);
        return { ok: true, data };
      }

      op.revert?.();
      const failure = classifyWriteFailure(error, status, op.label);
      console.error(`[penduline] ${op.label}`, status, error.code, error.message);

      // Pas de mémorisation de contexte ici, contrairement au web : le panneau
      // n'a qu'un écran de reprise, déjà géré par `getActiveBoard`.
      if (failure.kind === 'session') void supabase.auth.signOut({ scope: 'local' });

      show({
        message: failure.message,
        tone: 'error',
        action: failure.retryable
          ? { label: 'Réessayer', onClick: () => void persist(op) }
          : undefined,
      });
      return { ok: false, data: null };
    },
    [show],
  );
}

export function useExtStore(userId: string): ExtStore {
  const [ready, setReady] = useState(false);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const persist = usePersist();

  useEffect(() => {
    let alive = true;
    (async () => {
      const [universesRes, boardsRes, tasksRes] = await Promise.all([
        supabase.from('universes').select('*').order('position'),
        supabase.from('boards').select('*').order('position'),
        // `parent_id is null` : une étape n'est pas une ligne de liste (#50).
        // Le panneau n'a pas de corbeille : il filtre déjà `!t.done && !t.deleted`
        // à l'affichage. Ne charger que ça est donc sans conséquence ici — et
        // c'est là que le gain est le plus sensible, ce chargement étant le
        // premier travail à l'ouverture du panneau (#40).
        supabase
          .from('tasks')
          .select(TASK_COLS)
          .eq('done', false)
          .eq('deleted', false)
          .is('parent_id', null)
          .order('position'),
      ]);
      if (!alive) return;
      setUniverses(universesRes.data ?? []);
      setBoards(boardsRes.data ?? []);
      setTasks((tasksRes.data as Task[] | null) ?? []);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  // Miroir de `addBoard` côté web (apps/web/src/data/store.ts) : même calcul de
  // position, même retour d'identifiant pour que l'appelant puisse enchaîner.
  const addBoard = useCallback(
    async (name: string) => {
      const position = Math.max(0, ...boards.map((b) => b.position)) + 1;
      const { data: row } = await persist<Board>({
        label: 'Créer la matrice',
        write: () =>
          supabase.from('boards').insert({ user_id: userId, name, position }).select('*').single(),
        commit: (b) => setBoards((bs) => [...bs, b]),
      });
      return row?.id ?? null;
    },
    [boards, userId, persist],
  );

  const addTask = useCallback(
    async (boardId: string, quadrant: QuadrantKey, title: string, position: number) => {
      await persist<Task>({
        label: 'Créer la tâche',
        write: () =>
          supabase
            .from('tasks')
            .insert({ user_id: userId, board_id: boardId, title, quadrant, position })
            .select(TASK_COLS)
            .single(),
        commit: (t) => setTasks((ts) => [...ts, t]),
      });
    },
    [userId, persist],
  );

  const captureTask = useCallback(
    async (boardId: string, title: string, position: number, url: string) => {
      const { ok, data } = await persist<Task>({
        label: 'Créer la tâche',
        write: () =>
          supabase
            .from('tasks')
            // Ce qui arrive par un canal automatique n'a par définition pas été
            // classé — et « À trier » existe exactement pour ça.
            .insert({ user_id: userId, board_id: boardId, title, quadrant: 'parking', position })
            .select(TASK_COLS)
            .single(),
        commit: (t) => setTasks((ts) => [...ts, t]),
      });
      if (!ok || !data) return false;

      const propre = normalizeUrl(url);
      if (propre && isSafeUrl(propre)) {
        // Volontairement hors de `persist` : son échec ne doit ni annuler la
        // tâche, ni rendre `false` — la capture, elle, a bien eu lieu.
        const { error } = await supabase
          .from('task_attachments')
          .insert({ task_id: data.id, user_id: userId, url: propre, position: 0 });
        if (error) console.error('[penduline] pièce jointe', error.message);
      }
      return true;
    },
    [userId, persist],
  );

  const patchTask = useCallback(
    async (id: string, patch: TaskPatch) => {
      // Même convention que le web : l'état d'avant est capturé DANS la fonction
      // de mise à jour, et restreint aux clés du patch.
      let before: TaskPatch | null = null;
      await persist<null>({
        // Le popup n'a pas le `taskLabel` complet du web — il ne fait pas la
        // moitié des gestes du produit. L'échéance mérite quand même son nom :
        // « Modifier la tâche » ne dirait pas ce qu'on vient de perdre.
        label:
          'due_at' in patch
            ? patch.due_at
              ? 'Fixer l’échéance'
              : 'Retirer l’échéance'
            : 'Modifier la tâche',
        apply: () =>
          setTasks((ts) =>
            ts.map((t) => {
              if (t.id !== id) return t;
              const keys = Object.keys(patch) as (keyof TaskPatch)[];
              before = Object.fromEntries(keys.map((k) => [k, t[k]])) as TaskPatch;
              return { ...t, ...patch };
            }),
          ),
        revert: () => {
          const was = before;
          if (was) setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...was } : t)));
        },
        write: () => supabase.from('tasks').update(patch).eq('id', id),
      });
    },
    [persist],
  );

  return { ready, universes, boards, tasks, addBoard, addTask, captureTask, patchTask };
}
