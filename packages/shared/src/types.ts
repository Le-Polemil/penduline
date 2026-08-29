import type { QuadrantKey } from './quadrants';

/**
 * Un regroupement de matrices — Perso, Boulot, Maison…
 *
 * Facultatif de bout en bout : on peut n'en créer aucun, et une matrice peut
 * n'appartenir à aucun univers. C'est un état normal, pas un oubli à corriger.
 */
export interface Universe {
  id: string;
  user_id: string;
  name: string;
  position: number;
  created_at: string;
}

/**
 * Une matrice. Le découpage est libre : un lieu, un moment de la journée, un
 * projet… Chaque matrice porte ses tâches directement.
 *
 * Elle peut être rangée dans un univers, ou non. Supprimer un univers ne
 * supprime pas ses matrices : elles repassent simplement à `null`.
 */
export interface Board {
  id: string;
  user_id: string;
  name: string;
  /** `null` = pas rangée dans un univers. Un état normal. */
  universe_id: string | null;
  position: number;
  created_at: string;
}

/** Un élément placé dans une case d'une matrice. */
export interface Task {
  id: string;
  user_id: string;
  board_id: string;
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
  /** Ordre dans (board, quadrant). Fractionnaire pour insérer entre deux voisins. */
  position: number;
  /** Deux tâches partageant un `pair_id` s'affichent côte à côte (une ligne). */
  pair_id: string | null;
  /**
   * La tâche dont celle-ci est une étape. `null` = tâche de premier niveau.
   *
   * UN SEUL niveau : une sous-tâche ne peut pas en avoir, et la base le garantit
   * par un trigger. Une sous-tâche n'a pas non plus de case propre — son
   * classement urgent/important appartient à son parent (#50).
   */
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Colonnes modifiables d'une tâche (le reste est géré par la base).
 *
 * `board_id` en fait partie : une tâche peut changer de matrice. Sa `position`
 * doit alors être recalculée sur la cible, l'ordre étant scopé à
 * `(board_id, quadrant)`.
 */
export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'board_id'
    | 'quadrant'
    | 'done'
    | 'pinned'
    | 'archived'
    | 'deleted'
    | 'position'
    | 'pair_id'
    | 'parent_id'
  >
>;
