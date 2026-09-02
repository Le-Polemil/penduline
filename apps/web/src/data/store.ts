import { useCallback, useEffect, useRef, useState } from 'react';
import {
  endPosition,
  isSafeUrl,
  normalizeUrl,
  positionBefore,
  type QuadrantKey,
  type Attachment,
  type Board,
  type Task,
  type TaskPatch,
  type TaskWrite,
  type Universe,
} from '@penduline/shared';
import { supabase } from '../lib/supabase';
import { useRealtime } from './useRealtime';
import { pop, push, type UndoEntry } from './undo';
import { usePersist, type WriteResult } from './persist';

/**
 * Une tâche a-t-elle sa place dans l'état chargé au démarrage ?
 *
 * Une seule écriture de la règle, pour le chargement (#40) ET pour le temps réel
 * (#39) — sans quoi un événement distant réintroduirait en mémoire les archives
 * que le chargement en a sorties.
 *
 * ⚠️ Elle doit rester le miroir EXACT de la requête de `load`, l'exception des
 * étapes cochées comprise (#50) : sinon le temps réel évacuerait de la mémoire
 * ce que le chargement vient d'y mettre, et un « 3/5 » retomberait à « 0/2 » au
 * premier événement distant.
 */
export function inWorkingSet(t: Task): boolean {
  if (t.deleted) return false;
  return !t.done || !!t.parent_id;
}

/** Taille de page de PostgREST : au-delà, il tronque en silence. */
const PAGE = 1000;

/** Colonnes de pièce jointe qu'on lit/écrit (l'ordre suit le schéma). */
const ATTACHMENT_COLS = 'id, task_id, user_id, url, label, position, created_at';

/** Colonnes de tâche qu'on lit/écrit (l'ordre suit le schéma). */
const TASK_COLS =
  'id, user_id, board_id, title, quadrant, done, pinned, archived, deleted, position, pair_id, parent_id, due_at, created_at, updated_at, quadrant_changed_at';

/** Tout ce qui s'ordonne par position se retrie pareil. */
function byPosition<T extends { position: number }>(a: T, b: T): number {
  return a.position - b.position;
}

/**
 * Les valeurs actuelles d'une tâche, restreintes aux clés que le patch touche.
 *
 * C'est le retour arrière de `patchTask` : remettre la tâche entière écraserait
 * une modification concurrente d'un autre champ.
 */
function previousValues(task: Task, patch: TaskPatch): TaskPatch {
  const keys = Object.keys(patch) as (keyof TaskPatch)[];
  // Un déplacement de case emporte `quadrant_changed_at`, que l'aller n'écrit
  // jamais (le trigger le pose) mais que le retour DOIT restaurer.
  //
  // Sans ça, `Ctrl+Z` rendait la tâche à sa case sans lui rendre son
  // ancienneté : le trigger, voyant la case changer, réécrivait `now()`. Une
  // fausse manœuvre suivie de son annulation faisait donc disparaître la tâche
  // de la revue (#47) pour trente jours — l'inverse de ce que `Ctrl+Z` promet.
  //
  // Le trigger cède devant une valeur explicite, c'est ce qui rend ce retour
  // possible (voir `set_quadrant_changed_at`).
  if ('quadrant' in patch && !keys.includes('quadrant_changed_at')) {
    keys.push('quadrant_changed_at');
  }
  // Le cast est inévitable : `fromEntries` perd la corrélation clé/valeur, que
  // `TaskPatch` porte champ par champ.
  return Object.fromEntries(keys.map((k) => [k, task[k]])) as TaskPatch;
}

/**
 * Nommer le geste à partir du patch, pour que le message d'échec dise quelque
 * chose. `patchTask` est le point de passage de la moitié des interactions du
 * produit : un « Modifier la tâche » générique n'aiderait personne.
 *
 * L'ordre des tests compte — un décochage arrive en `{ done: false,
 * archived: false }`, une restauration depuis la corbeille en
 * `{ done: false, archived: false, deleted: false }`.
 */
function taskLabel(patch: TaskPatch): string {
  if ('title' in patch) return 'Renommer la tâche';
  if ('deleted' in patch) return patch.deleted ? 'Supprimer la tâche' : 'Restaurer la tâche';
  if ('done' in patch) return patch.done ? 'Cocher la tâche' : 'Décocher la tâche';
  if ('archived' in patch) return 'Archiver la tâche';
  if ('board_id' in patch || 'quadrant' in patch || 'position' in patch) return 'Déplacer la tâche';
  if ('pair_id' in patch) return 'Appairer les tâches';
  if ('pinned' in patch) return patch.pinned ? 'Épingler la tâche' : 'Détacher la tâche';
  if ('due_at' in patch) return patch.due_at ? 'Fixer l’échéance' : 'Retirer l’échéance';
  return 'Modifier la tâche';
}

export interface Store {
  ready: boolean;
  universes: Universe[];
  boards: Board[];
  tasks: Task[];
  /** Les liens de toutes les tâches, à plat (#78). */
  attachments: Attachment[];
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
  /** `parentId` : la tâche dont celle-ci est une étape (#50). */
  addTask: (
    boardId: string,
    quadrant: QuadrantKey,
    title: string,
    position: number,
    parentId?: string,
  ) => Promise<void>;
  /**
   * Renvoie `false` si la persistance a échoué — l'état local a alors été
   * rétabli. `useCompletion` s'en sert pour annuler l'archivage d'une tâche
   * dont le cochage n'a pas tenu.
   */
  patchTask: (id: string, patch: TaskPatch) => Promise<boolean>;
  /** Suppression DÉFINITIVE (contrairement au drapeau `deleted`, qui est réversible). */
  purgeTasks: (ids: string[]) => Promise<void>;
  /**
   * Attache un lien à une tâche. `url` est complétée et validée AVANT l'appel —
   * la base refuserait de toute façon ce qui n'est pas `http(s)`.
   */
  addAttachment: (taskId: string, url: string, label?: string) => Promise<boolean>;
  removeAttachment: (id: string) => Promise<void>;

  /**
   * Charge la corbeille des matrices demandées et la FUSIONNE dans `tasks`.
   *
   * Scopé, et idempotent par matrice : rouvrir la même corbeille ne recharge
   * rien. Appelé à l'ouverture, jamais au démarrage — c'est l'objet de #40.
   */
  loadBin: (boardIds: string[]) => Promise<void>;
  /**
   * Groupe toutes les écritures de `fn` en UNE entrée d'annulation.
   *
   * Sans groupement, déplacer une paire — deux `patchTask` — laisserait une
   * moitié de paire en arrière au premier `Ctrl+Z`.
   */
  group: (label: string, fn: () => void) => void;
  undo: () => void;
  redo: () => void;
  /** Vide les deux piles : le contexte a changé, annuler n'aurait plus de sens. */
  clearUndo: () => void;
  /** Ce que `Ctrl+Z` défera, pour l'annoncer. `null` = rien à annuler. */
  undoLabel: string | null;
  redoLabel: string | null;

  /** Ces matrices ont-elles déjà leur corbeille en mémoire ? */
  binLoaded: (boardIds: string[]) => boolean;
  /**
   * Change à chaque écriture susceptible de modifier le contenu de la corbeille.
   * `useBinCount` s'en sert pour redemander son compte — c'est ce qui garde le
   * compteur exact sans jamais additionner deux sources.
   */
  binVersion: number;
  /**
   * Combien d'éléments la corbeille contient pour ces matrices, **sans en
   * charger un seul** (`head: true, count: 'exact'`).
   */
  countBin: (boardIds: string[]) => Promise<number>;
  reload: () => Promise<void>;
}

/**
 * L'état de l'application et ses écritures.
 *
 * Toutes les écritures passent par `persist` (`./persist`) : mise à jour
 * optimiste, persistance, et **retour arrière + toast** si la persistance
 * échoue. Aucune signature n'a changé pour autant — les écrans continuent
 * d'appeler `void store.x()` et de tester le `null` des créations.
 *
 * Convention de retour arrière : l'état d'avant est capturé **dans `apply`**,
 * depuis la fonction de mise à jour elle-même, et non depuis les tableaux du
 * rendu courant. Plusieurs de ces méthodes sont appelées depuis des fermetures
 * qui ont plusieurs secondes (le minuteur d'annulation de `useCompletion`) :
 * lire le rendu de l'époque restaurerait des valeurs périmées.
 *
 * Ça suppose que React ait joué la fonction de mise à jour avant que `revert`
 * ne lise la capture. C'est acquis : entre les deux il y a l'aller-retour
 * réseau de `write()`, quand le rendu, lui, est vidé dès la microtâche
 * suivante. Un `revert` ne lira donc jamais une capture vide — et il se garde
 * quand même contre le cas, plutôt que de restaurer `null`.
 */
export function useStore(userId: string): Store {
  const [ready, setReady] = useState(false);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  /** Les matrices dont la corbeille est déjà en mémoire. En ref : `loadBin` se
   *  garde lui-même sans se re-créer à chaque chargement. */
  const binBoards = useRef(new Set<string>());
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);
  /**
   * Le groupe en cours de constitution.
   *
   * En ref et non en state : `patchTask` y dépose ses inverses pendant que `fn`
   * s'exécute, donc AVANT tout re-rendu. Un state serait lu périmé.
   */
  const collecte = useRef<TaskWrite[] | null>(null);
  /** Pendant une annulation, on n'empile pas — on alimente l'autre pile. */
  const sens = useRef<'normal' | 'undo' | 'redo'>('normal');

  /** Sert à re-rendre après un chargement — la ref, elle, ne le fait pas — et à
   *  signaler qu'un compte de corbeille est peut-être périmé. */
  const [binTick, setBinTick] = useState(0);
  const persist = usePersist();

  /**
   * Toutes les pièces jointes de l'utilisateur, en une passe paginée (#78).
   *
   * ⚠️ La pagination n'est pas une optimisation : PostgREST tronque à 1000
   * lignes SANS RIEN DIRE (#40). Un compte actif dépasse ce seuil, et les liens
   * manquants ne se signaleraient par aucune erreur — juste des cartes nues.
   *
   * Chargées toutes, et non pas seulement celles des tâches en mémoire : filtrer
   * demanderait un `in` de plusieurs milliers d'identifiants dans l'URL. Le
   * volume est de l'ordre du lien par tâche, pas de la ligne par action.
   */
  const loadAttachments = useCallback(async (): Promise<Attachment[]> => {
    const recues: Attachment[] = [];
    for (let debut = 0; ; debut += PAGE) {
      const { data, error } = await supabase
        .from('task_attachments')
        .select(ATTACHMENT_COLS)
        .order('position')
        .range(debut, debut + PAGE - 1);
      if (error || !data) return recues;
      recues.push(...(data as Attachment[]));
      if (data.length < PAGE) break;
    }
    return recues;
  }, []);

  const load = useCallback(async () => {
    const [universesRes, boardsRes, tasksRes, attachmentsRes] = await Promise.all([
      supabase.from('universes').select('*').order('position'),
      supabase.from('boards').select('*').order('position'),
      // ⚠️ On ne charge QUE ce que la grille affiche (#40). Le reste — terminé,
      // supprimé — arrive à l'ouverture de la corbeille, via `loadBin`.
      //
      // Le filtre ne s'invente pas : il est la négation exacte des prédicats de
      // la corbeille (`done && !deleted` et `deleted`) déjà écrits dans les
      // écrans. Le chargement ne respectait pas une règle qui existait déjà.
      //
      // Sans lui, PostgREST plafonnant ses réponses à 1000 lignes, un compte
      // passé ce seuil perdait des tâches OUVERTES en silence : le tri se fait
      // sur `position`, que les archives conservent, donc les deux
      // s'entrelacent. Ce filtre referme ce trou par construction.
      // ⚠️ Une ÉTAPE cochée reste chargée (#50), et c'est la seule exception au
      // filtre ci-dessus : sans elle, un « 3/5 » redevient « 0/2 » au
      // rechargement, et le compteur d'avancement ne veut plus rien dire. Le
      // volume ne rouvre pas le trou de #40 — ce sont quelques lignes par
      // tâche, pas l'historique d'une année.
      //
      // Résidu assumé : les étapes d'un parent TERMINÉ sont chargées elles
      // aussi, alors qu'elles ne s'affichent nulle part. Les en exclure
      // demanderait de filtrer sur l'état du parent, donc une jointure — deux
      // requêtes et une dépendance au nom de la contrainte. À reprendre si le
      // volume le justifie un jour ; il croît en étapes, pas en archives.
      supabase
        .from('tasks')
        .select(TASK_COLS)
        .eq('deleted', false)
        .or('done.eq.false,parent_id.not.is.null')
        .order('position'),
      loadAttachments(),
    ]);

    // Compte vide → on laisse vide. Le découpage appartient à l'utilisateur :
    // semer des exemples imposerait une lecture (naguère : les pièces d'une maison).
    // Aucun univers n'est créé non plus : c'est l'état de tous les comptes au
    // lendemain de la migration, et il doit rester parfaitement utilisable.
    // Le contexte vient de changer sous nos pieds : annuler viserait des états
    // qui n'existent plus. Vider est plus sûr que deviner (#46).
    setUndoStack([]);
    setRedoStack([]);
    setUniverses(universesRes.data ?? []);
    setBoards(boardsRes.data ?? []);
    setTasks((tasksRes.data as Task[] | null) ?? []);
    setAttachments(attachmentsRes);
    setReady(true);
  }, [loadAttachments]);

  useEffect(() => {
    void load();
  }, [load]);

  const addBoard = useCallback(
    async (name: string) => {
      const position = Math.max(0, ...boards.map((r) => r.position)) + 1;
      // Rien à appliquer d'avance : une création n'a pas de ligne à montrer
      // avant que le serveur ne l'ait attribuée. D'où `commit` et non `apply`.
      const { data: row } = await persist<Board>({
        label: 'Créer la matrice',
        write: () =>
          supabase.from('boards').insert({ user_id: userId, name, position }).select('*').single(),
        commit: (b) => setBoards((rs) => [...rs, b]),
      });
      return row?.id ?? null;
    },
    [boards, userId, persist],
  );

  const renameBoard = useCallback(
    async (id: string, name: string) => {
      let before: string | null = null;
      await persist<null>({
        label: 'Renommer la matrice',
        apply: () =>
          setBoards((bs) =>
            bs.map((b) => {
              if (b.id !== id) return b;
              before = b.name;
              return { ...b, name };
            }),
          ),
        revert: () => {
          const was = before;
          if (was !== null) setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, name: was } : b)));
        },
        write: () => supabase.from('boards').update({ name }).eq('id', id),
      });
    },
    [persist],
  );

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
      let before: Pick<Board, 'universe_id' | 'position'> | null = null;
      await persist<null>({
        label: 'Déplacer la matrice',
        apply: () =>
          setBoards((bs) =>
            bs
              .map((b) => {
                if (b.id !== id) return b;
                before = { universe_id: b.universe_id, position: b.position };
                return { ...b, universe_id: universeId, position };
              })
              .sort(byPosition),
          ),
        revert: () => {
          const was = before;
          if (was) setBoards((bs) => bs.map((b) => (b.id === id ? { ...b, ...was } : b)).sort(byPosition));
        },
        write: () =>
          supabase.from('boards').update({ universe_id: universeId, position }).eq('id', id),
      });
    },
    [boards, persist],
  );

  // ── Univers ────────────────────────────────────────────────────────────────
  // Mêmes formes que les fonctions `*Board`.
  const addUniverse = useCallback(
    async (name: string) => {
      const position = Math.max(0, ...universes.map((u) => u.position)) + 1;
      const { data: row } = await persist<Universe>({
        label: "Créer l'univers",
        write: () =>
          supabase.from('universes').insert({ user_id: userId, name, position }).select('*').single(),
        commit: (u) => setUniverses((us) => [...us, u]),
      });
      return row?.id ?? null;
    },
    [universes, userId, persist],
  );

  const renameUniverse = useCallback(
    async (id: string, name: string) => {
      let before: string | null = null;
      await persist<null>({
        label: "Renommer l'univers",
        apply: () =>
          setUniverses((us) =>
            us.map((u) => {
              if (u.id !== id) return u;
              before = u.name;
              return { ...u, name };
            }),
          ),
        revert: () => {
          const was = before;
          if (was !== null) setUniverses((us) => us.map((u) => (u.id === id ? { ...u, name: was } : u)));
        },
        write: () => supabase.from('universes').update({ name }).eq('id', id),
      });
    },
    [persist],
  );

  const reorderUniverse = useCallback(
    async (id: string, beforeId: string | null) => {
      if (id === beforeId) return;
      const position = positionBefore(universes.filter((u) => u.id !== id), beforeId);
      let before: number | null = null;
      await persist<null>({
        label: "Déplacer l'univers",
        apply: () =>
          setUniverses((us) =>
            us
              .map((u) => {
                if (u.id !== id) return u;
                before = u.position;
                return { ...u, position };
              })
              .sort(byPosition),
          ),
        revert: () => {
          const was = before;
          if (was !== null)
            setUniverses((us) =>
              us.map((u) => (u.id === id ? { ...u, position: was } : u)).sort(byPosition),
            );
        },
        write: () => supabase.from('universes').update({ position }).eq('id', id),
      });
    },
    [universes, persist],
  );

  const deleteUniverse = useCallback(
    async (id: string) => {
      // `on delete set null` suffirait à faire survivre les matrices — mais pas
      // à les ranger. Les positions étant scopées par univers, les libérées
      // arriveraient avec des positions qui COLLISIONNENT avec celles déjà sans
      // univers, et s'intercalleraient dans un ordre arbitraire.
      // On les renumérote donc explicitement à la suite, avant de supprimer.
      const doomed = universes.find((u) => u.id === id);
      if (!doomed) return;
      const freed = boards.filter((b) => b.universe_id === id).sort(byPosition);
      const loose = boards.filter((b) => b.universe_id === null);
      let next = loose.length ? Math.max(...loose.map((b) => b.position)) + 1 : 0;
      const moved = freed.map((b) => ({ id: b.id, position: next++ }));

      await persist<null>({
        label: "Supprimer l'univers",
        apply: () => {
          setUniverses((us) => us.filter((u) => u.id !== id));
          setBoards((bs) =>
            bs
              .map((b) => {
                const m = moved.find((x) => x.id === b.id);
                return m ? { ...b, universe_id: null, position: m.position } : b;
              })
              .sort(byPosition),
          );
        },
        // Ici le retour arrière se lit depuis `freed`, pas depuis `apply` : les
        // lignes d'origine sont déjà en main, c'est ce qui a servi à calculer
        // la renumérotation.
        revert: () => {
          setUniverses((us) => (us.some((u) => u.id === id) ? us : [...us, doomed].sort(byPosition)));
          setBoards((bs) =>
            bs
              .map((b) => {
                const f = freed.find((x) => x.id === b.id);
                return f ? { ...b, universe_id: f.universe_id, position: f.position } : b;
              })
              .sort(byPosition),
          );
        },
        // Une séquence, un seul `persist` : le premier échec arrête tout et
        // c'est lui qu'on rapporte.
        write: async (): Promise<WriteResult<null>> => {
          for (const m of moved) {
            const res = await supabase
              .from('boards')
              .update({ universe_id: null, position: m.position })
              .eq('id', m.id);
            if (res.error) return res;
          }
          return await supabase.from('universes').delete().eq('id', id);
        },
      });
    },
    [boards, universes, persist],
  );

  const deleteBoard = useCallback(
    async (id: string) => {
      // Les tâches partent avec la matrice : `tasks.board_id` porte un
      // `on delete cascade`. On nettoie l'état local en conséquence.
      let removed: { board: Board | undefined; tasks: Task[] } = { board: undefined, tasks: [] };
      await persist<null>({
        label: 'Supprimer la matrice',
        apply: () => {
          setBoards((bs) => {
            removed = { ...removed, board: bs.find((b) => b.id === id) };
            return bs.filter((b) => b.id !== id);
          });
          setTasks((ts) => {
            removed = { ...removed, tasks: ts.filter((t) => t.board_id === id) };
            return ts.filter((t) => t.board_id !== id);
          });
        },
        // La matrice ET ses tâches : ne remettre que la matrice la ferait
        // réapparaître vide, ce qui est pire qu'un échec visible.
        revert: () => {
          const { board, tasks: gone } = removed;
          if (board) setBoards((bs) => (bs.some((b) => b.id === id) ? bs : [...bs, board].sort(byPosition)));
          if (gone.length) setTasks((ts) => [...ts, ...gone].sort(byPosition));
        },
        write: () => supabase.from('boards').delete().eq('id', id),
      });
    },
    [persist],
  );

  const addTask = useCallback(
    async (boardId: string, quadrant: QuadrantKey, title: string, position: number, parentId?: string) => {
      await persist<Task>({
        label: 'Créer la tâche',
        write: () =>
          supabase
            .from('tasks')
            .insert({
          user_id: userId,
          board_id: boardId,
          title,
          quadrant,
          position,
          // Une étape hérite de la case de son parent — elle n'en a pas
          // elle-même, mais la colonne n'est pas nullable.
          parent_id: parentId ?? null,
        })
            .select(TASK_COLS)
            .single(),
        commit: (t) => setTasks((ts) => [...ts, t]),
      });
    },
    [userId, persist],
  );

  const patchTask = useCallback(
    async (id: string, patch: TaskPatch) => {
      // ⚠️ Capturé MAINTENANT, de façon synchrone. `group` referme son
      // collecteur dès que `fn` a rendu la main — c'est-à-dire bien avant que
      // cette écriture ne se résolve. Le lire à la fin donnerait toujours `null`,
      // et l'annulation s'afficherait sans rien défaire.
      const collecteur = collecte.current;
      let before: TaskPatch | null = null;
      const { ok } = await persist<null>({
        label: taskLabel(patch),
        apply: () =>
          setTasks((ts) =>
            ts.map((t) => {
              if (t.id !== id) return t;
              before = previousValues(t, patch);
              return { ...t, ...patch };
            }),
          ),
        revert: () => {
          const was = before;
          if (was) setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...was } : t)));
        },
        write: () => supabase.from('tasks').update(patch).eq('id', id),
      });
      // Cocher, décocher, supprimer ou restaurer fait entrer ou sortir une tâche
      // de la corbeille : son compte, pris côté serveur, devient périmé (#40).
      // Bumpé APRÈS l'écriture, pour que la requête suivante lise l'état réel.
      if (ok && ('done' in patch || 'deleted' in patch)) setBinTick((n) => n + 1);

      // L'inverse n'est retenu QUE si l'écriture a tenu (#46). En cas d'échec,
      // `persist` a déjà remis l'état d'avant : empiler ici ferait défaire un
      // geste qui n'a jamais eu lieu — le « troisième état » que #34 évitait.
      if (ok && before && collecteur) collecteur.push({ id, patch: before });
      return ok;
    },
    [persist],
  );

  /**
   * Groupe les écritures de `fn` en une seule entrée d'annulation.
   *
   * ⚠️ `fn` doit être SYNCHRONE. Les écritures partent en asynchrone, mais leurs
   * inverses sont déposés dans `collecte` au retour de chaque `patchTask` — le
   * groupe est donc refermé sur ce qui a été LANCÉ, et complété au fil des
   * réponses. Une écriture qui échoue n'y laisse rien.
   */
  const group = useCallback((label: string, fn: () => void) => {
    const parent = collecte.current;
    const paquet: TaskWrite[] = [];
    collecte.current = paquet;
    try {
      fn();
    } finally {
      collecte.current = parent;
    }
    // Les inverses arrivent après les réponses réseau : on empile l'entrée
    // maintenant, le tableau se remplira tout seul — c'est la même référence.
    if (sens.current === 'undo') setRedoStack((r) => push(r, { label, inverses: paquet }));
    else if (sens.current === 'redo') setUndoStack((u) => push(u, { label, inverses: paquet }));
    else {
      setUndoStack((u) => push(u, { label, inverses: paquet }));
      // Une action neuve rend le rétablissement caduc : il rejouerait une
      // branche d'histoire qu'on vient de quitter.
      setRedoStack([]);
    }
  }, []);

  /** Applique les inverses d'une entrée, en enregistrant le geste dans l'autre pile. */
  const rejouer = useCallback(
    (entry: UndoEntry, direction: 'undo' | 'redo') => {
      sens.current = direction;
      try {
        group(entry.label, () => {
          for (const w of entry.inverses) void patchTask(w.id, w.patch);
        });
      } finally {
        sens.current = 'normal';
      }
    },
    [group, patchTask],
  );

  const undo = useCallback(() => {
    const { rest, entry } = pop(undoStack);
    if (!entry) return;
    setUndoStack(rest);
    rejouer(entry, 'undo');
  }, [undoStack, rejouer]);

  const redo = useCallback(() => {
    const { rest, entry } = pop(redoStack);
    if (!entry) return;
    setRedoStack(rest);
    rejouer(entry, 'redo');
  }, [redoStack, rejouer]);

  const clearUndo = useCallback(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, []);

  /**
   * Charge la corbeille à la demande, et la fusionne dans `tasks`.
   *
   * ⚠️ FUSION, et non seconde liste. `patchTask`, `purgeTasks` et le retour
   * arrière de `persist` opèrent tous sur `tasks` : deux listes obligeraient
   * chacun à savoir laquelle il vise, et à gérer le passage de l'une à l'autre.
   *
   * « Rétablir » le montre à la lettre : `patchTask` fait un `map` sur `tasks`,
   * et un `map` ne crée rien. Sans fusion, la tâche restaurée passerait bien à
   * `deleted: false` en base, puis disparaîtrait de la corbeille sans jamais
   * revenir dans la grille.
   */
  /**
   * Attache un lien (#78). Pas d'écriture optimiste ici : l'identifiant vient du
   * serveur, et une pastille qui apparaîtrait puis disparaîtrait au moindre
   * refus serait plus déroutante que le très court délai d'un aller-retour.
   *
   * `false` en retour dit au champ de saisie de garder ce qu'on avait tapé.
   */
  const addAttachment = useCallback(
    async (taskId: string, url: string, label?: string) => {
      const propre = normalizeUrl(url);
      // La base refuserait, mais avec une erreur SQL opaque : on préfère le dire
      // ici. La validation côté client N'EST PAS la barrière — le `check` l'est.
      if (!isSafeUrl(propre)) return false;
      const position = endPosition(attachments.filter((a) => a.task_id === taskId));
      const { ok } = await persist<Attachment>({
        label: 'Ajouter le lien',
        write: () =>
          supabase
            .from('task_attachments')
            .insert({
              task_id: taskId,
              user_id: userId,
              url: propre,
              label: label?.trim() || null,
              position,
            })
            .select(ATTACHMENT_COLS)
            .single(),
        commit: (a) => setAttachments((as) => [...as, a]),
      });
      return ok;
    },
    [attachments, userId, persist],
  );

  const removeAttachment = useCallback(
    async (id: string) => {
      let retire: Attachment | undefined;
      await persist<null>({
        label: 'Supprimer le lien',
        apply: () =>
          setAttachments((as) => {
            retire = as.find((a) => a.id === id);
            return as.filter((a) => a.id !== id);
          }),
        // Remis à sa place, pas en fin de liste : `attachmentsOf` retrie sur
        // `position`, donc l'ordre est retrouvé quoi qu'il arrive.
        revert: () => setAttachments((as) => (retire ? [...as, retire] : as)),
        write: () => supabase.from('task_attachments').delete().eq('id', id).select().maybeSingle(),
      });
    },
    [persist],
  );

  const loadBin = useCallback(async (boardIds: string[]) => {
    // Idempotent PAR MATRICE : ouvrir la corbeille d'une matrice puis celle de
    // la vue globale ne doit charger que le complément.
    const manquantes = boardIds.filter((id) => !binBoards.current.has(id));
    if (manquantes.length === 0) return;
    // Marquées AVANT l'attente : deux ouvertures rapprochées ne doivent pas
    // lancer deux fois la même requête.
    manquantes.forEach((id) => binBoards.current.add(id));

    // ⚠️ PAGINATION OBLIGATOIRE. PostgREST plafonne ses réponses à 1000 lignes,
    // silencieusement — c'est précisément le défaut que ce ticket corrige côté
    // grille, et le reproduire ici rendrait la corbeille incomplète sans que
    // rien ne le signale. Une matrice peut très bien accumuler plus de mille
    // tâches terminées : c'est même son état normal au bout d'un an.
    const recues: Task[] = [];
    for (let debut = 0; ; debut += PAGE) {
      const { data, error } = await supabase
        .from('tasks')
        .select(TASK_COLS)
        .in('board_id', manquantes)
        .or('done.eq.true,deleted.eq.true')
        .order('position')
        .range(debut, debut + PAGE - 1);
      if (error || !data) {
        // Rejouable : sans ça, un échec réseau condamnerait ces corbeilles pour
        // toute la session.
        manquantes.forEach((id) => binBoards.current.delete(id));
        return;
      }
      recues.push(...(data as Task[]));
      if (data.length < PAGE) break;
    }

    setTasks((ts) => {
      const connues = new Set(ts.map((t) => t.id));
      // Les tâches archivées PENDANT la session sont déjà là, à jour : la
      // réponse du serveur ne doit pas écraser leur état optimiste.
      return [...ts, ...recues.filter((t) => !connues.has(t.id))];
    });
    setBinTick((n) => n + 1);
  }, []);

  /** Purement dérivé : `binTick` force la relecture après un chargement. */
  const binLoaded = useCallback(
    (boardIds: string[]) => binTick >= 0 && boardIds.every((id) => binBoards.current.has(id)),
    [binTick],
  );

  /**
   * Le nombre d'éléments de la corbeille, sans en transférer un seul.
   *
   * `head: true` renvoie les en-têtes et rien d'autre — le compte est calculé
   * par la base. Compter en chargeant rejouerait le défaut que #40 corrige.
   */
  const countBin = useCallback(async (boardIds: string[]) => {
    if (boardIds.length === 0) return 0;
    const { count } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .in('board_id', boardIds)
      // Le compte doit correspondre à ce que la corbeille AFFICHE, et elle
      // n'affiche pas les étapes (#50) : sans ce filtre, le bouton annoncerait
      // plus d'éléments que la liste n'en montre.
      .is('parent_id', null)
      .or('done.eq.true,deleted.eq.true');
    return count ?? 0;
  }, []);

  const purgeTasks = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      let removed: Task[] = [];
      await persist<null>({
        label: 'Vider la corbeille',
        apply: () =>
          setTasks((ts) => {
            removed = ts.filter((t) => ids.includes(t.id));
            return ts.filter((t) => !ids.includes(t.id));
          }),
        revert: () => {
          const gone = removed;
          if (gone.length) setTasks((ts) => [...ts, ...gone].sort(byPosition));
        },
        write: () => supabase.from('tasks').delete().in('id', ids),
      });
      // Une purge vide la corbeille d'autant : même raison que dans `patchTask`.
      setBinTick((n) => n + 1);
    },
    [persist],
  );

  // Deux onglets divergeaient en silence, et la dernière écriture écrasait
  // l'autre (#39). Les setters sont stables ; `admits` et `reload` passent par
  // une ref à l'intérieur du hook.
  useRealtime(userId, {
    setTasks,
    setBoards,
    setUniverses,
    setAttachments,
    admits: inWorkingSet,
    reload: load,
  });

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
    group,
    undo,
    redo,
    clearUndo,
    undoLabel: undoStack.length ? undoStack[undoStack.length - 1].label : null,
    redoLabel: redoStack.length ? redoStack[redoStack.length - 1].label : null,
    loadBin,
    binLoaded,
    binVersion: binTick,
    attachments,
    addAttachment,
    removeAttachment,
    countBin,
    reload: load,
  };
}
