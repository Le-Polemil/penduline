import { useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  deleteLabel,
  endPosition,
  orderedBoards,
  partnerOf,
  planDelete,
  planPairDetach,
  planPairMove,
  planPairPatch,
  quadrant,
  reviewSignals,
  signalCount,
  subtasksOf,
  visibleTasks,
  type Board,
  type QuadrantKey,
  type ReviewSignal,
  type ReviewSignalKey,
  type ReviewThresholds,
  type Task,
  type TaskWrite,
} from '@penduline/shared';
import type { Store } from '../data/store';
import { Confirm } from '../components/Confirm';
import { TaskCard } from '../components/TaskCard';
import { useCompletion } from '../data/useCompletion';
import { useReview } from '../data/useReview';
import { markReviewed, readThresholds, writeThresholds } from '../data/reviewPrefs';

/** Anime un changement structurel via l'API View Transitions (dégradation gracieuse). */
function withVT(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (doc.startViewTransition) doc.startViewTransition(() => flushSync(fn));
  else fn();
}

/** Le seuil que chaque signal expose au réglage. `null` = rien à régler. */
const TUNABLE: Record<ReviewSignalKey, keyof ReviewThresholds | null> = {
  parking: 'parkingDays',
  neverMoved: 'neverMovedDays',
  doing: 'doingDays',
  dormant: 'dormantDays',
  eliminer: 'eliminerStaleDays',
};

/**
 * La revue périodique : cinq lectures de ce que l'usage quotidien masque (#47).
 *
 * L'écran ne calcule RIEN. Tout vient de `reviewSignals` (`packages/shared`), pur
 * et testé ; ici on ne fait que rendre et agir. C'est ce qui permet aux seuils
 * d'être vérifiés par des tests unitaires plutôt qu'à l'œil.
 *
 * Les cartes sont les VRAIES `TaskCard`, avec leur menu `⋯` habituel : reclasser
 * depuis la revue se fait donc avec le geste déjà connu, et `Ctrl+Z` le défait
 * comme partout ailleurs. `drag`, `split`, `reorder` et `subtasks` sont
 * facultatifs et volontairement absents — la revue n'a pas d'ordre à offrir, et
 * décomposer une tâche n'est pas un geste de revue.
 */
export function ReviewScreen({
  store,
  onOpenBoard,
}: {
  store: Store;
  onOpenBoard: (boardId: string) => void;
}) {
  const { tasks, patchTask } = store;
  const { stats, loading, failed, refresh } = useReview();
  const [thresholds, setThresholds] = useState<ReviewThresholds>(readThresholds);
  const [tuning, setTuning] = useState<ReviewSignalKey | null>(null);
  const [collapsed, setCollapsed] = useState<Set<ReviewSignalKey>>(new Set());
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const [renamingTask, setRenamingTask] = useState<{ id: string; title: string } | null>(null);
  const [delAsk, setDelAsk] = useState<Task | null>(null);
  const [moveAsk, setMoveAsk] = useState<{ task: Task; mate: Task; target: Board } | null>(null);
  const [linking, setLinking] = useState<string | null>(null);

  const { onCheck, pending } = useCompletion(tasks, patchTask);

  // Consulter la revue EST la revue : on horodate à l'arrivée, pas sur un bouton
  // « j'ai terminé » que personne ne cliquerait.
  useEffect(() => markReviewed(), []);

  useEffect(() => writeThresholds(thresholds), [thresholds]);

  const boards = useMemo(
    () => orderedBoards(store.universes, store.boards),
    [store.universes, store.boards],
  );

  // `pending` exclu : une tâche cochée il y a deux secondes est en train de
  // partir, la faire clignoter dans un signal serait du bruit.
  const signals = useMemo(
    () =>
      reviewSignals({
        tasks: pending ? tasks.filter((t) => t.id !== pending) : tasks,
        boards,
        stats,
        thresholds,
      }),
    [tasks, boards, stats, thresholds, pending],
  );

  const total = signals.reduce((n, s) => n + signalCount(s), 0);

  /** Applique des écritures préparées par `packages/shared`, en UN geste annulable. */
  function apply(label: string, writes: TaskWrite[]) {
    store.group(label, () => {
      for (const w of writes) void patchTask(w.id, w.patch);
    });
  }

  function commitTaskRename() {
    if (!renamingTask) return;
    const title = renamingTask.title.trim();
    const before = tasks.find((t) => t.id === renamingTask.id)?.title;
    if (title && title !== before) {
      const id = renamingTask.id;
      store.group('Renommée', () => void patchTask(id, { title }));
    }
    setRenamingTask(null);
  }

  /**
   * Changer de case. La position se calcule dans la matrice de la tâche, jamais
   * dans l'agrégat : c'est là que son ordre a un sens.
   *
   * `refresh()` derrière : sortir une tâche d'« Éliminer » change un fait que
   * seul le serveur connaît (`eliminer_open`), et que la mémoire ne peut pas
   * recalculer.
   */
  function moveQuad(task: Task, quad: QuadrantKey) {
    const pos = endPosition(visibleTasks(tasks, task.board_id, quad));
    withVT(() =>
      apply(`Déplacée vers « ${quadrant(quad).label} »`, planPairMove(tasks, task, { quadrant: quad }, pos)),
    );
    setMenuTask(null);
    refresh();
  }

  function moveToBoard(task: Task, target: Board) {
    const pos = endPosition(visibleTasks(tasks, target.id, task.quadrant));
    withVT(() =>
      apply(`Déplacée vers « ${target.name} »`, planPairMove(tasks, task, { board_id: target.id }, pos)),
    );
    refresh();
  }

  /** Même règle que les autres écrans : on n'annonce que le départ d'une PAIRE. */
  function askMoveToBoard(task: Task, target: Board) {
    setMenuTask(null);
    const mate = partnerOf(tasks, task);
    if (mate) setMoveAsk({ task, mate, target });
    else moveToBoard(task, target);
  }

  function togglePin(t: Task) {
    if (t.pinned) {
      const pos = endPosition(visibleTasks(tasks, t.board_id, t.quadrant));
      withVT(() => apply('Désépinglée', planPairMove(tasks, t, { pinned: false }, pos)));
    } else {
      withVT(() => apply('Épinglée', planPairPatch(tasks, t, { pinned: true })));
    }
    setMenuTask(null);
  }

  function unpair(task: Task) {
    withVT(() => apply('Dissociée', planPairDetach(tasks, task)));
    setMenuTask(null);
  }

  function removeTask(task: Task) {
    withVT(() => apply(deleteLabel(tasks, task), planDelete(tasks, task)));
    setMenuTask(null);
    refresh();
  }

  /**
   * On ne confirme que si la suppression est plus large que ce qu'on a désigné.
   * Ici les étapes ne sont même pas affichées — raison de plus pour les annoncer
   * avant qu'elles ne partent.
   */
  function askRemoveTask(task: Task) {
    setMenuTask(null);
    if (subtasksOf(tasks, task.id).length > 0) setDelAsk(task);
    else removeTask(task);
  }

  function toggleCollapsed(key: ReviewSignalKey) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setMenuTask(null);
  }

  function card(t: Task) {
    const q = quadrant(t.quadrant);
    const board = store.boards.find((b) => b.id === t.board_id);
    return (
      <div className="review-card" key={t.id}>
        {/* La matrice d'origine, parce que la revue agrège : sans elle, on ne
            sait pas de quel contexte parle la tâche. */}
        {board && <span className="review-card__board">{board.name}</span>}
        <TaskCard
          task={t}
          quad={q}
          tasks={tasks}
          otherBoards={store.boards.filter((b) => b.id !== t.board_id)}
          pinnedCard={t.pinned}
          menuOpen={menuTask === t.id}
          onMenu={(open) => setMenuTask(open ? t.id : null)}
          rename={{
            value: renamingTask?.id === t.id ? renamingTask.title : null,
            start: () => setRenamingTask({ id: t.id, title: t.title }),
            change: (value) => setRenamingTask({ id: t.id, title: value }),
            cancel: () => setRenamingTask(null),
            commit: commitTaskRename,
          }}
          onCheck={() => {
            onCheck(t);
            refresh();
          }}
          onMoveQuad={(key) => moveQuad(t, key)}
          onMoveBoard={(b) => askMoveToBoard(t, b)}
          onTogglePin={() => togglePin(t)}
          onUnpair={() => unpair(t)}
          onDelete={() => askRemoveTask(t)}
          attachments={{
            all: store.attachments,
            adding: linking === t.id,
            onStartAdd: () => setLinking(t.id),
            onCancelAdd: () => setLinking(null),
            onAdd: (url) => store.addAttachment(t.id, url),
            onRemove: (a) => void store.removeAttachment(a.id),
          }}
        />
      </div>
    );
  }

  function boardRow(b: Board, signal: ReviewSignal) {
    return (
      <button className="review-board" key={b.id} onClick={() => onOpenBoard(b.id)}>
        <span className="review-board__name">{b.name}</span>
        <span className="review-board__detail">
          {signal.key === 'eliminer'
            ? `${stats.find((s) => s.board_id === b.id)?.eliminer_open ?? 0} tâches en attente`
            : 'ouvrir'}
        </span>
      </button>
    );
  }

  function section(signal: ReviewSignal) {
    const count = signalCount(signal);
    const isCollapsed = collapsed.has(signal.key);
    const tunable = TUNABLE[signal.key];
    // Les deux signaux serveur ne peuvent rien dire si la RPC a échoué. Les
    // afficher à zéro dirait « tout va bien » alors qu'on ne sait rien.
    const unavailable = failed && signal.kind === 'boards';

    return (
      <section
        className={`review-signal${count === 0 ? ' review-signal--clear' : ''}`}
        key={signal.key}
        aria-label={signal.label}
      >
        <div className="review-signal__head">
          <button
            className="review-signal__toggle"
            onClick={() => toggleCollapsed(signal.key)}
            aria-expanded={!isCollapsed}
          >
            <span className="review-signal__caret" aria-hidden="true">
              {isCollapsed ? '▸' : '▾'}
            </span>
            <span className="review-signal__label">{signal.label}</span>
          </button>
          {/* Le compte ne sert JAMAIS d'intitulé à son bouton — c'est l'erreur
              corrigée sur `.bin-btn`, où l'arbre d'accessibilité annonçait « 0 ». */}
          <span className="review-signal__count" aria-hidden={unavailable}>
            {unavailable ? '—' : count}
          </span>
        </div>

        <p className="review-signal__hint">{signal.hint}</p>

        {!isCollapsed && (
          <>
            {unavailable ? (
              <p className="review-signal__empty review-signal__empty--failed">
                Indisponible : ce signal a besoin du serveur, qui n'a pas répondu.
              </p>
            ) : count === 0 ? (
              // Un signal à zéro s'affiche SATISFAIT, il ne se masque pas :
              // « rien ne traîne au parking » est une information, et un écran
              // dont les sections disparaissent paraît cassé.
              <p className="review-signal__empty">{signal.empty}</p>
            ) : signal.kind === 'tasks' ? (
              <div className="review-list">{signal.tasks.map((t) => card(t))}</div>
            ) : (
              <div className="review-list review-list--boards">
                {signal.boards.map((b) => boardRow(b, signal))}
              </div>
            )}

            {signal.note && <p className="review-signal__note">{signal.note}</p>}

            {tunable && (
              <div className="review-signal__foot">
                {tuning === signal.key ? (
                  <label className="review-tune">
                    Seuil, en jours
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={thresholds[tunable]}
                      autoFocus
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v) && v > 0)
                          setThresholds((prev) => ({ ...prev, [tunable]: v }));
                      }}
                      onBlur={() => setTuning(null)}
                    />
                  </label>
                ) : (
                  <button className="review-signal__tune" onClick={() => setTuning(signal.key)}>
                    Seuil : {thresholds[tunable]} j
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <div className="review">
      <div className="review-head">
        <h1 className="review-title">Revue</h1>
        <p className="review-sub">
          {/* Descriptif, jamais prescriptif : c'est un miroir, pas un professeur.
              Le ticket en fait un critère d'acceptation explicite. */}
          Ce que l'usage quotidien ne montre plus. Chaque élément est actionnable ici même.
        </p>
        <span className="review-total">
          {loading
            ? 'Lecture…'
            : total === 0
              ? 'Rien à signaler'
              : `${total} élément${total > 1 ? 's' : ''} à regarder`}
        </span>
      </div>

      {store.boards.length === 0 ? (
        <p className="home-empty">
          La revue s'appuie sur vos matrices — créez-en une et revenez quand elle aura vécu.
        </p>
      ) : (
        <div className="review-signals">{signals.map((s) => section(s))}</div>
      )}

      {delAsk && (
        <Confirm
          title={`Supprimer « ${delAsk.title} » ?`}
          body={(() => {
            const n = subtasksOf(tasks, delAsk.id).length;
            return `${n > 1 ? `Ses ${n} étapes partiront` : 'Son étape partira'} à la corbeille avec elle. Vous pourrez tout restaurer.`;
          })()}
          onCancel={() => setDelAsk(null)}
          onConfirm={() => {
            removeTask(delAsk);
            setDelAsk(null);
          }}
        />
      )}

      {moveAsk && (
        <Confirm
          title="Déplacer les deux tâches ?"
          body={`« ${moveAsk.task.title} » est appairée à « ${moveAsk.mate.title} ». Les deux partiront dans « ${moveAsk.target.name} ».`}
          confirmLabel="Déplacer"
          tone="neutral"
          onCancel={() => setMoveAsk(null)}
          onConfirm={() => {
            moveToBoard(moveAsk.task, moveAsk.target);
            setMoveAsk(null);
          }}
        />
      )}
    </div>
  );
}
