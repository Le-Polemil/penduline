import { useState, type CSSProperties, type DragEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  ALL,
  endPosition,
  groupTasksByBoard,
  orderedBoards,
  partnerOf,
  planPairDetach,
  planPairMove,
  planPairPatch,
  visibleTasks,
  type Board,
  type Quadrant,
  type QuadrantKey,
  type Task,
  type TaskWrite,
} from '@penduline/shared';
import type { Store } from '../data/store';
import { BinModal } from '../components/BinModal';
import { Confirm } from '../components/Confirm';
import { TaskCard } from '../components/TaskCard';
import { useCompletion } from '../data/useCompletion';

/** Ce que la vue globale montre : tout, ou un univers. */
export type Scope = { kind: 'all' } | { kind: 'universe'; id: string };

/**
 * Les trois dosages du cadre qui réunit les tâches d'une même matrice.
 *
 * Les trois sont implémentées côté CSS (`.grid--filet` / `--cadre` /
 * `--etiquette`) : changer d'avis ne coûte que la constante ci-dessous, et en
 * faire un réglage utilisateur ne demandera que de la lire ailleurs.
 *
 *   filet      un trait vertical dilué à gauche du groupe, nom au-dessus
 *   cadre      une bordure fermée, nom en pastille chevauchant le bord
 *   etiquette  le nom seul, le regroupement ne tenant qu'à l'espacement
 */
export type BoardFrame = 'filet' | 'cadre' | 'etiquette';

/** La variante en vigueur. Un jour un réglage ; aujourd'hui, une constante. */
const FRAME: BoardFrame = 'cadre';

/** Anime un changement structurel via l'API View Transitions (dégradation gracieuse). */
function withVT(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (doc.startViewTransition) doc.startViewTransition(() => flushSync(fn));
  else fn();
}

/**
 * Toutes les tâches dans une seule grille — toutes matrices, ou un univers.
 *
 * `tasks.position` étant scopé à `(board_id, quadrant)`, deux tâches de matrices
 * différentes peuvent porter la MÊME position : il n'existe aucun ordre global.
 * D'où le regroupement par matrice à l'intérieur de chaque case, et le retrait
 * assumé de deux gestes — réordonner et appairer par dépôt — qui présupposent
 * un ordre. Ils ne sont pas cassés en silence : ils ne s'affichent pas.
 *
 * Reste le seul geste qui n'en dépend pas : déposer sur une autre case. La tâche
 * change de quadrant et se pose en fin de liste DANS SA PROPRE MATRICE.
 */
export function GlobalScreen({
  store,
  scope,
  onScope,
}: {
  store: Store;
  scope: Scope;
  onScope: (scope: Scope) => void;
}) {
  const { tasks, patchTask } = store;
  const [scopeMenu, setScopeMenu] = useState(false);
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const [renamingTask, setRenamingTask] = useState<{ id: string; title: string } | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  /** Déplacement d'une paire vers une autre matrice, en attente de confirmation. */
  const [moveAsk, setMoveAsk] = useState<{ task: Task; mate: Task; target: Board } | null>(null);

  const { pending, onCheck, undo } = useCompletion(tasks, patchTask);

  // Garde-fou : l'univers choisi comme portée peut avoir été supprimé ailleurs
  // (autre onglet, autre appareil). On retombe sur « toutes les matrices »
  // plutôt que d'afficher une grille vide sans explication.
  const universe = scope.kind === 'universe' ? store.universes.find((u) => u.id === scope.id) ?? null : null;
  const scoped: Scope = scope.kind === 'universe' && !universe ? { kind: 'all' } : scope;

  // L'ordre de l'accueil, filtré : la portée est une décision d'écran, et les
  // fonctions partagées n'ont donc rien à savoir des univers.
  const boards = orderedBoards(store.universes, store.boards).filter(
    (b) => scoped.kind === 'all' || b.universe_id === scoped.id,
  );
  const scopeLabel = universe?.name ?? 'Toutes les matrices';

  const inScope = new Set(boards.map((b) => b.id));
  const scopedTasks = tasks.filter((t) => inScope.has(t.board_id));
  const totalOpen = scopedTasks.filter((t) => !t.done && !t.deleted).length;
  const doneList = scopedTasks.filter((t) => t.done && t.archived && !t.deleted);
  const delList = scopedTasks.filter((t) => t.deleted);

  function apply(writes: TaskWrite[]) {
    for (const w of writes) patchTask(w.id, w.patch);
  }

  function commitTaskRename() {
    if (!renamingTask) return;
    const title = renamingTask.title.trim();
    const before = tasks.find((t) => t.id === renamingTask.id)?.title;
    if (title && title !== before) patchTask(renamingTask.id, { title });
    setRenamingTask(null);
  }

  /**
   * Changer de case. La position se calcule dans la matrice de la tâche, jamais
   * dans l'agrégat : c'est là que son ordre a un sens.
   */
  function moveQuad(task: Task, quad: QuadrantKey) {
    const pos = endPosition(visibleTasks(tasks, task.board_id, quad));
    withVT(() => apply(planPairMove(tasks, task, { quadrant: quad }, pos)));
    setMenuTask(null);
  }

  function moveToBoard(task: Task, target: Board) {
    const pos = endPosition(visibleTasks(tasks, target.id, task.quadrant));
    withVT(() => apply(planPairMove(tasks, task, { board_id: target.id }, pos)));
  }

  /** Même règle que l'écran matrice : on n'annonce que le départ d'une PAIRE. */
  function askMoveToBoard(task: Task, target: Board) {
    setMenuTask(null);
    const mate = partnerOf(tasks, task);
    if (mate) setMoveAsk({ task, mate, target });
    else moveToBoard(task, target);
  }

  function togglePin(t: Task) {
    if (t.pinned) {
      const pos = endPosition(visibleTasks(tasks, t.board_id, t.quadrant));
      withVT(() => apply(planPairMove(tasks, t, { pinned: false }, pos)));
    } else {
      withVT(() => apply(planPairPatch(tasks, t, { pinned: true })));
    }
    setMenuTask(null);
  }

  function unpair(task: Task) {
    withVT(() => apply(planPairDetach(tasks, task)));
    setMenuTask(null);
  }

  function removeTask(task: Task) {
    withVT(() => apply(planPairDetach(tasks, task, { deleted: true, pinned: false })));
    setMenuTask(null);
  }

  /** Le seul dépôt de cet écran : sur une case, jamais entre deux cartes. */
  function dropOnQuad(quad: QuadrantKey) {
    if (!drag) return;
    const task = tasks.find((t) => t.id === drag);
    setDrag(null);
    if (!task) return;
    const pos = endPosition(visibleTasks(tasks, task.board_id, quad));
    withVT(() => apply(planPairMove(tasks, task, { quadrant: quad }, pos)));
  }

  /**
   * Une carte de la vue globale.
   *
   * `split` est volontairement absent : appairer suppose de poser la nouvelle
   * venue juste après sa partenaire, donc un ordre — et il n'en existe pas ici.
   */
  function card(t: Task, q: Quadrant, pinnedCard: boolean) {
    return (
      <TaskCard
        key={t.id}
        task={t}
        quad={q}
        tasks={tasks}
        // Toutes les matrices du compte, pas seulement celles de la portée :
        // l'action concerne la tâche, pas la vue. Déplacer hors portée la fait
        // sortir de l'écran, et c'est la conséquence juste.
        otherBoards={store.boards.filter((b) => b.id !== t.board_id)}
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
        onMoveQuad={(key) => moveQuad(t, key)}
        onMoveBoard={(b) => askMoveToBoard(t, b)}
        onTogglePin={() => togglePin(t)}
        onUnpair={() => unpair(t)}
        onDelete={() => removeTask(t)}
        drag={{
          dragging: drag === t.id,
          start: () => setDrag(t.id),
          end: () => setDrag(null),
        }}
      />
    );
  }

  return (
    <div className="matrix">
      <div className="matrix-head">
        <span className="board-switch">
          {/* Sans aucun univers, il n'existe qu'une portée : un menu à une seule
              entrée coûterait un clic pour rien. Même règle que l'accueil, qui
              n'affiche pas d'en-tête de groupe dans ce cas. */}
          {store.universes.length > 0 ? (
            <button className="board-switch__name" onClick={() => setScopeMenu((o) => !o)}>
              <span className="board-switch__label">{scopeLabel}</span>
              <span className="board-switch__caret">▾</span>
            </button>
          ) : (
            <span className="board-switch__name board-switch__name--static">
              <span className="board-switch__label">{scopeLabel}</span>
            </span>
          )}
          {scopeMenu && (
            <span className="board-menu">
              <button
                className={`board-menu__item${scoped.kind === 'all' ? ' board-menu__item--active' : ''}`}
                onClick={() => {
                  onScope({ kind: 'all' });
                  setScopeMenu(false);
                  setMenuTask(null);
                }}
              >
                Toutes les matrices
              </button>
              <span className="board-menu__sep" />
              {store.universes.map((u) => (
                <button
                  key={u.id}
                  className={`board-menu__item${scoped.kind === 'universe' && scoped.id === u.id ? ' board-menu__item--active' : ''}`}
                  onClick={() => {
                    onScope({ kind: 'universe', id: u.id });
                    setScopeMenu(false);
                    setMenuTask(null);
                  }}
                >
                  {u.name}
                </button>
              ))}
            </span>
          )}
        </span>
        <span className="matrix-total">
          {totalOpen ? `${totalOpen} ${totalOpen > 1 ? 'tâches ouvertes' : 'tâche ouverte'}` : 'Tout est fait'}
        </span>
        <button
          className="bin-btn"
          style={{ viewTransitionName: binOpen ? 'none' : 'bin' } as CSSProperties}
          onClick={() => {
            withVT(() => setBinOpen(true));
            setMenuTask(null);
            setScopeMenu(false);
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

      {boards.length === 0 ? (
        <p className="home-empty">
          {universe
            ? `« ${universe.name} » ne contient aucune matrice pour l'instant.`
            : "Aucune matrice pour l'instant."}
        </p>
      ) : (
        <div className={`grid grid--${FRAME}`}>
          {ALL.map((q) => {
            const groups = groupTasksByBoard(tasks, boards, q.key);
            const open = scopedTasks.filter((t) => t.quadrant === q.key && !t.done && !t.deleted).length;
            return (
              <div
                key={q.key}
                className={`quad${q.key === 'parking' ? ' quad--park' : ''}${drag ? ' quad--drag' : ''}`}
                style={{
                  '--q-ink': q.ink,
                  '--q-dark': q.dark,
                  '--q-bg': q.bg,
                  // Le fond RÉEL derrière la case : « À trier » est transparente,
                  // c'est donc celui de la page. La variante « cadre » y découpe
                  // sa pastille — sans quoi le nom serait barré par la bordure.
                  '--q-solid': q.bg === 'transparent' ? 'var(--color-bg)' : q.bg,
                  '--q-outline': drag ? q.ink : q.key === 'parking' ? 'var(--color-neutral-300)' : 'transparent',
                } as CSSProperties}
                onDragOver={(e: DragEvent) => {
                  if (drag) e.preventDefault();
                }}
                onDrop={(e: DragEvent) => {
                  if (drag) {
                    e.preventDefault();
                    dropOnQuad(q.key);
                  }
                }}
              >
                <div className="quad-head">
                  <span className="quad-label">{q.label}</span>
                  {q.sub && <span className="quad-sub">{q.sub}</span>}
                  <span className="quad-count">{open}</span>
                </div>

                {groups.map((g) => (
                  // `role="group"` + `aria-label` : sans eux, la case s'annonce
                  // comme une liste plate de cartes venues de nulle part — soit
                  // la disparition, au lecteur d'écran, de ce que cet écran
                  // apporte. L'étiquette reste inerte : aucun arrêt de
                  // tabulation de plus, et ils se comptent ici par matrice.
                  <div className="bgroup" key={g.board.id} role="group" aria-label={`Matrice ${g.board.name}`}>
                    <div className="bgroup__name">{g.board.name}</div>
                    <div className="bgroup__body">
                      {g.pinned.map((cards, i) => (
                        <div className={`card-row${cards.length === 2 ? ' card-row--paired' : ''}`} key={`pin-${i}`}>
                          {cards.map((t) => card(t, q, true))}
                        </div>
                      ))}
                      {g.rows.map((cards, i) => (
                        <div className={`card-row${cards.length === 2 ? ' card-row--paired' : ''}`} key={`row-${i}`}>
                          {cards.map((t) => card(t, q, false))}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                <div className="quad-fill" />
              </div>
            );
          })}
        </div>
      )}

      {binOpen && (
        <BinModal
          // Le nom d'univers garde sa casse — c'est un nom propre. Seule la
          // portée « tout » se met en minuscules pour se lire dans la phrase.
          scope={universe ? universe.name : 'toutes les matrices'}
          doneList={doneList}
          delList={delList}
          onClose={() => withVT(() => setBinOpen(false))}
          onRestore={(id) => withVT(() => patchTask(id, { done: false, archived: false, deleted: false }))}
          onPurge={(ids) => void store.purgeTasks(ids)}
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
