import { useEffect, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  ALL,
  buildRows,
  countOpen,
  endPosition,
  insertPosition,
  pinnedTasks,
  QUADS,
  quadrant,
  visibleTasks,
  type QuadrantKey,
  type Board,
  type Task,
} from '@penduline/shared';
import type { Store } from '../data/store';

type Hover =
  | { type: 'end'; quad: QuadrantKey }
  | { type: 'gap'; quad: QuadrantKey; row: number }
  | { type: 'card'; taskId: string }
  | null;

type Drag = { id: string; quad: QuadrantKey } | null;

/** Anime un changement structurel via l'API View Transitions (dégradation gracieuse). */
function withVT(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (doc.startViewTransition) doc.startViewTransition(() => flushSync(fn));
  else fn();
}

export function MatrixScreen({
  store,
  board,
  onHome,
  onSwitch,
}: {
  store: Store;
  board: Board;
  onHome: () => void;
  onSwitch: (boardId: string) => void;
}) {
  const { tasks, patchTask } = store;
  const [boardMenu, setBoardMenu] = useState(false);
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [drag, setDrag] = useState<Drag>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [focusQuad, setFocusQuad] = useState<QuadrantKey | null>(null);
  const [pending, setPending] = useState<{ id: string; label: string } | null>(null);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const boardTasks = tasks.filter((t) => t.board_id === board.id);
  const totalOpen = boardTasks.filter((t) => !t.done && !t.deleted).length;

  // ── Complétion / annulation ───────────────────────────────────────────────
  function archive(id: string) {
    patchTask(id, { archived: true, pinned: false });
    setPending((cur) => (cur && cur.id === id ? null : cur));
  }
  function completeTask(task: Task) {
    if (pending) {
      window.clearTimeout(timer.current);
      archive(pending.id);
    }
    patchTask(task.id, { done: true });
    setPending({ id: task.id, label: task.title });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => archive(task.id), 4000);
  }
  function onCheck(task: Task) {
    if (task.done) {
      window.clearTimeout(timer.current);
      patchTask(task.id, { done: false, archived: false });
      setPending((cur) => (cur && cur.id === task.id ? null : cur));
    } else {
      completeTask(task);
    }
  }
  function undo() {
    if (!pending) return;
    window.clearTimeout(timer.current);
    patchTask(pending.id, { done: false, archived: false });
    setPending(null);
  }

  // ── Menu : déplacer / épingler / supprimer ────────────────────────────────
  function menuMove(id: string, quad: QuadrantKey) {
    const pos = endPosition(visibleTasks(tasks, board.id, quad));
    withVT(() => patchTask(id, { quadrant: quad, pair_id: null, position: pos }));
    setMenuTask(null);
  }
  function togglePin(t: Task) {
    if (t.pinned) {
      const pos = endPosition(visibleTasks(tasks, board.id, t.quadrant));
      withVT(() => patchTask(t.id, { pinned: false, pair_id: null, position: pos }));
    } else {
      withVT(() => patchTask(t.id, { pinned: true, pair_id: null }));
    }
    setMenuTask(null);
  }
  function removeTask(id: string) {
    withVT(() => patchTask(id, { deleted: true, pinned: false }));
    setMenuTask(null);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  function dropEnd(quad: QuadrantKey) {
    if (!drag) return;
    const pos = endPosition(visibleTasks(tasks, board.id, quad));
    withVT(() => patchTask(drag.id, { quadrant: quad, pair_id: null, position: pos }));
    setDrag(null);
    setHover(null);
  }
  function dropInsert(quad: QuadrantKey, rowIndex: number) {
    if (!drag) return;
    const rows = buildRows(visibleTasks(tasks, board.id, quad).filter((t) => t.id !== drag.id));
    const pos = insertPosition(rows, rowIndex);
    withVT(() => patchTask(drag.id, { quadrant: quad, pair_id: null, position: pos }));
    setDrag(null);
    setHover(null);
  }
  function dropPair(quad: QuadrantKey, targetId: string) {
    if (!drag || drag.id === targetId) return;
    const target = tasks.find((t) => t.id === targetId);
    if (!target) return;
    const pairId = target.pair_id ?? crypto.randomUUID();
    withVT(() => {
      if (!target.pair_id) patchTask(target.id, { pair_id: pairId });
      patchTask(drag.id, { quadrant: quad, pinned: false, pair_id: pairId, position: target.position + 0.001 });
    });
    setDrag(null);
    setHover(null);
  }

  // ── Ajout inline ──────────────────────────────────────────────────────────
  function addTask(quad: QuadrantKey) {
    const title = (drafts[quad] ?? '').trim();
    if (!title) return;
    const pos = endPosition(visibleTasks(tasks, board.id, quad));
    void store.addTask(board.id, quad, title, pos);
    setDrafts((d) => ({ ...d, [quad]: '' }));
  }

  const doneList = boardTasks.filter((t) => t.done && t.archived && !t.deleted);
  const delList = boardTasks.filter((t) => t.deleted);

  function renderCard(t: Task, q: ReturnType<typeof quadrant>, single: boolean, pinnedCard: boolean) {
    const isDrag = drag?.id === t.id;
    const splitOk = single && !t.pinned && !t.done && !!drag && drag.id !== t.id;
    const splitActive = splitOk && hover?.type === 'card' && hover.taskId === t.id;
    const cls = [
      'task',
      pinnedCard ? 'task--pinned' : '',
      isDrag ? 'task--dragging' : '',
      splitActive ? 'task--split' : '',
      t.done ? 'task--done' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className="card-wrap" key={t.id}>
        <div
          className={cls}
          style={{ viewTransitionName: `vt-${t.id}` } as CSSProperties}
          draggable={!t.pinned && !t.done}
          onDragStart={(e: DragEvent) => {
            e.dataTransfer.effectAllowed = 'move';
            window.setTimeout(() => {
              setDrag({ id: t.id, quad: q.key });
              setMenuTask(null);
            }, 0);
          }}
          onDragEnd={() => {
            setDrag(null);
            setHover(null);
          }}
          onDragOver={(e: DragEvent) => {
            if (splitOk) {
              e.preventDefault();
              e.stopPropagation();
              setHover({ type: 'card', taskId: t.id });
            }
          }}
          onDrop={(e: DragEvent) => {
            if (splitOk) {
              e.preventDefault();
              e.stopPropagation();
              dropPair(q.key, t.id);
            }
          }}
        >
          {pinnedCard ? <span className="task__flag">⚑</span> : <span className="task__grip">⠿</span>}
          <button
            className={`task__check${t.done ? ' task__check--done' : ''}`}
            onClick={() => onCheck(t)}
            aria-label={t.done ? 'Rétablir' : 'Terminer'}
          />
          <span className={`task__title${t.done ? ' task__title--done' : ''}`}>{t.title}</span>
          <button className="task__more" onClick={() => setMenuTask((m) => (m === t.id ? null : t.id))}>
            ⋯
          </button>
        </div>
        {menuTask === t.id && (
          <div className="task-menu">
            <div className="task-menu__label">Déplacer vers</div>
            <div className="task-menu__grid">
              {QUADS.map((b) => (
                <button
                  key={b.key}
                  className="move-btn"
                  style={{ background: b.bg, color: b.dark }}
                  disabled={b.key === q.key}
                  onClick={() => menuMove(t.id, b.key)}
                >
                  {b.label}
                </button>
              ))}
            </div>
            {q.key !== 'parking' && (
              <button className="task-menu__action task-menu__action--pin" onClick={() => togglePin(t)}>
                {t.pinned ? 'Désépingler' : '⚑ Épingler en haut'}
              </button>
            )}
            <button className="task-menu__action task-menu__action--del" onClick={() => removeTask(t.id)}>
              Supprimer
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="matrix">
      <div className="matrix-head">
        <button className="crumb" onClick={onHome}>
          ‹ Matrices
        </button>
        <span className="board-switch">
          <button className="board-switch__name" onClick={() => setBoardMenu((o) => !o)}>
            {board.name} <span className="board-switch__caret">▾</span>
          </button>
          {boardMenu && (
            <span className="board-menu">
              {store.boards.map((r) => (
                <button
                  key={r.id}
                  className={`board-menu__item${r.id === board.id ? ' board-menu__item--active' : ''}`}
                  onClick={() => {
                    onSwitch(r.id);
                    setBoardMenu(false);
                    setMenuTask(null);
                  }}
                >
                  {r.name}
                </button>
              ))}
            </span>
          )}
        </span>
        <span className="matrix-total">
          {totalOpen ? `${totalOpen} ${totalOpen > 1 ? 'tâches ouvertes' : 'tâche ouverte'}` : 'tout est fait'}
        </span>
        <button
          className="bin-btn"
          style={{ viewTransitionName: binOpen ? 'none' : 'bin' } as CSSProperties}
          onClick={() => {
            withVT(() => setBinOpen(true));
            setMenuTask(null);
            setBoardMenu(false);
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
            <path d="M3 6h18" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
            <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
          {doneList.length + delList.length}
        </button>
      </div>

      <div className="grid">
        {ALL.map((q) => {
          const pinned = pinnedTasks(tasks, board.id, q.key);
          const rows = buildRows(visibleTasks(tasks, board.id, q.key));
          const focused = focusQuad === q.key;
          const draft = drafts[q.key] ?? '';
          return (
            <div
              key={q.key}
              className={`quad${q.key === 'parking' ? ' quad--park' : ''}${drag ? ' quad--drag' : ''}`}
              style={{
                '--q-ink': q.ink,
                '--q-dark': q.dark,
                '--q-bg': q.bg,
                '--q-outline': drag ? q.ink : q.key === 'parking' ? 'var(--color-neutral-300)' : 'transparent',
              } as CSSProperties}
              onDragOver={(e: DragEvent) => {
                if (drag) {
                  e.preventDefault();
                  setHover({ type: 'end', quad: q.key });
                }
              }}
              onDrop={(e: DragEvent) => {
                if (drag) {
                  e.preventDefault();
                  dropEnd(q.key);
                }
              }}
            >
              <div className="quad-head">
                <span className="quad-label">{q.label}</span>
                <span className="quad-sub">{q.sub}</span>
                <span className="quad-count">{countOpen(tasks, board.id, q.key)}</span>
              </div>

              {pinned.map((t) => renderCard(t, q, false, true))}

              {rows.map((cards, i) => {
                const gapActive = hover?.type === 'gap' && hover.quad === q.key && hover.row === i;
                return (
                  <div key={`row-${i}`}>
                    <div
                      className={`row-gap${gapActive ? ' row-gap--active' : ''}`}
                      onDragOver={(e: DragEvent) => {
                        if (drag) {
                          e.preventDefault();
                          e.stopPropagation();
                          setHover({ type: 'gap', quad: q.key, row: i });
                        }
                      }}
                      onDrop={(e: DragEvent) => {
                        if (drag) {
                          e.preventDefault();
                          e.stopPropagation();
                          dropInsert(q.key, i);
                        }
                      }}
                    >
                      <div className="row-gap__line" />
                    </div>
                    <div className="card-row">{cards.map((t) => renderCard(t, q, cards.length === 1, false))}</div>
                  </div>
                );
              })}

              <div className="quad-fill" />

              <div className={`add-row${focused ? ' add-row--focused' : ''}`}>
                <input
                  className="add-input"
                  value={draft}
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.key]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addTask(q.key);
                  }}
                  onFocus={() => setFocusQuad(q.key)}
                  onBlur={() => setFocusQuad((f) => (f === q.key ? null : f))}
                />
                {focused || draft ? (
                  <button className="add-submit" onMouseDown={(e) => { e.preventDefault(); addTask(q.key); }}>
                    ＋
                  </button>
                ) : (
                  <span className="add-hint">
                    <span style={{ font: '700 14px/1 var(--font-body)' }}>＋</span>
                    <span>ajouter</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {binOpen && (
        <BinModal
          boardName={board.name}
          doneList={doneList}
          delList={delList}
          onClose={() => withVT(() => setBinOpen(false))}
          onRestore={(id) => withVT(() => patchTask(id, { done: false, archived: false, deleted: false }))}
        />
      )}

      {pending && (
        <div className="toast">
          <span>« {pending.label} » terminée</span>
          <button className="toast__undo" onClick={undo}>
            Annuler
          </button>
        </div>
      )}
    </div>
  );
}

function BinModal({
  boardName,
  doneList,
  delList,
  onClose,
  onRestore,
}: {
  boardName: string;
  doneList: Task[];
  delList: Task[];
  onClose: () => void;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="bin-backdrop" onClick={onClose}>
      <div className="bin-panel" style={{ viewTransitionName: 'bin' } as CSSProperties} onClick={(e) => e.stopPropagation()}>
        <div className="bin-head">
          <span className="bin-title">Corbeille — {boardName}</span>
          <button className="bin-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="bin-section bin-section--done">Terminées</div>
        {doneList.length === 0 ? (
          <div className="bin-empty">Rien de terminé pour l'instant.</div>
        ) : (
          <div className="bin-list">
            {doneList.map((t) => (
              <div className="bin-item" key={t.id}>
                <span className="bin-dot" style={{ background: quadrant(t.quadrant).ink }} />
                <span className="bin-item__title bin-item__title--done">{t.title}</span>
                <button className="bin-restore" onClick={() => onRestore(t.id)}>
                  Rétablir
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bin-section bin-section--del">Supprimées</div>
        {delList.length === 0 ? (
          <div className="bin-empty">Rien de supprimé.</div>
        ) : (
          <div className="bin-list">
            {delList.map((t) => (
              <div className="bin-item" key={t.id}>
                <span className="bin-dot" style={{ background: quadrant(t.quadrant).ink }} />
                <span className="bin-item__title">{t.title}</span>
                <button className="bin-restore" onClick={() => onRestore(t.id)}>
                  Restaurer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
