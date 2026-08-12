import { useState } from 'react';
import { countOpen, QUADS } from '@penduline/shared';
import type { Store } from '../data/store';
import { Confirm } from '../components/Confirm';

export function Home({ store, onOpen }: { store: Store; onOpen: (boardId: string) => void }) {
  // `null` = bouton au repos ; une chaîne (même vide) = champ de saisie ouvert.
  const [draft, setDraft] = useState<string | null>(null);
  // Dernière matrice créée : porte l'animation d'apparition, le temps de celle-ci.
  const [fresh, setFresh] = useState<string | null>(null);
  // Renommage en place : { id, nom en cours de saisie }.
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [toDelete, setToDelete] = useState<string | null>(null);

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
          {store.boards.map((board) => {
            const pills = QUADS.map((q) => ({ ink: q.ink, n: countOpen(store.tasks, board.id, q.key) })).filter(
              (p) => p.n > 0,
            );
            const total = store.tasks.filter((t) => t.board_id === board.id && !t.done && !t.deleted).length;
            const meta = total ? `${total} ${total > 1 ? 'tâches' : 'tâche'}` : 'Rien à faire';
            const isEditing = editing?.id === board.id;

            return (
              <div key={board.id} className={`board-row${board.id === fresh ? ' board-row--fresh' : ''}`}>
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
                    <button className="board-card" onClick={() => onOpen(board.id)}>
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
            );
          })}
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
