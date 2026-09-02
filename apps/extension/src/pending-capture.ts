/**
 * La capture en attente, partagée entre le service worker et le panneau (#78).
 *
 * ⚠️ `chrome.storage.session` et pas `local` : ce qu'on capture est un brouillon
 * de l'instant, pas une donnée. Il ne doit pas survivre à la fermeture du
 * navigateur, ni traîner sur le disque — une URL visitée est une information
 * personnelle. `session` vit en mémoire et disparaît avec le navigateur.
 *
 * Aucune permission de plus : `storage`, déjà déclarée, couvre `session`. Le
 * manifeste ne bouge pas — c'est la condition posée par le ticket pour que la
 * revue du Web Store reste standard (cf. work/publication-extension.md).
 */

import { isFreshCapture } from '@penduline/shared';

const KEY = 'penduline-pending-capture';

export interface PendingCapture {
  /** Prérempli : la sélection, à défaut le titre de la page. */
  title: string;
  /** Prérempli : le lien visé, à défaut l'URL de la page. Peut être vide. */
  url: string;
  /** La matrice choisie dans le menu. `null` = la matrice active. */
  boardId: string | null;
  /** Quand elle a été déposée — pour ne pas rouvrir un brouillon d'hier. */
  at: number;
}

export async function setPending(c: PendingCapture): Promise<void> {
  try {
    await chrome.storage.session.set({ [KEY]: c });
  } catch {
    // Sans stockage de session, on perd le formulaire — pas la capture : le
    // service worker retombe alors sur l'écriture directe.
  }
}

export async function getPending(): Promise<PendingCapture | null> {
  try {
    const res = await chrome.storage.session.get(KEY);
    const c = res[KEY] as PendingCapture | undefined;
    if (!c) return null;
    if (!isFreshCapture(c.at)) {
      await clearPending();
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

/**
 * Prévient d'une capture déposée **après** le montage de l'interface.
 *
 * Deux situations, un seul mécanisme :
 *
 * 1. **La course d'ouverture.** `chrome.sidePanel.open()` exige un geste
 *    utilisateur et doit donc être appelé AVANT tout `await` (voir
 *    `background.ts`) : le panneau peut se monter avant que la capture ne soit
 *    écrite ici. `getPending()` au montage lirait alors du vide.
 *
 * 2. **Le panneau déjà ouvert.** Cas impossible du temps du popup, qui se
 *    fermait au premier clic dans la page. Le panneau, lui, reste : une capture
 *    peut arriver sur une interface montée depuis dix minutes.
 *
 * L'abonnement vit ici et non dans le composant, parce que la clé de stockage
 * appartient à ce module — la faire fuir ailleurs, c'est se garantir deux
 * endroits à corriger le jour où elle change.
 *
 * Rend la fonction de désabonnement. Sans `chrome.storage` (aperçu web), rend
 * une fonction vide plutôt que de lever.
 */
export function watchPending(onChange: (c: PendingCapture | null) => void): () => void {
  const listener = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: chrome.storage.AreaName,
  ) => {
    if (area !== 'session' || !(KEY in changes)) return;
    const c = changes[KEY].newValue as PendingCapture | undefined;
    // Même péremption qu'à la lecture : un brouillon d'hier n'a pas à rouvrir
    // un formulaire, quel que soit le chemin par lequel il arrive.
    onChange(c && isFreshCapture(c.at) ? c : null);
  };

  try {
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  } catch {
    return () => {};
  }
}

export async function clearPending(): Promise<void> {
  try {
    await chrome.storage.session.remove(KEY);
  } catch {
    /* rien à nettoyer si le stockage est indisponible */
  }
}

/*
 * ⚠️ Il n'y a PAS de `patchPending` ici, et c'est délibéré.
 *
 * Une mise à jour partielle suppose de lire l'état courant avant d'écrire. Or le
 * stockage est asynchrone : deux écritures rapprochées lisent toutes deux la
 * MÊME version, et la seconde écrase le champ modifié par la première. Constaté
 * au navigateur du temps où le formulaire écrivait à chaque frappe — le titre
 * corrigé disparaissait dès qu'on touchait ensuite au lien.
 *
 * Cette écriture continue a disparu avec le passage au panneau latéral (voir
 * `Capture.tsx`) : le brouillon n'a plus besoin de survivre à une fermeture qui
 * n'a plus lieu. La course est donc doublement écartée — plus d'écriture
 * partielle, et plus d'écritures rapprochées du tout. Ne pas rouvrir la porte en
 * ajoutant un `patchPending` « pour la commodité ».
 */
