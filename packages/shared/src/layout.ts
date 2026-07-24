import type { QuadrantKey } from './quadrants';
import type { Task } from './types';

/** Une tâche est visible dans sa case si non épinglée, non supprimée et pas déjà archivée. */
export function isVisible(t: Task, quad: QuadrantKey): boolean {
  return t.quadrant === quad && !t.pinned && !t.deleted && !(t.done && t.archived);
}

export function visibleTasks(tasks: Task[], roomId: string, quad: QuadrantKey): Task[] {
  return tasks
    .filter((t) => t.room_id === roomId && isVisible(t, quad))
    .sort((a, b) => a.position - b.position);
}

export function pinnedTasks(tasks: Task[], roomId: string, quad: QuadrantKey): Task[] {
  return tasks
    .filter(
      (t) => t.room_id === roomId && t.quadrant === quad && t.pinned && !t.deleted && !(t.done && t.archived),
    )
    .sort((a, b) => a.position - b.position);
}

/** Nombre de tâches ouvertes (non terminées, non supprimées) d'une case. */
export function countOpen(tasks: Task[], roomId: string, quad: QuadrantKey): number {
  return tasks.filter((t) => t.room_id === roomId && t.quadrant === quad && !t.done && !t.deleted).length;
}

/** Groupe les tâches visibles en lignes de 1 ou 2 (appairage via `pair_id`). */
export function buildRows(visible: Task[]): Task[][] {
  const rows: Task[][] = [];
  const used = new Set<string>();
  for (const t of visible) {
    if (used.has(t.id)) continue;
    used.add(t.id);
    if (t.pair_id) {
      const partner = visible.find((o) => o.id !== t.id && o.pair_id === t.pair_id && !used.has(o.id));
      if (partner) {
        used.add(partner.id);
        rows.push([t, partner]);
        continue;
      }
    }
    rows.push([t]);
  }
  return rows;
}

/** Position pour ajouter en fin de case. */
export function endPosition(visible: Task[]): number {
  return visible.length ? Math.max(...visible.map((t) => t.position)) + 1 : 0;
}

/** Position pour insérer une ligne à l'index donné (entre deux lignes existantes). */
export function insertPosition(rows: Task[][], index: number): number {
  const rowPos = rows.map((r) => Math.min(...r.map((t) => t.position)));
  if (rows.length === 0) return 0;
  const after = index < rows.length ? rowPos[index] : rowPos[rows.length - 1] + 2;
  const before = index > 0 ? rowPos[index - 1] : rowPos[0] - 1;
  return (before + after) / 2;
}

/**
 * Position pour insérer une tâche juste avant `beforeId` dans une liste triée
 * (`visible` doit exclure la tâche déplacée). `beforeId` null → fin de liste.
 */
export function positionBefore(visible: Task[], beforeId: string | null): number {
  if (!beforeId) return endPosition(visible);
  const index = visible.findIndex((t) => t.id === beforeId);
  if (index === -1) return endPosition(visible);
  const after = visible[index].position;
  const before = index > 0 ? visible[index - 1].position : after - 1;
  return (before + after) / 2;
}
