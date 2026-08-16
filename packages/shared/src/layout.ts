import type { QuadrantKey } from './quadrants';
import type { Task } from './types';

/**
 * Tout ce qui s'ordonne par position fractionnaire. `Task` et `Board` la
 * satisfont : les helpers de position ci-dessous ne lisent que ces deux champs,
 * et les typer plus étroitement obligerait à dupliquer la logique pour les
 * matrices (cf. le réordonnancement de l'accueil).
 */
export interface Positioned {
  id: string;
  position: number;
}

/** Une tâche est visible dans sa case si non épinglée, non supprimée et pas déjà archivée. */
export function isVisible(t: Task, quad: QuadrantKey): boolean {
  return t.quadrant === quad && !t.pinned && !t.deleted && !(t.done && t.archived);
}

export function visibleTasks(tasks: Task[], boardId: string, quad: QuadrantKey): Task[] {
  return tasks
    .filter((t) => t.board_id === boardId && isVisible(t, quad))
    .sort((a, b) => a.position - b.position);
}

export function pinnedTasks(tasks: Task[], boardId: string, quad: QuadrantKey): Task[] {
  return tasks
    .filter(
      (t) => t.board_id === boardId && t.quadrant === quad && t.pinned && !t.deleted && !(t.done && t.archived),
    )
    .sort((a, b) => a.position - b.position);
}

/** Nombre de tâches ouvertes (non terminées, non supprimées) d'une case. */
export function countOpen(tasks: Task[], boardId: string, quad: QuadrantKey): number {
  return tasks.filter((t) => t.board_id === boardId && t.quadrant === quad && !t.done && !t.deleted).length;
}

/**
 * La partenaire d'une tâche appairée, ou `null`.
 *
 * L'appairage est un LIEN, pas une mise en page : une paire se déplace, s'épingle
 * et se supprime d'un bloc. Ce helper est le point unique où l'on retrouve
 * l'autre moitié — sans lui, chaque endroit qui déplace une tâche redécouvrirait
 * la règle, et c'est exactement comme ça que le lien se cassait en silence.
 *
 * Défensif sur deux cas hérités : une partenaire supprimée (rien à emmener) et
 * trois tâches partageant un même `pair_id`. Ce dernier n'est plus atteignable
 * par l'interface — on ne peut pas se greffer sur une paire déjà formée — mais
 * d'anciennes données peuvent le porter ; on prend alors la première venue plutôt
 * que d'échouer.
 */
export function partnerOf(tasks: Task[], task: Task): Task | null {
  if (!task.pair_id) return null;
  return tasks.find((o) => o.id !== task.id && o.pair_id === task.pair_id && !o.deleted) ?? null;
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

/** Position pour ajouter en fin de liste. */
export function endPosition(visible: Positioned[]): number {
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
 * Position pour insérer un élément juste avant `beforeId` dans une liste triée
 * (`visible` doit exclure l'élément déplacé). `beforeId` null → fin de liste.
 * Sert aux tâches comme aux matrices.
 */
export function positionBefore(visible: Positioned[], beforeId: string | null): number {
  if (!beforeId) return endPosition(visible);
  const index = visible.findIndex((t) => t.id === beforeId);
  if (index === -1) return endPosition(visible);
  const after = visible[index].position;
  const before = index > 0 ? visible[index - 1].position : after - 1;
  return (before + after) / 2;
}
