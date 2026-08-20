import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { countOpen, groupByUniverse, planBoardReorder, QUADS } from '@penduline/shared';
import type { Store } from '../data/store';
import { Confirm } from '../components/Confirm';
import { gapIndexAt } from '../dnd/gap';
import { ordinal, useAnnounce } from '../a11y/announce';

/** Durée d'un appui long, alignée sur la convention des OS mobiles. */
const LONG_PRESS_MS = 500;

/** Interstice survolé : à quel groupe il appartient, et à quelle place. */
type Gap = { universeId: string | null; index: number };

export function Home({
  store,
  onOpen,
  onGlobal,
}: {
  store: Store;
  onOpen: (boardId: string) => void;
  onGlobal: () => void;
}) {
  // `null` = bouton au repos ; une chaîne (même vide) = champ de saisie ouvert.
  const [draft, setDraft] = useState<string | null>(null);
  const [uniDraft, setUniDraft] = useState<string | null>(null);
  // Dernière matrice créée : porte l'animation d'apparition, le temps de celle-ci.
  const [fresh, setFresh] = useState<string | null>(null);
  // Renommage en place. Matrices et univers sont distincts : deux listes
  // différentes peuvent porter le même identifiant de saisie sinon.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [editingUni, setEditingUni] = useState<{ id: string; name: string } | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const [uniToDelete, setUniToDelete] = useState<string | null>(null);
  // Menu d'actions ouvert à l'appui long (tactile) : les actions au survol sont
  // inatteignables au doigt.
  const [sheet, setSheet] = useState<string | null>(null);
  /** Ce qui a ouvert la feuille — pour lui rendre le focus à la fermeture. */
  const sheetOrigin = useRef<HTMLElement | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [hoverGap, setHoverGap] = useState<Gap | null>(null);
  const pressTimer = useRef<number>();
  /** Un appui long déclenche aussi un `click` : on le neutralise. */
  const swallowClick = useRef(false);

  const announce = useAnnounce();

  // Un dialogue qui s'ouvre sans donner le focus laisse le clavier derrière lui :
  // la feuille resterait invisible à qui ne la voit pas apparaître.
  useEffect(() => {
    if (sheet) sheetRef.current?.focus();
  }, [sheet]);

  const groups = groupByUniverse(store.universes, store.boards);
  /**
   * Sans aucun univers, on n'affiche pas d'en-tête : l'accueil se lit alors
   * exactement comme avant cette fonctionnalité. C'est l'état de tous les
   * comptes au lendemain de la migration — il doit rester impeccable.
   */
  const grouped = store.universes.length > 0;

  function boardsOf(universeId: string | null) {
    return store.boards.filter((b) => b.universe_id === universeId).sort((a, b) => a.position - b.position);
  }

  /** Déposer dans un interstice range la matrice DANS ce groupe et l'y place. */
  function dropAt(universeId: string | null, beforeId: string | null) {
    if (!drag) return;
    void store.moveBoard(drag, universeId, beforeId);
    setDrag(null);
    setHoverGap(null);
  }

  /**
   * Monter / descendre une matrice dans son groupe.
   *
   * La règle vit désormais dans `packages/shared` : le tactile (feuille d'appui
   * long) et le clavier (boutons ↑ ↓) s'en servent tous les deux, et ses bornes
   * y sont enfin testées.
   */
  function move(id: string, dir: -1 | 1) {
    const board = store.boards.find((b) => b.id === id);
    if (!board) return;
    const plan = planBoardReorder(store.boards, board, dir);
    if (!plan) return;
    void store.moveBoard(id, board.universe_id, plan.beforeId);
    announce(`« ${board.name} » déplacée en ${ordinal(plan.index)} position sur ${plan.total}.`);
  }

  /** Ouvre la feuille en retenant d'où l'on vient (clavier), ou de rien (doigt). */
  function openSheet(id: string, trigger: HTMLElement | null) {
    sheetOrigin.current = trigger;
    setSheet(id);
  }

  function closeSheet() {
    setSheet(null);
    // Fermer un dialogue sans rendre le focus laisse le clavier au début du
    // document : on repart de la ligne qu'on venait de manipuler.
    sheetOrigin.current?.focus();
    sheetOrigin.current = null;
  }

  function pressStart(e: ReactPointerEvent, id: string) {
    if (e.pointerType !== 'touch') return;
    swallowClick.current = false;
    pressTimer.current = window.setTimeout(() => {
      swallowClick.current = true;
      openSheet(id, null);
    }, LONG_PRESS_MS);
  }
  function pressEnd() {
    window.clearTimeout(pressTimer.current);
  }

  async function create() {
    const name = (draft ?? '').trim();
    if (!name) return;
    // La nouvelle matrice arrive SANS univers, comme une tâche capturée arrive
    // dans « À trier » : créer et classer sont deux gestes distincts.
    const id = await store.addBoard(name);
    setDraft(null);
    if (id) {
      setFresh(id);
      window.setTimeout(() => setFresh((f) => (f === id ? null : f)), 700);
    }
  }

  async function createUniverse() {
    const name = (uniDraft ?? '').trim();
    if (!name) return;
    await store.addUniverse(name);
    setUniDraft(null);
  }

  function commitRename() {
    if (!editing) return;
    const name = editing.name.trim();
    const before = store.boards.find((b) => b.id === editing.id)?.name;
    if (name && name !== before) void store.renameBoard(editing.id, name);
    setEditing(null);
  }

  function commitUniRename() {
    if (!editingUni) return;
    const name = editingUni.name.trim();
    const before = store.universes.find((u) => u.id === editingUni.id)?.name;
    if (name && name !== before) void store.renameUniverse(editingUni.id, name);
    setEditingUni(null);
  }

  /** Monter / descendre un univers : même « avant le suivant » que les matrices. */
  function moveUniverse(id: string, dir: -1 | 1) {
    const list = store.universes;
    const i = list.findIndex((u) => u.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    void store.reorderUniverse(id, dir === -1 ? list[j].id : (list[j + 1]?.id ?? null));
    announce(`Univers « ${list[i].name} » déplacé en ${ordinal(j + 1)} position sur ${list.length}.`);
  }

  const doomed = store.boards.find((b) => b.id === toDelete) ?? null;
  const doomedCount = doomed ? store.tasks.filter((t) => t.board_id === doomed.id).length : 0;
  const doomedUni = store.universes.find((u) => u.id === uniToDelete) ?? null;
  const doomedUniCount = doomedUni ? boardsOf(doomedUni.id).length : 0;

  return (
    <div className="home">
      <h1 className="home-title">Penduline</h1>
      <p className="home-sub">
        Urgent n'est pas important. En croisant ces deux axes, on voit d'un coup d'œil
        quoi faire tout de suite, quoi planifier, quoi déléguer — et quoi laisser tomber.
      </p>

      {/* Au-dessus de la liste, parce que c'est une façon de la lire — pas une
          matrice de plus. Masquée tant qu'aucune matrice n'existe : il n'y
          aurait rien à voir d'ensemble. */}
      {store.boards.length > 0 && (
        <button className="home-global" onClick={onGlobal}>
          Vue globale
          <span className="home-global__hint">toutes vos tâches dans une seule grille</span>
        </button>
      )}

      {store.boards.length === 0 && !grouped ? (
        <p className="home-empty">
          Aucune matrice pour l'instant. Créez la première : une pièce, une journée,
          un projet… le découpage vous appartient.
        </p>
      ) : (
        <div
          className={`board-list${drag ? ' board-list--dragging' : ''}`}
          // Quitter la liste sans déposer doit effacer l'indicateur : sinon le
          // trait continue de désigner une destination qu'on a quittée. Le test
          // sur `relatedTarget` écarte les passages d'un enfant à l'autre, qui
          // déclenchent eux aussi `dragleave`.
          onDragLeave={(e: DragEvent) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            setHoverGap(null);
          }}
        >
          {groups.map((group) => {
            const universeId = group.universe?.id ?? null;
            // Le groupe sans univers reste un point de dépôt même vide — c'est
            // par lui qu'on SORT une matrice d'un univers. Mais on ne l'affiche
            // pas s'il est vide et qu'aucun déplacement n'est en cours : ce
            // serait un titre sans contenu.
            if (grouped && !group.universe && group.boards.length === 0 && !drag) return null;
            const uniEditing = editingUni?.id === universeId;

            return (
              <section
                className="uni"
                key={universeId ?? 'sans-univers'}
                // Repli du groupe : tout ce qui n'est pas une ligne — l'en-tête,
                // l'interstice de fin, un univers vide — range en fin de groupe.
                // Sans lui, un univers fraîchement créé serait inatteignable.
                onDragOver={(e: DragEvent) => {
                  if (!drag) return;
                  e.preventDefault();
                  setHoverGap({ universeId, index: group.boards.length });
                }}
                onDrop={(e: DragEvent) => {
                  if (!drag) return;
                  e.preventDefault();
                  dropAt(universeId, null);
                }}
              >
                {grouped && (
                  <div className="uni-head">
                    {uniEditing && editingUni ? (
                      <form
                        className="uni-head__rename"
                        onSubmit={(e) => {
                          e.preventDefault();
                          commitUniRename();
                        }}
                      >
                        <input
                          className="uni-head__input"
                          value={editingUni.name}
                          autoFocus
                          maxLength={120}
                          onChange={(e) => setEditingUni({ id: editingUni.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setEditingUni(null);
                          }}
                        />
                        <button className="board-act board-act--ok" type="submit" disabled={!editingUni.name.trim()}>
                          OK
                        </button>
                        <button className="board-act" type="button" onClick={() => setEditingUni(null)}>
                          Annuler
                        </button>
                      </form>
                    ) : (
                      <>
                        <span className="uni-head__name">{group.universe?.name ?? 'Sans univers'}</span>
                        {/* Le groupe sans univers n'est pas une ligne en base :
                            il n'a ni nom à changer ni existence à supprimer. */}
                        {group.universe && (
                          <span className="uni-head__actions">
                            <button
                              className="board-act"
                              aria-label={`Monter « ${group.universe.name} »`}
                              disabled={store.universes[0]?.id === universeId}
                              onClick={() => moveUniverse(group.universe!.id, -1)}
                            >
                              ↑
                            </button>
                            <button
                              className="board-act"
                              aria-label={`Descendre « ${group.universe.name} »`}
                              disabled={store.universes[store.universes.length - 1]?.id === universeId}
                              onClick={() => moveUniverse(group.universe!.id, 1)}
                            >
                              ↓
                            </button>
                            <button
                              className="board-act"
                              onClick={() => setEditingUni({ id: group.universe!.id, name: group.universe!.name })}
                            >
                              Renommer
                            </button>
                            <button
                              className="board-act board-act--danger"
                              onClick={() => setUniToDelete(group.universe!.id)}
                            >
                              Supprimer
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </div>
                )}

                {group.boards.map((board, index) => {
                  const pills = QUADS.map((q) => ({
                    ink: q.ink,
                    n: countOpen(store.tasks, board.id, q.key),
                  })).filter((p) => p.n > 0);
                  const total = store.tasks.filter(
                    (t) => t.board_id === board.id && !t.done && !t.deleted,
                  ).length;
                  const meta = total ? `${total} ${total > 1 ? 'tâches' : 'tâche'}` : 'Rien à faire';
                  const isEditing = editing?.id === board.id;

                  return (
                    <div
                      key={board.id}
                      // La ligne entière est la cible, et la moitié survolée
                      // désigne l'interstice. Viser un ruban de 10 px demandait
                      // une précision que personne n'a — et le manquer annulait
                      // le déplacement au lieu de le ranger.
                      onDragOver={(e: DragEvent) => {
                        if (!drag) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoverGap({ universeId, index: gapIndexAt(e.clientY, rect, index) });
                      }}
                      onDrop={(e: DragEvent) => {
                        if (!drag) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const at = gapIndexAt(e.clientY, rect, index);
                        dropAt(universeId, group.boards[at]?.id ?? null);
                      }}
                    >
                      <BoardGap active={hoverGap?.universeId === universeId && hoverGap.index === index} />
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
                        {isEditing && editing ? (
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
                              {/* Même motif que `.uni-head__actions`, qui avait
                                  déjà ses flèches : réordonner une MATRICE, lui,
                                  n'existait qu'au glisser et à l'appui long —
                                  donc pas au clavier. */}
                              <button
                                className="board-act"
                                aria-label={`Monter « ${board.name} »`}
                                disabled={!planBoardReorder(store.boards, board, -1)}
                                onClick={() => move(board.id, -1)}
                              >
                                ↑
                              </button>
                              <button
                                className="board-act"
                                aria-label={`Descendre « ${board.name} »`}
                                disabled={!planBoardReorder(store.boards, board, 1)}
                                onClick={() => move(board.id, 1)}
                              >
                                ↓
                              </button>
                              {/* La porte clavier d'un chemin déjà écrit : la
                                  feuille contient « Déplacer vers un univers »,
                                  et n'était atteignable qu'au doigt. */}
                              <button
                                className="board-act"
                                aria-label={`Autres actions pour « ${board.name} »`}
                                aria-haspopup="dialog"
                                onClick={(e) => openSheet(board.id, e.currentTarget)}
                              >
                                ⋯
                              </button>
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

                {/* Interstice de fin — un repère, pas une cible : c'est le
                    groupe lui-même qui capte le dépôt de fin, y compris vide. */}
                <BoardGap
                  active={hoverGap?.universeId === universeId && hoverGap.index === group.boards.length}
                />
              </section>
            );
          })}
        </div>
      )}

      <div className="home-actions">
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

        {uniDraft === null ? (
          <button className="add-board add-board--uni" onClick={() => setUniDraft('')}>
            ＋ Nouvel univers
          </button>
        ) : (
          <form
            className="add-board-form"
            onSubmit={(e) => {
              e.preventDefault();
              void createUniverse();
            }}
          >
            <input
              className="add-board-input"
              value={uniDraft}
              autoFocus
              placeholder="Nom de l'univers"
              maxLength={120}
              onChange={(e) => setUniDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setUniDraft(null);
              }}
            />
            <button className="add-board-submit" type="submit" disabled={!uniDraft.trim()}>
              Créer
            </button>
            <button className="add-board-cancel" type="button" onClick={() => setUniDraft(null)}>
              Annuler
            </button>
          </form>
        )}
      </div>

      {sheet && (() => {
        const b = store.boards.find((x) => x.id === sheet);
        if (!b) return null;
        const list = boardsOf(b.universe_id);
        return (
          <div className="sheet-backdrop" onClick={closeSheet}>
            <div
              className="sheet"
              role="dialog"
              aria-modal="true"
              aria-label={`Actions pour « ${b.name} »`}
              tabIndex={-1}
              ref={sheetRef}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') closeSheet();
              }}
            >
              <p className="sheet__title">{b.name}</p>
              {/* Le glisser-déposer HTML5 ne fonctionne pas au doigt : sans ces
                  entrées, réordonner ET ranger seraient impossibles sur mobile. */}
              <button
                className="sheet__item"
                disabled={list[0]?.id === b.id}
                onClick={() => {
                  move(b.id, -1);
                  closeSheet();
                }}
              >
                ↑ Monter
              </button>
              <button
                className="sheet__item"
                disabled={list[list.length - 1]?.id === b.id}
                onClick={() => {
                  move(b.id, 1);
                  closeSheet();
                }}
              >
                ↓ Descendre
              </button>
              {grouped && (
                <>
                  <p className="sheet__label">Déplacer vers un univers</p>
                  {store.universes.map((u) => (
                    <button
                      key={u.id}
                      className="sheet__item"
                      disabled={b.universe_id === u.id}
                      onClick={() => {
                        void store.moveBoard(b.id, u.id, null);
                        closeSheet();
                      }}
                    >
                      {u.name}
                    </button>
                  ))}
                  <button
                    className="sheet__item"
                    disabled={b.universe_id === null}
                    onClick={() => {
                      void store.moveBoard(b.id, null, null);
                      closeSheet();
                    }}
                  >
                    Sans univers
                  </button>
                </>
              )}
              <button
                className="sheet__item"
                onClick={() => {
                  setEditing({ id: b.id, name: b.name });
                  closeSheet();
                }}
              >
                Renommer
              </button>
              <button
                className="sheet__item sheet__item--danger"
                onClick={() => {
                  setToDelete(b.id);
                  closeSheet();
                }}
              >
                Supprimer
              </button>
              <button className="sheet__item sheet__item--cancel" onClick={closeSheet}>
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

      {doomedUni && (
        <Confirm
          title={`Supprimer l'univers « ${doomedUni.name} » ?`}
          // Rien ne se perd : `on delete set null` délie les matrices au lieu de
          // les emporter. D'où le ton neutre — ce n'est pas une destruction.
          body={
            doomedUniCount > 0
              ? `Ses ${doomedUniCount} matrice${doomedUniCount > 1 ? 's' : ''} ne ${doomedUniCount > 1 ? 'seront' : 'sera'} pas supprimée${doomedUniCount > 1 ? 's' : ''} : elle${doomedUniCount > 1 ? 's repasseront' : ' repassera'} sans univers.`
              : "Cet univers est vide."
          }
          confirmLabel="Supprimer l'univers"
          tone="neutral"
          onCancel={() => setUniToDelete(null)}
          onConfirm={() => {
            const id = doomedUni.id;
            setUniToDelete(null);
            void store.deleteUniverse(id);
          }}
        />
      )}
    </div>
  );
}

/**
 * Interstice entre deux matrices — un repère, plus une cible.
 *
 * Il portait jusqu'ici ses propres gestionnaires de dépôt, ce qui revenait à
 * demander au curseur de viser 10 px : hors de cette bande, plus rien
 * n'acceptait le dépôt et le navigateur annulait le déplacement. Le dépôt vit
 * désormais sur la ligne et sur le groupe ; il ne reste ici que l'affichage.
 *
 * Replié au repos pour ne rien coûter en hauteur, il s'ouvre quand il est
 * désigné — même mécanique que les `.row-gap` de l'écran matrice, pour que les
 * deux listes se manipulent pareil.
 */
function BoardGap({ active }: { active: boolean }) {
  return (
    <div className={`board-gap${active ? ' board-gap--active' : ''}`}>
      <div className="board-gap__line" />
    </div>
  );
}
