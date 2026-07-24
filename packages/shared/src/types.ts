import type { QuadrantKey } from './quadrants';

/**
 * Une pièce de la maison = une matrice. La maquette n'a pas de niveau
 * « matrices » séparé : chaque pièce porte directement ses tâches.
 */
export interface Room {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
}

/** Un élément placé dans une case de la matrice d'une pièce. */
export interface Task {
  id: string;
  user_id: string;
  room_id: string;
  title: string;
  quadrant: QuadrantKey;
  /** Cochée (part vers la corbeille « Terminées » après le délai d'annulation). */
  done: boolean;
  /** Épinglée en haut de sa case. */
  pinned: boolean;
  /** Terminée et archivée (visible seulement dans la corbeille). */
  archived: boolean;
  /** Supprimée (visible seulement dans la corbeille « Supprimées »). */
  deleted: boolean;
  /** Ordre dans (room, quadrant). Fractionnaire pour insérer entre deux voisins. */
  position: number;
  /** Deux tâches partageant un `pair_id` s'affichent côte à côte (une ligne). */
  pair_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Colonnes modifiables d'une tâche (le reste est géré par la base). */
export type TaskPatch = Partial<
  Pick<Task, 'title' | 'quadrant' | 'done' | 'pinned' | 'archived' | 'deleted' | 'position' | 'pair_id'>
>;
