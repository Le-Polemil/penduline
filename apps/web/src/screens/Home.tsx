import { useState } from 'react';
import { countOpen, QUADS } from '@penduline/shared';
import type { Store } from '../data/store';

export function Home({ store, onOpen }: { store: Store; onOpen: (boardId: string) => void }) {
  // `null` = bouton au repos ; une chaîne (même vide) = champ de saisie ouvert.
  const [draft, setDraft] = useState<string | null>(null);

  async function create() {
    const name = (draft ?? '').trim();
    if (!name) return;
    const id = await store.addBoard(name);
    setDraft(null);
    if (id) onOpen(id);
  }

  return (
    <div className="home">
      <h1 className="home-title">Penduline</h1>
      <p className="home-sub">Une matrice par contexte — un lieu, un moment, un projet.</p>

      {store.boards.length === 0 ? (
        <p className="home-empty">
          Aucune matrice pour l'instant. Crée la première : une pièce, une journée,
          un chantier… le découpage t'appartient.
        </p>
      ) : (
        <div className="board-list">
          {store.boards.map((board) => {
            const pills = QUADS.map((q) => ({ ink: q.ink, n: countOpen(store.tasks, board.id, q.key) })).filter(
              (p) => p.n > 0,
            );
            const total = store.tasks.filter((t) => t.board_id === board.id && !t.done && !t.deleted).length;
            const meta = total ? `${total} ${total > 1 ? 'tâches' : 'tâche'}` : 'rien à faire';
            return (
              <button key={board.id} className="board-card" onClick={() => onOpen(board.id)}>
                <span className="board-card__name">{board.name}</span>
                <span className="board-card__meta">{meta}</span>
                <span className="board-card__pills">
                  {pills.map((p, i) => (
                    <span key={i} className="pill" style={{ background: p.ink }}>
                      {p.n}
                    </span>
                  ))}
                </span>
                <span className="board-card__chev">›</span>
              </button>
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
    </div>
  );
}
