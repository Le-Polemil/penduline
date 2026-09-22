import type { Attachment, BoardPlacement, BoardRange, Task, Universe } from './types';

/**
 * Fabrique de tâches pour les tests.
 *
 * `Task` porte quinze champs. Les écrire à la main dans chaque test noierait
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
    author_id: 'u1',
    board_id: 'b1',
    title: `Tâche ${seq}`,
    quadrant: 'faire',
    done: false,
    archived: false,
    deleted: false,
    // 0 par défaut, jamais dérivé du compteur : un test qui dépend de l'ordre
    // doit le dire, pas l'hériter de son rang d'appel.
    position: 0,
    pair_id: null,
    parent_id: null,
    due_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    /** Hors sélection par défaut : c'est l'état de presque toutes les tâches. */
    focus_day: null,
    // Aligné sur `created_at` par défaut : une tâche fraîchement créée n'a jamais
    // changé de case. Un test de revue qui veut le contraire le dit (#47).
    quadrant_changed_at: '2026-01-01T00:00:00.000Z',
    /** Pas cochée par défaut, donc pas de date, et personne à nommer. */
    completed_at: null,
    completed_by: null,
    // `'user'` par défaut : c'est l'origine de tout ce que l'application crée.
    // Un test de la pastille « agent » le dit (#23).
    origin: 'user',
    ...partial,
  };
}

/** Une liste de tâches aux positions 0, 1, 2… et aux identifiants donnés. */
export function makeList(ids: string[], partial: Partial<Task> = {}): Task[] {
  return ids.map((id, i) => makeTask({ id, position: i, ...partial }));
}

/**
 * Une matrice ASSEMBLÉE — la matrice et son rangement — non rangée et non
 * partagée par défaut, c'est l'état le plus courant.
 *
 * `BoardRange` et non `Board` : depuis #53, `universe_id` et `position` vivent
 * dans `board_placements`, et c'est la forme assemblée que tous les écrans
 * reçoivent. Les tests de rangement doivent donc travailler dessus.
 */
export function makeBoard(partial: Partial<BoardRange> = {}): BoardRange {
  seq += 1;
  return {
    id: `b${seq}`,
    user_id: 'u1',
    name: `Matrice ${seq}`,
    created_at: '2026-01-01T00:00:00.000Z',
    origin: 'user',
    universe_id: null,
    position: 0,
    /** `null` = on est le propriétaire. Une matrice reçue porte son rôle. */
    role: null,
    partagee: false,
    ...partial,
  };
}

/** Un rangement personnel, hors univers par défaut. */
export function makePlacement(partial: Partial<BoardPlacement> = {}): BoardPlacement {
  return {
    board_id: 'b1',
    user_id: 'u1',
    universe_id: null,
    position: 0,
    ...partial,
  };
}

export function makeUniverse(partial: Partial<Universe> = {}): Universe {
  seq += 1;
  return {
    id: `u${seq}`,
    user_id: 'u1',
    name: `Univers ${seq}`,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    origin: 'user',
    ...partial,
  };
}

/** Un lien attaché, sans nom par défaut — le cas le plus courant à la capture. */
export function makeAttachment(partial: Partial<Attachment> = {}): Attachment {
  seq += 1;
  return {
    id: `a${seq}`,
    task_id: 't1',
    author_id: 'u1',
    board_id: 'b1',
    url: `https://exemple.test/${seq}`,
    label: null,
    position: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}
