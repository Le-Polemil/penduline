import type { Board, Task, Universe } from '@penduline/shared';

/**
 * Le dernier état connu du compte, gardé sur le poste.
 *
 * Le panneau n'avait AUCUN cache : chaque ouverture affichait « Chargement des
 * matrices… » et attendait trois requêtes. Or il s'ouvre plusieurs fois par
 * jour, souvent pour lire une ligne — l'écran de chargement coûtait plus que ce
 * qu'on venait chercher. On peint donc l'instantané d'abord, et le
 * rafraîchissement (`store.ts`) le corrige derrière.
 *
 * UNE seule clé, avec le compte à l'intérieur plutôt qu'une clé par compte :
 * un seul compte est connecté à la fois dans le panneau, et un instantané dont
 * le `userId` ne correspond pas est simplement ignoré — ce qui règle le
 * changement de compte sans balayage de clés.
 */
const KEY = 'penduline-snapshot';

/**
 * Version du format.
 *
 * ⚠️ À INCRÉMENTER dès que la forme change — l'ajout d'une colonne à
 * `TASK_COLS` compris. Un instantané écrit par une version antérieure de
 * l'extension ne porte pas les champs récents : peint tel quel, il montrerait
 * par exemple des tâches sans échéance le temps d'un rafraîchissement, ce qui se
 * lit comme une perte de données.
 */
const V = 2;

/**
 * Au-delà d'une semaine, on préfère l'écran de chargement.
 *
 * Le panneau se consulte tous les jours : un instantané plus vieux que ça vient
 * d'un poste qu'on n'utilise plus, et le peindre hors ligne afficherait une
 * matrice périmée sans jamais la corriger. Mieux vaut alors dire qu'on charge.
 */
const TTL = 7 * 24 * 60 * 60 * 1000;

export interface Snapshot {
  universes: Universe[];
  boards: Board[];
  tasks: Task[];
}

interface Enveloppe extends Snapshot {
  v: number;
  userId: string;
  at: number;
}

/** L'instantané du compte, ou `null` : absent, périmé, d'un autre compte, ou d'un autre format. */
export async function readSnapshot(userId: string): Promise<Snapshot | null> {
  try {
    const res = await chrome.storage.local.get(KEY);
    const e = res[KEY] as Enveloppe | undefined;
    if (!e || e.v !== V || e.userId !== userId) return null;
    if (Date.now() - e.at > TTL) return null;
    return { universes: e.universes, boards: e.boards, tasks: e.tasks };
  } catch {
    /* pas de chrome.storage (ex. aperçu web) */
  }
  return null;
}

export async function writeSnapshot(userId: string, snap: Snapshot): Promise<void> {
  try {
    const e: Enveloppe = { v: V, userId, at: Date.now(), ...snap };
    await chrome.storage.local.set({ [KEY]: e });
  } catch {
    /* pas de chrome.storage, ou quota atteint — le cache est un confort */
  }
}

/**
 * À la déconnexion. Sans ça, l'instantané resterait lisible sur le poste après
 * un `signOut` — et la prochaine connexion, même d'un autre compte, le trouverait
 * en place (le `userId` l'écarterait, mais les données seraient toujours là).
 */
export async function clearSnapshot(): Promise<void> {
  try {
    await chrome.storage.local.remove(KEY);
  } catch {
    /* ignore */
  }
}
