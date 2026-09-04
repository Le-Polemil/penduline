import { FOCUS_DEFAULT, FOCUS_MAX } from '@penduline/shared';

/**
 * La limite du mode « aujourd'hui » (#49).
 *
 * `localStorage` comme le repli des univers et celui des étapes : la convention
 * du dépôt est explicite, un réglage d'affichage est un état de **lecture**.
 *
 * Corollaire assumé : l'extension ne peut pas lire ce `localStorage`. Elle n'en
 * a pas besoin — elle affiche la sélection et permet de cocher, elle ne la
 * compose pas.
 */
const LIMIT_KEY = 'penduline:focus-limit';

/**
 * Relit la limite, bornée à `[1, FOCUS_MAX]`.
 *
 * La borne haute n'est pas de la défiance envers le stockage : c'est le ticket.
 * « Résister à la tentation d'augmenter la limite » — une valeur bricolée à la
 * main dans le stockage local ne doit pas contourner ce qui fait la valeur du
 * mode.
 */
export function readFocusLimit(): number {
  try {
    const raw = window.localStorage.getItem(LIMIT_KEY);
    if (!raw) return FOCUS_DEFAULT;
    const n = Number(raw);
    if (!Number.isInteger(n)) return FOCUS_DEFAULT;
    return Math.min(FOCUS_MAX, Math.max(1, n));
  } catch {
    // `localStorage` peut lever (navigation privée verrouillée). Ce n'est pas
    // une raison de ne pas afficher l'écran.
    return FOCUS_DEFAULT;
  }
}

export function writeFocusLimit(n: number): void {
  try {
    window.localStorage.setItem(LIMIT_KEY, String(Math.min(FOCUS_MAX, Math.max(1, n))));
  } catch {
    // Perdre un réglage est un désagrément, pas une panne.
  }
}
