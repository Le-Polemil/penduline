import { useState, type CSSProperties, type DragEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  ALL,
  buildRows,
  countOpen,
  endPosition,
  insertPosition,
  partnerOf,
  pinnedTasks,
  planPairDetach,
  planPairMove,
  planPairPatch,
  planReorder,
  visibleTasks,
  type QuadrantKey,
  type Board,
  type Quadrant,
  type Task,
  type TaskWrite,
} from '@penduline/shared';
import type { Store } from '../data/store';
import { Confirm } from '../components/Confirm';
import { BinModal } from '../components/BinModal';
import { TaskCard } from '../components/TaskCard';
import { useCompletion } from '../data/useCompletion';
import { ordinal, useAnnounce } from '../a11y/announce';
import type { Scope } from './Global';

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
  onGlobal,
}: {
  store: Store;
  board: Board;
  onHome: () => void;
  onSwitch: (boardId: string) => void;
  onGlobal: (scope: Scope) => void;
}) {
  const { tasks, patchTask } = store;
  const [boardMenu, setBoardMenu] = useState(false);
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  /** `null` = titre affiché ; une chaîne = renommage en cours. */
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [drag, setDrag] = useState<Drag>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [focusQuad, setFocusQuad] = useState<QuadrantKey | null>(null);
  /** Renommage en place : `{ id, titre en cours de saisie }`. */
  const [renamingTask, setRenamingTask] = useState<{ id: string; title: string } | null>(null);
  /** Déplacement d'une paire vers une autre matrice, en attente de confirmation. */
  const [moveAsk, setMoveAsk] = useState<{ task: Task; mate: Task; target: Board } | null>(null);

  const { onCheck, pending } = useCompletion(tasks, patchTask);
  const announce = useAnnounce();

  const boardTasks = tasks.filter((t) => t.board_id === board.id);
  const totalOpen = boardTasks.filter((t) => !t.done && !t.deleted).length;
  const otherBoards = store.boards.filter((b) => b.id !== board.id);

  /**
   * Applique des écritures préparées par `packages/shared`.
   *
   * La règle d'appairage vit désormais là-bas, sous forme de fonctions pures qui
   * rendent ce qu'il y a à écrire. Ici on ne fait plus que persister — et c'est
   * cette séparation qui rend la règle testable.
   */
  function apply(writes: TaskWrite[]) {
    for (const w of writes) patchTask(w.id, w.patch);
  }

  function commitTaskRename() {
    if (!renamingTask) return;
    const title = renamingTask.title.trim();
    const before = tasks.find((t) => t.id === renamingTask.id)?.title;
    // Un titre vide ou inchangé n'écrit rien : la contrainte `tasks_title_check`
    // refuserait le premier, et le second coûterait une requête pour rien.
    if (title && title !== before) patchTask(renamingTask.id, { title });
    setRenamingTask(null);
  }

  /**
   * Change une tâche de matrice. La position est recalculée sur la CIBLE :
   * l'ordre est scopé à `(board_id, quadrant)`, la conserver produirait un
   * classement incohérent dans la matrice d'arrivée.
   */
  function moveToBoard(task: Task, target: Board) {
    const pos = endPosition(visibleTasks(tasks, target.id, task.quadrant));
    withVT(() => apply(planPairMove(tasks, task, { board_id: target.id }, pos)));
  }

  /**
   * Une paire suit sa tâche d'une matrice à l'autre — l'invariant de #51 ne
   * souffre pas d'exception. Mais deux tâches qui partent quand on en a désigné
   * une seule mérite d'être annoncé : d'où la confirmation, **uniquement** dans
   * ce cas. La demander à chaque déplacement lasserait pour rien.
   */
  function askMoveToBoard(task: Task, target: Board) {
    setMenuTask(null);
    const mate = partnerOf(tasks, task);
    if (mate) setMoveAsk({ task, mate, target });
    else moveToBoard(task, target);
  }

  /** Défait le lien des deux côtés — un `pair_id` orphelin ne sert à rien. */
  function unpair(task: Task) {
    withVT(() => apply(planPairDetach(tasks, task)));
    setMenuTask(null);
  }

  /**
   * L'alternative clavier au glisser-déposer (#38), servie par les entrées de menu
   * ET par `Alt`+↑/↓ — un seul chemin de code pour les deux gestes.
   *
   * L'annonce dit la position ATTEINTE, pas le geste : « montée » obligerait à
   * relire la case entière pour savoir où l'on en est.
   */
  function reorderTask(t: Task, dir: -1 | 1) {
    const plan = planReorder(tasks, t, dir);
    if (!plan) return;
    withVT(() => apply(plan.writes));
    announce(`« ${t.title} » déplacée en ${ordinal(plan.index)} position sur ${plan.total}.`);
    setMenuTask(null);
  }

  // ── Menu : déplacer / épingler / supprimer ────────────────────────────────
  function menuMove(id: string, quad: QuadrantKey) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const pos = endPosition(visibleTasks(tasks, board.id, quad));
    withVT(() => apply(planPairMove(tasks, task, { quadrant: quad }, pos)));
    setMenuTask(null);
  }
  function togglePin(t: Task) {
    if (t.pinned) {
      const pos = endPosition(visibleTasks(tasks, board.id, t.quadrant));
      withVT(() => apply(planPairMove(tasks, t, { pinned: false }, pos)));
    } else {
      // Épingler ne change pas les positions : les épinglées ont leur propre
      // zone, et la paire y sera regroupée par `buildRows` comme ailleurs.
      withVT(() => apply(planPairPatch(tasks, t, { pinned: true })));
    }
    setMenuTask(null);
  }
  function removeTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    // Même règle qu'à l'archivage : la survivante est dissociée plutôt que de
    // garder un lien qui ne pointe plus vers rien.
    if (task) withVT(() => apply(planPairDetach(tasks, task, { deleted: true, pinned: false })));
    setMenuTask(null);
  }

  // ── Drag & drop ───────────────────────────────────────────────────────────
  function dropEnd(quad: QuadrantKey) {
    if (!drag) return;
    const task = tasks.find((t) => t.id === drag.id);
    if (!task) return;
    const pos = endPosition(visibleTasks(tasks, board.id, quad));
    // Glisser une tâche appairée emmène sa partenaire : c'est le comportement
    // inverse de l'ancien, et c'est voulu.
    withVT(() => apply(planPairMove(tasks, task, { quadrant: quad }, pos)));
    setDrag(null);
    setHover(null);
  }
  function dropInsert(quad: QuadrantKey, rowIndex: number) {
    if (!drag) return;
    const task = tasks.find((t) => t.id === drag.id);
    if (!task) return;
    // La paire déplacée sort de la liste de référence — les DEUX tâches, sinon
    // la partenaire servirait de repère à son propre déplacement.
    const mate = partnerOf(tasks, task);
    const rest = visibleTasks(tasks, board.id, quad).filter(
      (t) => t.id !== task.id && t.id !== mate?.id,
    );
    const pos = insertPosition(buildRows(rest), rowIndex);
    withVT(() => apply(planPairMove(tasks, task, { quadrant: quad }, pos)));
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

  // `done && !deleted`, sans exiger `archived` : contrepartie obligatoire du
  // masquage sur `done` seul (#75). Sans elle, une tâche héritée de l'ancien
  // comportement — cochée, jamais archivée — sortirait de la grille sans entrer
  // ici : invisible ET irrécupérable. « Rétablir » la normalise au passage.
  const doneList = boardTasks.filter((t) => t.done && !t.deleted);
  const delList = boardTasks.filter((t) => t.deleted);

  /**
   * Une carte, câblée sur l'état local de l'écran.
   *
   * `drag`, `split` et `reorder` sont fournis ici parce que la matrice les
   * autorise tous les trois — la vue globale, elle, omet les deux derniers.
   *
   * `row` et `rowCount` situent la LIGNE de la carte dans sa zone (épinglées ou
   * ordinaires). Les bornes s'en déduisent sans recalcul : le rendu vient de
   * construire ces lignes, autant s'en servir.
   */
  function card(
    t: Task,
    q: Quadrant,
    single: boolean,
    pinnedCard: boolean,
    row: number,
    rowCount: number,
  ) {
    const splitOk = single && !t.pinned && !t.done && !!drag && drag.id !== t.id;
    return (
      <TaskCard
        key={t.id}
        task={t}
        quad={q}
        tasks={tasks}
        otherBoards={otherBoards}
        pinnedCard={pinnedCard}
        menuOpen={menuTask === t.id}
        onMenu={(open) => setMenuTask(open ? t.id : null)}
        rename={{
          value: renamingTask?.id === t.id ? renamingTask.title : null,
          start: () => setRenamingTask({ id: t.id, title: t.title }),
          change: (value) => setRenamingTask({ id: t.id, title: value }),
          cancel: () => setRenamingTask(null),
          commit: commitTaskRename,
        }}
        onCheck={() => onCheck(t)}
        onMoveQuad={(key) => menuMove(t.id, key)}
        onMoveBoard={(b) => askMoveToBoard(t, b)}
        onTogglePin={() => togglePin(t)}
        onUnpair={() => unpair(t)}
        onDelete={() => removeTask(t.id)}
        drag={{
          dragging: drag?.id === t.id,
          start: () => setDrag({ id: t.id, quad: q.key }),
          end: () => {
            setDrag(null);
            setHover(null);
          },
        }}
        reorder={{
          up: row > 0 ? () => reorderTask(t, -1) : null,
          down: row < rowCount - 1 ? () => reorderTask(t, 1) : null,
        }}
        split={{
          ok: splitOk,
          active: splitOk && hover?.type === 'card' && hover.taskId === t.id,
          over: () => setHover({ type: 'card', taskId: t.id }),
          drop: () => dropPair(q.key, t.id),
        }}
      />
    );
  }

  return (
    <div className="matrix">
      <div className="matrix-head">
        <span className="board-switch">
          {renaming === null ? (
            <button className="board-switch__name" onClick={() => setBoardMenu((o) => !o)}>
              <span className="board-switch__label">{board.name}</span>
              <span className="board-switch__caret">▾</span>
            </button>
          ) : (
            <form
              className="board-rename"
              onSubmit={(e) => {
                e.preventDefault();
                const name = renaming.trim();
                if (name && name !== board.name) void store.renameBoard(board.id, name);
                setRenaming(null);
              }}
            >
              <input
                className="board-rename__input"
                value={renaming}
                autoFocus
                maxLength={120}
                onChange={(e) => setRenaming(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setRenaming(null);
                }}
              />
              <button className="board-rename__ok" type="submit" disabled={!renaming.trim()}>
                OK
              </button>
            </form>
          )}
          {boardMenu && (
            <span className="board-menu">
              {/* La vue globale ouvre la liste : c'est le même geste — « où
                  veux-je regarder » — et le menu est déjà l'endroit où on en
                  décide. */}
              <button
                className="board-menu__item"
                onClick={() => {
                  setBoardMenu(false);
                  setMenuTask(null);
                  // Toutes les matrices, pas l'univers de celle-ci : le menu
                  // sert à élargir le regard, et le sélecteur de portée de la
                  // vue globale permet ensuite de le resserrer.
                  onGlobal({ kind: 'all' });
                }}
              >
                Vue globale
              </button>
              <span className="board-menu__sep" />
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
              <span className="board-menu__sep" />
              <button
                className="board-menu__item"
                onClick={() => {
                  setRenaming(board.name);
                  setBoardMenu(false);
                }}
              >
                Renommer
              </button>
              <button
                className="board-menu__item board-menu__item--danger"
                onClick={() => {
                  setBoardMenu(false);
                  setConfirmDelete(true);
                }}
              >
                Supprimer la matrice
              </button>
            </span>
          )}
        </span>
        <span className="matrix-total">
          {totalOpen ? `${totalOpen} ${totalOpen > 1 ? 'tâches ouvertes' : 'tâche ouverte'}` : 'Tout est fait'}
        </span>
        <button
          className="bin-btn"
          // Sans nom, l'arbre d'accessibilité annonçait ce bouton « 0 » : son
          // propre compteur lui tenait lieu d'intitulé.
          aria-label={`Corbeille, ${doneList.length + delList.length} élément${doneList.length + delList.length > 1 ? 's' : ''}`}
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
          const pinnedRows = buildRows(pinnedTasks(tasks, board.id, q.key, pending));
          const rows = buildRows(visibleTasks(tasks, board.id, q.key, pending));
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
                {q.sub && <span className="quad-sub">{q.sub}</span>}
                <span className="quad-count">{countOpen(tasks, board.id, q.key)}</span>
              </div>

              {/* Les épinglées passent aussi par `buildRows` : sans ça, une paire
                  épinglée s'afficherait sur deux lignes — cassée, alors qu'on
                  vient justement de garantir qu'une paire reste ensemble. */}
              {pinnedRows.map((cards, i) => (
                <div className={`card-row${cards.length === 2 ? ' card-row--paired' : ''}`} key={`pin-${i}`}>
                  {cards.map((t) => card(t, q, cards.length === 1, true, i, pinnedRows.length))}
                </div>
              ))}

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
                    <div className={`card-row${cards.length === 2 ? ' card-row--paired' : ''}`}>
                      {cards.map((t) => card(t, q, cards.length === 1, false, i, rows.length))}
                    </div>
                  </div>
                );
              })}

              <div className="quad-fill" />

              {/*
                Le « ＋ » reste le MÊME élément au repos et en saisie : il glisse
                du centre vers la droite pendant que le mot « ajouter » se replie.
                Le remplacer par un autre bouton le faisait se téléporter.
                Au repos il est inerte (pointer-events), pour que le clic tombe
                sur le champ et le focus ; actif, il devient le bouton d'envoi.
              */}
              <div className={`add-row${focused || draft ? ' add-row--active' : ''}`}>
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
                <span className="add-cue">
                  <button
                    className="add-plus"
                    type="button"
                    aria-label="Ajouter une tâche"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addTask(q.key);
                    }}
                  >
                    ＋
                  </button>
                  <span className="add-word">ajouter</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {binOpen && (
        <BinModal
          scope={board.name}
          doneList={doneList}
          delList={delList}
          onClose={() => withVT(() => setBinOpen(false))}
          onRestore={(id) => withVT(() => patchTask(id, { done: false, archived: false, deleted: false }))}
          onPurge={(ids) => void store.purgeTasks(ids)}
        />
      )}

      {confirmDelete && (
        <Confirm
          title={`Supprimer « ${board.name} » ?`}
          body={
            boardTasks.length > 0
              ? `${boardTasks.length > 1 ? `Ses ${boardTasks.length} tâches seront supprimées` : 'Sa tâche sera supprimée'} avec elle, corbeille comprise. C'est définitif.`
              : "Cette matrice est vide. C'est définitif."
          }
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false);
            await store.deleteBoard(board.id);
            onHome();
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
