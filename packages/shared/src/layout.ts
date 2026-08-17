import type { QuadrantKey } from './quadrants';
import type { Board, Task, TaskPatch, Universe } from './types';

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

/** Un univers et les matrices qu'il contient. */
export interface UniverseGroup {
  /** `null` = les matrices non rangées. Ce groupe est toujours le dernier. */
  universe: Universe | null;
  boards: Board[];
}

/**
 * Groupe les matrices par univers, dans l'ordre des univers.
 *
 * Le groupe sans univers **ferme** la liste, par cohérence avec « À trier » qui
 * ferme la grille (`ALL = [...QUADS, PARK]`) : le non-classé se lit en bas, pas
 * en tête.
 *
 * Il est toujours présent, **même vide** — c'est la cible de dépôt qui permet de
 * sortir une matrice de son univers. Un affichage qui n'en a pas besoin (le
 * popup, par exemple) peut filtrer les groupes vides lui-même.
 *
 * Une matrice dont l'`universe_id` pointe vers un univers absent y retombe
 * aussi : une donnée incohérente ne doit jamais faire disparaître une matrice de
 * l'écran.
 */
export function groupByUniverse(universes: Universe[], boards: Board[]): UniverseGroup[] {
  const byPosition = <T extends Positioned>(a: T, b: T) => a.position - b.position;
  const ordered = [...universes].sort(byPosition);
  const known = new Set(ordered.map((u) => u.id));

  const groups: UniverseGroup[] = ordered.map((universe) => ({
    universe,
    boards: boards.filter((b) => b.universe_id === universe.id).sort(byPosition),
  }));

  groups.push({
    universe: null,
    boards: boards.filter((b) => !b.universe_id || !known.has(b.universe_id)).sort(byPosition),
  });
  return groups;
}

/**
 * Les matrices à plat, dans l'ordre où l'accueil les présente : univers par
 * univers, les non rangées en dernier.
 *
 * La vue globale en a besoin pour parcourir les matrices dans un ordre que
 * l'utilisateur reconnaît — celui qu'il a lui-même posé — plutôt que dans
 * l'ordre de chargement.
 */
export function orderedBoards(universes: Universe[], boards: Board[]): Board[] {
  return groupByUniverse(universes, boards).flatMap((g) => g.boards);
}

/** Les tâches d'une case appartenant à une même matrice, en lignes prêtes à rendre. */
export interface BoardGroup {
  board: Board;
  /** Lignes épinglées, à rendre en tête du groupe. */
  pinned: Task[][];
  rows: Task[][];
}

/**
 * Regroupe par matrice les tâches d'une case — le cœur de la vue globale.
 *
 * `tasks.position` est scopé à `(board_id, quadrant)` : deux tâches de matrices
 * différentes peuvent porter la MÊME position. Une vue agrégée n'a donc aucun
 * ordre global cohérent, et le regroupement est la seule agrégation honnête :
 * l'ordre manuel de chaque matrice est conservé tel quel, à l'intérieur de son
 * groupe.
 *
 * `boards` arrive déjà filtré et ordonné (cf. `orderedBoards`) : la portée —
 * toutes les matrices, ou celles d'un univers — est une décision d'écran, pas
 * de cette fonction.
 *
 * Une matrice qui n'a rien à montrer dans cette case ne produit PAS de groupe :
 * un cadre vide serait du bruit, et il y en aurait par dizaines dès qu'un compte
 * porte quelques matrices.
 *
 * L'invariant d'appairage tient sans une ligne de code : `buildRows` tournant
 * matrice par matrice, une paire — toujours intra-matrice, puisque
 * `planPairMove` emmène la partenaire jusque dans la matrice d'arrivée — retombe
 * dans un seul groupe. Un `pair_id` à cheval sur deux matrices, donnée
 * incohérente inatteignable par l'interface, dégrade en deux cartes simples.
 */
export function groupTasksByBoard(tasks: Task[], boards: Board[], quad: QuadrantKey): BoardGroup[] {
  const groups: BoardGroup[] = [];
  for (const board of boards) {
    const pinned = buildRows(pinnedTasks(tasks, board.id, quad));
    const rows = buildRows(visibleTasks(tasks, board.id, quad));
    if (pinned.length || rows.length) groups.push({ board, pinned, rows });
  }
  return groups;
}

/**
 * Une écriture à appliquer : l'identifiant d'une tâche et le patch à lui poser.
 *
 * Les fonctions `plan…` ci-dessous rendent des `TaskWrite` au lieu d'écrire
 * elles-mêmes. C'est ce qui les sort de React et de Supabase — et donc ce qui
 * les rend testables. L'appelant reste maître de la persistance et de
 * l'affichage.
 */
export interface TaskWrite {
  id: string;
  patch: TaskPatch;
}

/**
 * Prépare le déplacement d'une tâche **et de sa partenaire**, en les gardant
 * adjacentes.
 *
 * C'est l'invariant central de l'appairage : une paire reste ensemble, quoi
 * qu'on lui fasse. Il vivait auparavant en deux copies — une dans l'écran
 * matrice du web, une dans le popup — et le défaut s'est déjà produit : corrigé
 * d'un côté, oublié de l'autre pendant plusieurs jours.
 *
 * Le même `patch` s'applique aux deux : changer de case, de matrice ou d'état
 * d'épinglage concerne la paire entière. Seule la position diffère, pour que la
 * partenaire se range juste derrière.
 *
 * ⚠️ La partenaire se place **à mi-chemin de la voisine suivante**, et non à un
 * décalage fixe. Un décalage constant paraît suffisant tant que les positions
 * sont espacées, mais `positionBefore` divise l'écart par deux à chaque
 * insertion au même endroit : après une dizaine, l'écart entre voisines tombe
 * sous ce décalage, et la partenaire atterrit **au-delà** de la voisine — la
 * paire se retrouve à cheval sur une autre tâche.
 */
export function planPairMove(
  tasks: Task[],
  task: Task,
  patch: TaskPatch,
  position: number,
): TaskWrite[] {
  const mate = partnerOf(tasks, task);
  const writes: TaskWrite[] = [{ id: task.id, patch: { ...patch, position } }];
  if (mate) writes.push({ id: mate.id, patch: { ...patch, position: matePosition(tasks, task, mate, patch, position) } });
  return writes;
}

/**
 * Où poser la partenaire : entre la tâche déplacée et la voisine qui la suit
 * dans la case d'arrivée. Sans voisine, `+1` suffit — on est en fin de liste.
 *
 * La destination se lit dans le patch : c'est là que la paire va atterrir, pas
 * là d'où elle vient.
 */
function matePosition(
  tasks: Task[],
  task: Task,
  mate: Task,
  patch: TaskPatch,
  position: number,
): number {
  const boardId = patch.board_id ?? task.board_id;
  const quadrant = patch.quadrant ?? task.quadrant;
  const next = tasks
    .filter(
      (t) =>
        t.board_id === boardId &&
        t.quadrant === quadrant &&
        t.id !== task.id &&
        t.id !== mate.id &&
        !t.deleted &&
        t.position > position,
    )
    .reduce<number | null>((min, t) => (min === null || t.position < min ? t.position : min), null);
  return next === null ? position + 1 : (position + next) / 2;
}

/**
 * Applique un patch à la paire **sans toucher aux positions**.
 *
 * L'épinglage en a besoin : il concerne les deux tâches, mais ne les déplace
 * pas. Forcer une position factice pour réutiliser `planPairMove` reviendrait à
 * réordonner une paire à chaque fois qu'on l'épingle.
 */
export function planPairPatch(tasks: Task[], task: Task, patch: TaskPatch): TaskWrite[] {
  const mate = partnerOf(tasks, task);
  const writes: TaskWrite[] = [{ id: task.id, patch }];
  if (mate) writes.push({ id: mate.id, patch });
  return writes;
}

/**
 * Prépare la rupture du lien, **des deux côtés** — un `pair_id` orphelin ne
 * pointe vers rien et fausserait les recherches de partenaire.
 *
 * `patch` porte ce qui n'appartient qu'à la tâche qui s'en va : archivage,
 * suppression, ou rien du tout pour une dissociation volontaire. Ces trois
 * appelants faisaient la même chose sans en avoir l'air, chacun dans son coin.
 */
export function planPairDetach(tasks: Task[], task: Task, patch: TaskPatch = {}): TaskWrite[] {
  const mate = partnerOf(tasks, task);
  const writes: TaskWrite[] = [{ id: task.id, patch: { ...patch, pair_id: null } }];
  if (mate) writes.push({ id: mate.id, patch: { pair_id: null } });
  return writes;
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
