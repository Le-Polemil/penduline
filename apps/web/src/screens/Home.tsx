import { countOpen, QUADS } from '@penduline/shared';
import type { Store } from '../data/store';

export function Home({ store, onOpen }: { store: Store; onOpen: (roomId: string) => void }) {
  async function addRoom() {
    const id = await store.addRoom();
    if (id) onOpen(id);
  }

  return (
    <div className="home">
      <h1 className="home-title">Penduline</h1>
      <p className="home-sub">L'état de la maison en un regard — une matrice par pièce.</p>

      <div className="room-list">
        {store.rooms.map((room) => {
          const pills = QUADS.map((q) => ({ ink: q.ink, n: countOpen(store.tasks, room.id, q.key) })).filter(
            (p) => p.n > 0,
          );
          const total = store.tasks.filter((t) => t.room_id === room.id && !t.done && !t.deleted).length;
          const meta = total ? `${total} ${total > 1 ? 'tâches' : 'tâche'}` : 'rien à faire';
          return (
            <button key={room.id} className="room-card" onClick={() => onOpen(room.id)}>
              <span className="room-card__name">{room.name}</span>
              <span className="room-card__meta">{meta}</span>
              <span className="room-card__pills">
                {pills.map((p, i) => (
                  <span key={i} className="pill" style={{ background: p.ink }}>
                    {p.n}
                  </span>
                ))}
              </span>
              <span className="room-card__chev">›</span>
            </button>
          );
        })}
      </div>

      <button className="add-room" onClick={addRoom}>
        ＋ Ajouter une pièce
      </button>
    </div>
  );
}
