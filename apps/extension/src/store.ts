import { useCallback, useEffect, useRef, useState } from 'react';
import {
  classifyWriteFailure,
  isSafeUrl,
  normalizeUrl,
  subscribeRealtime,
  type RealtimeSink,
} from '@penduline/shared';
import type { QuadrantKey, Board, Task, TaskPatch, Universe } from '@penduline/shared';
import type { PostgrestError } from '@supabase/supabase-js';
import { readSnapshot, writeSnapshot } from './snapshot';
import { supabase } from './supabase';
import { useToast } from './toast';

const TASK_COLS =
  'id, user_id, board_id, title, quadrant, done, archived, deleted, position, pair_id, parent_id, due_at, focus_day, created_at, updated_at';

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
  /**
   * Le canal temps réel est-il établi ? (#117)
   *
   * Exposé parce que l'écran s'en sert : tant que le flux arrive, la relecture au
   * changement de vue n'a plus rien à rattraper. Elle reste le repli quand le
   * socket est down — hors ligne, ou WebSocket bloqué par un proxy.
   */
  live: boolean;
  /**
   * Relit univers, matrices et tâches SANS repasser par l'écran de chargement.
   *
   * Le panneau reste ouvert des heures et n'a pas le temps réel du web
   * (`apps/web/src/data/useRealtime.ts`) : sans ça, ce qu'on change depuis l'app
   * web ou un autre appareil n'apparaît jamais. Appelé aux changements de vue,
   * il rattrape au moment où l'on regarde.
   *
   * ⚠️ Silencieux par construction : `ready` n'est jamais rendu à `false`, les
   * données affichées restent celles d'avant jusqu'à l'arrivée des nouvelles.
   * Un écran de chargement à chaque navigation ferait clignoter tout le panneau
   * pour rattraper trois lignes.
   */
  refresh: () => void;
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

/**
 * Une tâche reçue par le canal a-t-elle sa place en mémoire ?
 *
 * ⚠️ Miroir EXACT du `select` de chargement ci-dessous — et volontairement
 * DIFFÉRENT de `inWorkingSet` côté web, qui garde les étapes cochées. Le panneau
 * n'affiche pas d'étapes : réutiliser la règle du web ferait rentrer par le canal
 * ce que ce `select` sort par la porte, et le panneau se remplirait de lignes
 * qu'il ne sait pas rendre.
 *
 * `archived` n'y figure pas, comme dans le `select` : le rendu l'écarte déjà
 * (`listFor`), et ajouter ici un critère que le chargement n'a pas ferait diverger
 * les deux chemins — exactement ce que cette fonction existe pour éviter.
 */
function admisAuPanneau(t: Task): boolean {
  return !t.done && !t.deleted && t.parent_id === null;
}

export function useExtStore(userId: string): ExtStore {
  const [ready, setReady] = useState(false);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [live, setLive] = useState(false);
  const persistBrut = usePersist();

  /**
   * L'état des écritures, pour arbitrer entre un rafraîchissement et une
   * modification locale.
   *
   * ⚠️ C'EST LE POINT DÉLICAT du rafraîchissement silencieux. Un `SELECT` parti
   * avant qu'un `UPDATE` ne soit commité rapporte l'état d'AVANT : appliqué tel
   * quel, il ferait reculer sous les doigts la case qu'on vient de changer.
   *
   * Deux garde-fous, et il faut les deux :
   * - `gen`, monotone, incrémenté à chaque écriture lancée — détecte une écriture
   *   survenue PENDANT la lecture ;
   * - `enVol`, le nombre d'écritures non encore acquittées — détecte celles
   *   lancées AVANT la lecture et pas encore arrivées en base.
   *
   * En cas de doute on JETTE la réponse : perdre un rafraîchissement ne se voit
   * pas, annuler le geste de l'utilisateur se voit tout de suite. Le prochain
   * changement de vue rattrapera.
   */
  const ecritures = useRef({ gen: 0, enVol: 0 });

  const persist = useCallback(
    async function persist<T>(op: ExtWriteOp<T>) {
      ecritures.current.gen += 1;
      ecritures.current.enVol += 1;
      try {
        return await persistBrut(op);
      } finally {
        ecritures.current.enVol -= 1;
      }
    },
    [persistBrut],
  );

  /**
   * Le tour de lecture, partagé par le chargement initial et les
   * rafraîchissements. `silencieux` ne change que la façon d'atterrir : la
   * requête, elle, est la même.
   */
  const charger = useCallback(async (silencieux: boolean, vivant: () => boolean) => {
    const genAvant = ecritures.current.gen;
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
    if (!vivant()) return false;
    // Une erreur réseau ne doit pas VIDER l'écran. `?? []` était acceptable
    // quand un échec ne coûtait qu'un panneau vide ; avec l'instantané il
    // effacerait des données qu'on vient de peindre.
    if (universesRes.error || boardsRes.error || tasksRes.error) return false;
    if (silencieux && (ecritures.current.gen !== genAvant || ecritures.current.enVol > 0)) return false;
    setUniverses(universesRes.data ?? []);
    setBoards(boardsRes.data ?? []);
    setTasks((tasksRes.data as Task[] | null) ?? []);
    return true;
  }, []);

  /**
   * L'instantané d'abord, le réseau par-dessus.
   *
   * Les deux partent EN PARALLÈLE : attendre `chrome.storage` avant d'ouvrir les
   * requêtes ajouterait sa latence à celle du réseau, alors que le cache n'est là
   * que pour combler l'attente. Le premier arrivé peint.
   *
   * `reseauServi` empêche l'inverse : une lecture de stockage lente ne doit pas
   * repeindre par-dessus des données fraîches déjà appliquées. Il ne se lève que
   * si le réseau a VRAIMENT appliqué quelque chose — sinon l'instantané reste le
   * meilleur état disponible, ce qui est précisément le cas hors ligne.
   */
  useEffect(() => {
    let alive = true;
    let reseauServi = false;

    void readSnapshot(userId).then((snap) => {
      if (!alive || reseauServi || !snap) return;
      setUniverses(snap.universes);
      setBoards(snap.boards);
      setTasks(snap.tasks);
      setReady(true);
    });

    void charger(false, () => alive)
      .catch(() => false)
      .then((applique) => {
        if (applique) reseauServi = true;
        // `ready` passe même sur échec : sans cache et sans réseau, mieux vaut un
        // panneau vide qu'un écran de chargement sans fin.
        if (alive) setReady(true);
      });

    return () => {
      alive = false;
    };
  }, [userId, charger]);

  /**
   * Réécrire l'instantané dès que l'état bouge — y compris sur une modification
   * LOCALE, et pas seulement après un chargement.
   *
   * Sans ça, cocher une tâche puis rouvrir le panneau la ferait réapparaître le
   * temps du rafraîchissement : le geste le plus courant du panneau produirait
   * le clignotement que le cache est censé supprimer.
   *
   * Temporisé : un réordonnancement au glisser émet une écriture par cran, et
   * `chrome.storage` n'a pas à les suivre une à une.
   */
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      void writeSnapshot(userId, { universes, boards, tasks });
    }, 400);
    return () => window.clearTimeout(t);
  }, [ready, userId, universes, boards, tasks]);

  /**
   * Un seul rafraîchissement à la fois : les déclencheurs sont plusieurs (une
   * navigation, un retour de visibilité) et peuvent tomber ensemble. Deux
   * lectures concurrentes n'apporteraient rien et laisseraient la plus lente
   * écraser la plus fraîche.
   */
  const enCours = useRef(false);
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);
  const refresh = useCallback(() => {
    if (enCours.current) return;
    enCours.current = true;
    void charger(true, () => monte.current).finally(() => {
      enCours.current = false;
    });
  }, [charger]);

  /**
   * L'abonnement temps réel (#117).
   *
   * ⚠️ Tout le fond vit dans `packages/shared/src/realtime.ts` — fusion des
   * lignes, neutralisation de l'écho par comparaison, rechargement à la
   * reconnexion, et l'absence délibérée de filtre serveur. Ici il ne reste que le
   * branchement.
   *
   * #39 avait écarté l'extension, et pour une bonne raison : « son popup charge à
   * chaque ouverture et vit quelques secondes ». #101 a supprimé ce motif — le
   * panneau ne se ferme plus, il reste ouvert des heures.
   *
   * Pas de `setAttachments` : le panneau ne porte pas les liens, et l'absence de
   * la clé suffit à ne pas abonner la table.
   *
   * `reload` est le `refresh()` silencieux ci-dessus, qui porte déjà le garde-fou
   * contre l'écrasement d'une écriture locale non acquittée. Rien à écrire de
   * neuf : la frontière avait été tracée au bon endroit.
   */
  const courant: RealtimeSink = {
    setTasks,
    setBoards,
    setUniverses,
    admits: admisAuPanneau,
    reload: async () => refresh(),
  };
  const sink = useRef(courant);
  sink.current = courant;

  useEffect(
    // `subscribeRealtime` prend un GETTER : il relit le sink à chaque événement,
    // donc `reload` n'est jamais figé sur un rendu passé.
    () => subscribeRealtime(supabase, userId, () => sink.current, { onLive: setLive }),
    [userId],
  );

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

  return { ready, live, universes, boards, tasks, addBoard, addTask, captureTask, patchTask, refresh };
}
