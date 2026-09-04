/**
 * Dernière matrice ouverte — reprise dans le panneau, destination par défaut de la
 * capture contextuelle.
 *
 * Module SÉPARÉ de `store.ts` à dessein : le service worker a besoin de ces deux
 * fonctions, et `store.ts` importe React pour ses hooks. Les laisser ensemble
 * faisait entrer React dans le graphe du worker — 225 Ko de chunk partagé,
 * rechargés à chaque réveil d'un worker que MV3 tue en permanence, pour du code
 * qui n'y sert jamais.
 */
const ACTIVE_KEY = 'penduline-active-board';
const TTL = 2 * 60 * 60 * 1000;

export async function getActiveBoard(): Promise<string | null> {
  try {
    const res = await chrome.storage.local.get(ACTIVE_KEY);
    const v = res[ACTIVE_KEY] as { boardId: string; ts: number } | undefined;
    if (v && Date.now() - v.ts < TTL) return v.boardId;
  } catch {
    /* pas de chrome.storage (ex. preview web) */
  }
  return null;
}

export async function setActiveBoard(boardId: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [ACTIVE_KEY]: { boardId, ts: Date.now() } });
  } catch {
    /* ignore */
  }
}
