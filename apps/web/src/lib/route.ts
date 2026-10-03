import type { Scope } from '../screens/Global';
import type { BilanTab } from '../screens/Bilan';

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
  /**
   * Le recul : rétrospective (#48), revue (#47) et objectifs, sous une seule
   * entrée de navigation. Sans portée — les trois regardent tout le compte.
   */
  | { kind: 'bilan'; tab: BilanTab };

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

/**
 * Les trois onglets du Bilan, et leur adresse.
 *
 * `/bilan` tout court est accepté et réécrit vers `/bilan/retrospective` : une
 * section a une page par défaut, et l'adresse doit finir par dire laquelle on
 * regarde — sinon « Retour » depuis un onglet ramène sur une adresse ambiguë.
 */
const BILAN_PATHS: Record<BilanTab, string> = {
  retro: '/bilan/retrospective',
  review: '/bilan/revue',
  goals: '/bilan/objectifs',
};
const BILAN_TABS = Object.entries(BILAN_PATHS) as [BilanTab, string][];

export function viewToPath(view: View): string {
  switch (view.kind) {
    case 'home': return '/';
    case 'board': return `/matrice/${encodeURIComponent(view.id)}`;
    case 'global': return view.scope.kind === 'all' ? '/globale' : `/globale/${encodeURIComponent(view.scope.id)}`;
    case 'focus': return '/aujourdhui';
    case 'bilan': return BILAN_PATHS[view.tab];
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
  if (path === '/bilan') return { kind: 'bilan', tab: 'retro' };
  const onglet = BILAN_TABS.find(([, p]) => p === path);
  if (onglet) return { kind: 'bilan', tab: onglet[0] };
  // Les deux adresses d'avant le regroupement. Elles ont été publiques : les
  // laisser tomber sur l'accueil ferait perdre un favori sans le dire.
  if (path === '/revue') return { kind: 'bilan', tab: 'review' };
  if (path === '/retrospective') return { kind: 'bilan', tab: 'retro' };
  return null;
}

const BILAN_TITLES: Record<BilanTab, string> = {
  retro: 'Rétrospective',
  review: 'Revue',
  goals: 'Objectifs',
};

/** Le titre de l'onglet pour une vue : les libellés de la barre du haut, et le nom de la matrice ouverte. */
export function viewTitle(view: View, boardName?: string): string | null {
  switch (view.kind) {
    case 'home': return 'Matrices';
    case 'board': return boardName ?? null;
    case 'global': return 'Vue globale';
    case 'focus': return 'Aujourd’hui';
    // La section ET l'onglet : « Bilan » seul ne dirait pas ce qu'on regarde,
    // et l'onglet seul perdrait d'où il vient.
    case 'bilan': return `Bilan · ${BILAN_TITLES[view.tab]}`;
  }
}
