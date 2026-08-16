import type { Task } from './types';

/**
 * Fabrique de tâches pour les tests.
 *
 * `Task` porte treize champs. Les écrire à la main dans chaque test noierait
 * l'intention sous le bruit : ici, seul ce que le test fait varier apparaît.
 *
 * Volontairement NON exporté depuis `index.ts` — c'est de l'outillage de test,
 * pas de la surface publique du paquet.
 */
let seq = 0;

export function makeTask(partial: Partial<Task> = {}): Task {
  seq += 1;
  return {
    id: `t${seq}`,
    user_id: 'u1',
    board_id: 'b1',
    title: `Tâche ${seq}`,
    quadrant: 'faire',
    done: false,
    pinned: false,
    archived: false,
    deleted: false,
    // 0 par défaut, jamais dérivé du compteur : un test qui dépend de l'ordre
    // doit le dire, pas l'hériter de son rang d'appel.
    position: 0,
    pair_id: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

/** Une liste de tâches aux positions 0, 1, 2… et aux identifiants donnés. */
export function makeList(ids: string[], partial: Partial<Task> = {}): Task[] {
  return ids.map((id, i) => makeTask({ id, position: i, ...partial }));
}
