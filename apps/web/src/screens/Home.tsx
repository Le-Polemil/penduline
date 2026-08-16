import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { countOpen, QUADS } from '@penduline/shared';
import type { Store } from '../data/store';
import { Confirm } from '../components/Confirm';

/** Durée d'un appui long, alignée sur la convention des OS mobiles. */
const LONG_PRESS_MS = 500;

export function Home({ store, onOpen }: { store: Store; onOpen: (boardId: string) => void }) {
  // `null` = bouton au repos ; une chaîne (même vide) = champ de saisie ouvert.
  const [draft, setDraft] = useState<string | null>(null);
  // Dernière matrice créée : porte l'animation d'apparition, le temps de celle-ci.
  const [fresh, setFresh] = useState<string | null>(null);
  // Renommage en place : { id, nom en cours de saisie }.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  // Menu d'actions ouvert à l'appui long (tactile) : les actions au survol sont
  // inatteignables au doigt.
  const [sheet, setSheet] = useState<string | null>(null);
  // Réordonnancement à la souris : matrice en cours de déplacement, et interstice
  // survolé (index dans la liste, `boards.length` = tout en bas).
  const [drag, setDrag] = useState<string | null>(null);
  const [hoverGap, setHoverGap] = useState<number | null>(null);
  const pressTimer = useRef<number>();
  /** Un appui long déclenche aussi un `click` : on le neutralise. */
  const swallowClick = useRef(false);

  function dropAt(index: number) {
    if (!drag) return;
    void store.reorderBoard(drag, store.boards[index]?.id ?? null);
    setDrag(null);
    setHoverGap(null);
  }

  /**
   * Équivalent tactile du glisser-déposer, via la feuille d'appui long.
   * Descendre passe devant le voisin SUIVANT celui du dessous : « avant le
   * suivant » est la seule façon d'exprimer « après » avec `positionBefore`.
   */
  function move(id: string, dir: -1 | 1) {
    const i = store.boards.findIndex((b) => b.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= store.boards.length) return;
    const beforeId = dir === -1 ? store.boards[j].id : (store.boards[j + 1]?.id ?? null);
    void store.reorderBoard(id, beforeId);
  }

  function pressStart(e: ReactPointerEvent, id: string) {
    if (e.pointerType !== 'touch') return;
    swallowClick.current = false;
    pressTimer.current = window.setTimeout(() => {
      swallowClick.current = true;
      setSheet(id);
    }, LONG_PRESS_MS);
  }
  function pressEnd() {
    window.clearTimeout(pressTimer.current);
  }

  async function create() {
    const name = (draft ?? '').trim();
    if (!name) return;
    const id = await store.addBoard(name);
    setDraft(null);
    // Pas de redirection : la matrice apparaît simplement au bout de la liste.
    if (id) {
      setFresh(id);
      window.setTimeout(() => setFresh((f) => (f === id ? null : f)), 700);
    }
  }

  function commitRename() {
    if (!editing) return;
    const name = editing.name.trim();
    const before = store.boards.find((b) => b.id === editing.id)?.name;
    if (name && name !== before) void store.renameBoard(editing.id, name);
    setEditing(null);
  }

  const doomed = store.boards.find((b) => b.id === toDelete) ?? null;
  const doomedCount = doomed ? store.tasks.filter((t) => t.board_id === doomed.id).length : 0;

  return (
    <div className="home">
      <h1 className="home-title">Penduline</h1>
      <p className="home-sub">
        Urgent n'est pas important. En croisant ces deux axes, on voit d'un coup d'œil
        quoi faire tout de suite, quoi planifier, quoi déléguer — et quoi laisser tomber.
      </p>

      {store.boards.length === 0 ? (
        <p className="home-empty">
          Aucune matrice pour l'instant. Créez la première : une pièce, une journée,
          un projet… le découpage vous appartient.
        </p>
      ) : (
        <div className="board-list">
          {store.boards.map((board, index) => {
            const pills = QUADS.map((q) => ({ ink: q.ink, n: countOpen(store.tasks, board.id, q.key) })).filter(
              (p) => p.n > 0,
            );
            const total = store.tasks.filter((t) => t.board_id === board.id && !t.done && !t.deleted).length;
            const meta = total ? `${total} ${total > 1 ? 'tâches' : 'tâche'}` : 'Rien à faire';
            const isEditing = editing?.id === board.id;

            return (
              <div key={board.id}>
                <BoardGap
                  active={hoverGap === index}
                  dragging={!!drag}
                  onOver={() => setHoverGap(index)}
                  onDrop={() => dropAt(index)}
                />
                <div
                  className={[
                    'board-row',
                    board.id === fresh ? 'board-row--fresh' : '',
                    drag === board.id ? 'board-row--dragging' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  // `draggable` sur le conteneur, jamais sur `.board-card` : un
                  // <button> déplaçable se comporte mal, et le clic d'ouverture
                  // doit continuer de fonctionner.
                  draggable={!isEditing}
                  onDragStart={(e: DragEvent) => {
                    e.dataTransfer.effectAllowed = 'move';
                    window.setTimeout(() => setDrag(board.id), 0);
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setHoverGap(null);
                  }}
                >
                {isEditing ? (
                  <form
                    className="board-row__rename"
                    onSubmit={(e) => {
                      e.preventDefault();
                      commitRename();
                    }}
                  >
                    <input
                      className="board-row__input"
                      value={editing.name}
                      autoFocus
                      maxLength={120}
                      onChange={(e) => setEditing({ id: board.id, name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                    <button className="board-act board-act--ok" type="submit" disabled={!editing.name.trim()}>
                      OK
                    </button>
                    <button className="board-act" type="button" onClick={() => setEditing(null)}>
                      Annuler
                    </button>
                  </form>
                ) : (
                  <>
                    <button
                      className="board-card"
                      onClick={() => {
                        if (swallowClick.current) {
                          swallowClick.current = false;
                          return;
                        }
                        onOpen(board.id);
                      }}
                      onPointerDown={(e) => pressStart(e, board.id)}
                      onPointerUp={pressEnd}
                      onPointerCancel={pressEnd}
                      onPointerLeave={pressEnd}
                      onContextMenu={(e) => e.preventDefault()}
                    >
                      <span className="board-card__name">{board.name}</span>
                      <span className="board-card__meta">{meta}</span>
                      <span className="board-card__pills">
                        {pills.map((p, i) => (
                          <span key={i} className="pill" style={{ background: p.ink }}>
                            {p.n}
                          </span>
                        ))}
                      </span>
                    </button>
                    <span className="board-row__actions">
                      <button
                        className="board-act"
                        title="Renommer"
                        aria-label={`Renommer « ${board.name} »`}
                        onClick={() => setEditing({ id: board.id, name: board.name })}
                      >
                        Renommer
                      </button>
                      <button
                        className="board-act board-act--danger"
                        title="Supprimer"
                        aria-label={`Supprimer « ${board.name} »`}
                        onClick={() => setToDelete(board.id)}
                      >
                        Supprimer
                      </button>
                    </span>
                  </>
                )}
                </div>
              </div>
            );
          })}
          {/* Dernier interstice : déposer ici envoie la matrice en fin de liste. */}
          <BoardGap
            active={hoverGap === store.boards.length}
            dragging={!!drag}
            onOver={() => setHoverGap(store.boards.length)}
            onDrop={() => dropAt(store.boards.length)}
          />
        </div>
      )}

      {draft === null ? (
        <button className="add-board" onClick={() => setDraft('')}>
          ＋ Nouvelle matrice
        </button>
      ) : (
        <form
          className="add-board-form"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <input
            className="add-board-input"
            value={draft}
            autoFocus
            placeholder="Nom de la matrice"
            maxLength={120}
            onChange={(e) => setDraft(e.target.value)}
            // Échap annule. Volontairement pas de fermeture au blur : cliquer sur
            // « Créer » déclenche d'abord le blur, ce qui perdrait la saisie.
            onKeyDown={(e) => {
              if (e.key === 'Escape') setDraft(null);
            }}
          />
          <button className="add-board-submit" type="submit" disabled={!draft.trim()}>
            Créer
          </button>
          <button className="add-board-cancel" type="button" onClick={() => setDraft(null)}>
            Annuler
          </button>
        </form>
      )}

      {sheet && (() => {
        const b = store.boards.find((x) => x.id === sheet);
        if (!b) return null;
        return (
          <div className="sheet-backdrop" onClick={() => setSheet(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <p className="sheet__title">{b.name}</p>
              {/* Le glisser-déposer HTML5 ne fonctionne pas au doigt : sans ces
                  deux entrées, réordonner serait impossible sur mobile. */}
              <button
                className="sheet__item"
                disabled={store.boards[0]?.id === b.id}
                onClick={() => {
                  move(b.id, -1);
                  setSheet(null);
                }}
              >
                ↑ Monter
              </button>
              <button
                className="sheet__item"
                disabled={store.boards[store.boards.length - 1]?.id === b.id}
                onClick={() => {
                  move(b.id, 1);
                  setSheet(null);
                }}
              >
                ↓ Descendre
              </button>
              <button
                className="sheet__item"
                onClick={() => {
                  setEditing({ id: b.id, name: b.name });
                  setSheet(null);
                }}
              >
                Renommer
              </button>
              <button
                className="sheet__item sheet__item--danger"
                onClick={() => {
                  setToDelete(b.id);
                  setSheet(null);
                }}
              >
                Supprimer
              </button>
              <button className="sheet__item sheet__item--cancel" onClick={() => setSheet(null)}>
                Annuler
              </button>
            </div>
          </div>
        );
      })()}

      {doomed && (
        <Confirm
          title={`Supprimer « ${doomed.name} » ?`}
          body={
            doomedCount > 0
              ? `${doomedCount > 1 ? `Ses ${doomedCount} tâches seront supprimées` : 'Sa tâche sera supprimée'} avec elle, corbeille comprise. C'est définitif.`
              : "Cette matrice est vide. C'est définitif."
          }
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const id = doomed.id;
            setToDelete(null);
            void store.deleteBoard(id);
          }}
        />
      )}
    </div>
  );
}

/**
 * Interstice de dépôt entre deux matrices. Replié au repos pour ne rien coûter
 * en hauteur, il s'ouvre pendant un déplacement — même mécanique que les
 * `.row-gap` de l'écran matrice, pour que les deux listes se manipulent pareil.
 */
function BoardGap({
  active,
  dragging,
  onOver,
  onDrop,
}: {
  active: boolean;
  dragging: boolean;
  onOver: () => void;
  onDrop: () => void;
}) {
  return (
    <div
      className={`board-gap${active ? ' board-gap--active' : ''}`}
      onDragOver={(e: DragEvent) => {
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        onOver();
      }}
      onDrop={(e: DragEvent) => {
        if (!dragging) return;
        e.preventDefault();
        e.stopPropagation();
        onDrop();
      }}
    >
      <div className="board-gap__line" />
    </div>
  );
}
