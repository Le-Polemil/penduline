import type { TaskWrite } from '@penduline/shared';

/** Ce qu'il faut écrire pour défaire un geste, et de quoi le nommer. */
export interface UndoEntry {
  /** Ce que l'utilisateur lit dans le toast : le geste, pas l'objet. */
  label: string;
  /**
   * Les patchs inverses, un par tâche touchée.
   *
   * Plusieurs, parce qu'un geste peut en toucher deux : déplacer une paire
   * produit deux écritures, et les défaire séparément laisserait une moitié de
   * paire en arrière.
   */
  inverses: TaskWrite[];
}

/**
 * Profondeur de la pile. Dix, comme le suggère le ticket : au-delà, on ne se
 * souvient plus de ce qu'on annule, et la pile devient un générateur de surprises.
 */
export const UNDO_DEPTH = 10;

/** Empile en écartant le plus ancien au-delà de la profondeur retenue. */
export function push(stack: UndoEntry[], entry: UndoEntry): UndoEntry[] {
  return [...stack, entry].slice(-UNDO_DEPTH);
}

/**
 * Retire la dernière entrée. Rend la pile ET l'entrée, pour que l'appelant n'ait
 * pas à faire les deux gestes lui-même — et ne les fasse pas dans le désordre.
 */
export function pop(stack: UndoEntry[]): { rest: UndoEntry[]; entry: UndoEntry | null } {
  if (stack.length === 0) return { rest: stack, entry: null };
  return { rest: stack.slice(0, -1), entry: stack[stack.length - 1] };
}
