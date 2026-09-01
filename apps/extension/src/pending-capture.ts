/**
 * La capture en attente, partagée entre le service worker et le popup (#78).
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
 * stockage est asynchrone : deux frappes rapprochées dans deux champs
 * différents lisent toutes deux la MÊME version, et la seconde écriture écrase
 * le champ modifié par la première. Constaté au navigateur — le titre corrigé
 * disparaissait dès qu'on touchait ensuite au lien.
 *
 * Le formulaire tient déjà le brouillon entier : il écrit l'objet complet à
 * chaque frappe, par `setPending`, et la course n'existe plus.
 */
