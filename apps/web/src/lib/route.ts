import type { Scope } from '../screens/Global';

/**
 * Ce que l'application affiche.
 *
 * Naguère un `boardId: string | null` — un booléen déguisé, qui ne pouvait pas
 * exprimer un troisième écran. La vue globale porte sa portée avec elle : elle
 * survit ainsi à un aller-retour vers l'accueil.
 */
export type View =
  | { kind: 'home' }
  /**
   * `focusTask` : la tâche à mettre en évidence à l'arrivée, venue de la
   * recherche. `openBin` quand elle est terminée ou supprimée — ouvrir sur une
   * grille où la tâche n'est pas serait pire que ne rien faire.
   */
  | { kind: 'board'; id: string; focusTask?: string; openBin?: boolean }
  | { kind: 'global'; scope: Scope }
  /** Le mode « aujourd'hui » (#49). Sans portée : il regarde tout le compte. */
  | { kind: 'focus' }
  /** La revue périodique (#47). Sans portée : elle regarde tout le compte. */
  | { kind: 'review' }
  /** La rétrospective (#48). Sans portée : elle regarde tout le compte. */
  | { kind: 'stats' };

export const HOME: View = { kind: 'home' };

/**
 * Une vue = une URL. Sans ça l'adresse restait « / » partout, et « Retour » (le geste
 * du téléphone, surtout dans la PWA) n'avait aucune page précédente à rendre : il
 * fermait l'application.
 *
 * Les adresses sont en français, comme l'interface. `focusTask` et `openBin` n'y
 * figurent pas : ce sont des consignes d'arrivée, pas une adresse (voir `useRoute`).
 */
const BOARD_PATH = /^\/matrice\/([^/]+)$/;
const GLOBAL_PATH = /^\/globale(?:\/([^/]+))?$/;

export function viewToPath(view: View): string {
  switch (view.kind) {
    case 'home': return '/';
    case 'board': return `/matrice/${encodeURIComponent(view.id)}`;
    case 'global': return view.scope.kind === 'all' ? '/globale' : `/globale/${encodeURIComponent(view.scope.id)}`;
    case 'focus': return '/aujourdhui';
    case 'review': return '/revue';
    case 'stats': return '/retrospective';
  }
}

/** La vue d'une adresse, ou `null` quand ce n'en est pas une (adresse inconnue). Le slash final est toléré. */
export function pathToView(pathname: string): View | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (path === '/') return HOME;
  const board = BOARD_PATH.exec(path);
  if (board) return { kind: 'board', id: decodeURIComponent(board[1]) };
  const global = GLOBAL_PATH.exec(path);
  if (global) return { kind: 'global', scope: global[1] ? { kind: 'universe', id: decodeURIComponent(global[1]) } : { kind: 'all' } };
  if (path === '/aujourdhui') return { kind: 'focus' };
  if (path === '/revue') return { kind: 'review' };
  if (path === '/retrospective') return { kind: 'stats' };
  return null;
}

/** Le titre de l'onglet pour une vue : les libellés de la barre du haut, et le nom de la matrice ouverte. */
export function viewTitle(view: View, boardName?: string): string | null {
  switch (view.kind) {
    case 'home': return 'Matrices';
    case 'board': return boardName ?? null;
    case 'global': return 'Vue globale';
    case 'focus': return 'Aujourd’hui';
    case 'review': return 'Revue';
    case 'stats': return 'Rétrospective';
  }
}
