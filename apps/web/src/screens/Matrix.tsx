import { useEffect, useState, type CSSProperties, type DragEvent } from 'react';
import { flushSync } from 'react-dom';
import {
  ALL,
  buildRows,
  countOpen,
  deleteLabel,
  endPosition,
  insertPosition,
  isOpenRow,
  partnerOf,
  pinnedTasks,
  planDelete,
  planPairDetach,
  planPairMove,
  planPairPatch,
  planReorder,
  planRestore,
  quadrant,
  subtasksOf,
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
import { useBinCount } from '../data/useBinCount';
import { ordinal, useAnnounce } from '../a11y/announce';
import type { Scope } from './Global';

type Hover =
  | { type: 'end'; quad: QuadrantKey }
  | { type: 'gap'; quad: QuadrantKey; row: number }
  | { type: 'card'; taskId: string }
  | null;

type Drag = { id: string; quad: QuadrantKey } | null;

/** Où le repli des étapes est retenu, par appareil. */
const SUB_KEY = 'penduline:subtasks-open';

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
  focusTask,
  openBin,
}: {
  store: Store;
  board: Board;
  onHome: () => void;
  onSwitch: (boardId: string) => void;
  onGlobal: (scope: Scope) => void;
  /** Tâche à mettre en évidence à l'arrivée (venue de la recherche). */
  focusTask?: string;
  /** Ouvrir la corbeille d'emblée : la tâche visée n'est pas dans la grille. */
  openBin?: boolean;
}) {
  const { tasks, patchTask } = store;
  const [boardMenu, setBoardMenu] = useState(false);
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const [binOpen, setBinOpen] = useState(false);
  /** La tâche que la recherche a désignée, le temps de son clignotement. */
  const [flash, setFlash] = useState<string | null>(null);
  /**
   * Les tâches dont les étapes sont dépliées. Local et par appareil, en
   * `localStorage` comme le repli des univers : c'est un état de lecture.
   */
  const [ouvertes, setOuvertes] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(window.localStorage.getItem(SUB_KEY) ?? '[]') as string[]);
    } catch {
      // Stockage refusé ou contenu corrompu : tout replié vaut mieux que rien.
      return new Set();
    }
  });

  function basculer(id: string) {
    setOuvertes((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      try {
        window.localStorage.setItem(SUB_KEY, JSON.stringify([...n]));
      } catch {
        // Perdre la mémoire du repli est un désagrément, pas une panne.
      }
      return n;
    });
  }
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
  /** Suppression d'une tâche à étapes, en attente de confirmation. */
  const [delAsk, setDelAsk] = useState<Task | null>(null);

  const { onCheck, pending } = useCompletion(tasks, patchTask);
  const binCount = useBinCount(store, [board.id]);

  /**
   * Arrivée depuis la recherche : on amène la tâche sous les yeux.
   *
   * Le défilement seul ne suffit pas — au milieu d'une case pleine, rien ne dit
   * laquelle des cartes on était venu voir. D'où le clignotement, qui s'éteint
   * de lui-même.
   */
  useEffect(() => {
    if (!focusTask) return;
    if (openBin) {
      // La tâche est terminée ou supprimée : elle n'est pas dans la grille, et
      // son contenu n'est plus chargé au démarrage depuis #40.
      void store.loadBin([board.id]);
      setBinOpen(true);
      return;
    }
    setFlash(focusTask);
    const t = window.setTimeout(() => setFlash((f) => (f === focusTask ? null : f)), 2000);
    // Après peinture : l'élément peut ne pas exister au moment de l'effet.
    const r = window.requestAnimationFrame(() => {
      document
        .querySelector(`[data-task="${focusTask}"]`)
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return () => {
      window.clearTimeout(t);
      window.cancelAnimationFrame(r);
    };
   }, [focusTask, openBin, board.id, store]);
  const announce = useAnnounce();

  const boardTasks = tasks.filter((t) => t.board_id === board.id);
  const totalOpen = boardTasks.filter(isOpenRow).length;
  const otherBoards = store.boards.filter((b) => b.id !== board.id);

  /**
   * Applique des écritures préparées par `packages/shared`.
   *
   * La règle d'appairage vit désormais là-bas, sous forme de fonctions pures qui
   * rendent ce qu'il y a à écrire. Ici on ne fait plus que persister — et c'est
   * cette séparation qui rend la règle testable.
   */
  /**
   * Applique des écritures préparées par `packages/shared`, en UN geste annulable.
   *
   * Le libellé dit le geste, pas l'objet — c'est lui que le toast d'annulation
   * affiche. Et le groupement est ce qui fait qu'une paire déplacée se défait
   * d'un seul `Ctrl+Z`, et non par moitiés (#46).
   */
  function apply(label: string, writes: TaskWrite[]) {
    store.group(label, () => {
      for (const w of writes) void patchTask(w.id, w.patch);
    });
  }

  function commitTaskRename() {
    if (!renamingTask) return;
    const title = renamingTask.title.trim();
    const before = tasks.find((t) => t.id === renamingTask.id)?.title;
    // Un titre vide ou inchangé n'écrit rien : la contrainte `tasks_title_check`
    // refuserait le premier, et le second coûterait une requête pour rien.
    // Par `group` et non par `patchTask` directement : sinon le renommage
    // s'écrit hors de tout groupe, aucun inverse n'est retenu, et `Ctrl+Z`
    // afficherait son toast sans rien défaire (#46).
    if (title && title !== before) {
      const id = renamingTask.id;
      store.group('Renommée', () => void patchTask(id, { title }));
    }
    setRenamingTask(null);
  }

  /**
   * Change une tâche de matrice. La position est recalculée sur la CIBLE :
   * l'ordre est scopé à `(board_id, quadrant)`, la conserver produirait un
   * classement incohérent dans la matrice d'arrivée.
   */
  function moveToBoard(task: Task, target: Board) {
    const pos = endPosition(visibleTasks(tasks, target.id, task.quadrant));
    withVT(() => apply(`Déplacée vers « ${target.name} »`, planPairMove(tasks, task, { board_id: target.id }, pos)));
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

  /**
   * Restauration depuis la corbeille — les étapes du parent reviennent avec lui.
   * Groupée pour que `Ctrl+Z` défasse le tout d'un coup (#46).
   */
  function restore(id: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    withVT(() => apply('Restaurée', planRestore(tasks, t)));
  }

  /** Défait le lien des deux côtés — un `pair_id` orphelin ne sert à rien. */
  function unpair(task: Task) {
    withVT(() => apply('Dissociée', planPairDetach(tasks, task)));
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
    withVT(() => apply(`Déplacée en ${ordinal(plan.index)} position`, plan.writes));
    announce(`« ${t.title} » déplacée en ${ordinal(plan.index)} position sur ${plan.total}.`);
    setMenuTask(null);
  }

  // ── Menu : déplacer / épingler / supprimer ────────────────────────────────
  function menuMove(id: string, quad: QuadrantKey) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const pos = endPosition(visibleTasks(tasks, board.id, quad));
    withVT(() => apply(`Déplacée vers « ${quadrant(quad).label} »`, planPairMove(tasks, task, { quadrant: quad }, pos)));
    setMenuTask(null);
  }
  function togglePin(t: Task) {
    if (t.pinned) {
      const pos = endPosition(visibleTasks(tasks, board.id, t.quadrant));
      withVT(() => apply('Désépinglée', planPairMove(tasks, t, { pinned: false }, pos)));
    } else {
      // Épingler ne change pas les positions : les épinglées ont leur propre
      // zone, et la paire y sera regroupée par `buildRows` comme ailleurs.
      withVT(() => apply('Épinglée', planPairPatch(tasks, t, { pinned: true })));
    }
    setMenuTask(null);
  }
  /**
   * On confirme quand, et seulement quand, la suppression est plus large que ce
   * qu'on a désigné : une tâche à étapes les emporte toutes. C'est la règle
   * déjà tenue par `askMoveToBoard` pour les paires — la demander à chaque
   * suppression lasserait pour rien, la suppression étant douce et annulable.
   */
  function askRemoveTask(id: string) {
    setMenuTask(null);
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    if (subtasksOf(tasks, task.id).length > 0) setDelAsk(task);
    else removeTask(id);
  }

  function removeTask(id: string) {
    const task = tasks.find((t) => t.id === id);
    // Même règle qu'à l'archivage : la survivante est dissociée plutôt que de
    // garder un lien qui ne pointe plus vers rien.
    if (task) withVT(() => apply(deleteLabel(tasks, task), planDelete(tasks, task)));
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
    withVT(() => apply(`Déplacée vers « ${quadrant(quad).label} »`, planPairMove(tasks, task, { quadrant: quad }, pos)));
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
    withVT(() => apply(`Déplacée vers « ${quadrant(quad).label} »`, planPairMove(tasks, task, { quadrant: quad }, pos)));
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
  // La corbeille liste des TÂCHES. Une étape n'y figure pas seule : hors de son
  // parent elle n'a plus de sens, et elle revient avec lui (`planRestore`).
  const doneList = boardTasks.filter((t) => t.done && !t.deleted && !t.parent_id);
  const delList = boardTasks.filter((t) => t.deleted && !t.parent_id);

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
        flash={flash === t.id}
        subtasks={{
          open: ouvertes.has(t.id),
          onToggleOpen: () => basculer(t.id),
          onAdd: (title, position) =>
            store.group('Étape ajoutée', () => void store.addTask(board.id, t.quadrant, title, position, t.id)),
          // Une étape se coche SANS délai d'annulation : elle est sous les yeux,
          // dans une liste courte, et `Ctrl+Z` la rattrape s'il le faut.
          onCheck: (st) =>
            store.group(st.done ? 'Étape rouverte' : 'Étape terminée', () =>
              void patchTask(st.id, { done: !st.done, archived: !st.done }),
            ),
          onDelete: (st) => store.group('Étape supprimée', () => void patchTask(st.id, { deleted: true })),
        }}
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
        onDelete={() => askRemoveTask(t.id)}
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
          aria-label={`Corbeille, ${binCount} élément${binCount > 1 ? 's' : ''}`}
          style={{ viewTransitionName: binOpen ? 'none' : 'bin' } as CSSProperties}
          onClick={() => {
            // Le contenu n'est plus en mémoire au démarrage (#40) : on le
            // demande ici, une seule fois par session.
            void store.loadBin([board.id]);
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
          {binCount}
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
          onRestore={(id) => restore(id)}
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

      {delAsk && (
        <Confirm
          title={`Supprimer « ${delAsk.title} » ?`}
          body={(() => {
            const n = subtasksOf(tasks, delAsk.id).length;
            return `${n > 1 ? `Ses ${n} étapes partiront` : 'Son étape partira'} à la corbeille avec elle. Vous pourrez tout restaurer.`;
          })()}
          onCancel={() => setDelAsk(null)}
          onConfirm={() => {
            removeTask(delAsk.id);
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
