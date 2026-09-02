import { DEFAULT_THRESHOLDS, type ReviewThresholds } from '@penduline/shared';

/**
 * Les réglages de la revue, et la date de la dernière consultation (#47).
 *
 * `localStorage` et non la base, comme le repli des univers (`Home.tsx`) et
 * celui des étapes (`Matrix.tsx`) : la convention du dépôt est explicite — un
 * réglage d'affichage est un **état de lecture**, pas une donnée de compte. Ça
 * évite au passage une table de réglages que ce ticket n'a pas à introduire.
 *
 * Corollaire assumé : les seuils ne suivent pas d'un appareil à l'autre. C'est
 * le même compromis que les deux replis existants.
 */

const THRESHOLDS_KEY = 'penduline:review-thresholds';
const LAST_KEY = 'penduline:review-last';

/**
 * Relit les seuils, en complétant tout ce qui manque par les défauts.
 *
 * La fusion n'est pas de la politesse : elle est ce qui permet d'AJOUTER un
 * seuil dans une version ultérieure sans que les utilisateurs existants se
 * retrouvent avec un `undefined` au milieu d'une comparaison de dates — où il
 * rendrait le signal silencieusement vide.
 *
 * Chaque valeur est validée une par une plutôt que l'objet en bloc : un seul
 * champ corrompu ne doit pas faire perdre les quatre autres.
 */
export function readThresholds(): ReviewThresholds {
  try {
    const raw = window.localStorage.getItem(THRESHOLDS_KEY);
    if (!raw) return DEFAULT_THRESHOLDS;
    const stored = JSON.parse(raw) as Partial<Record<keyof ReviewThresholds, unknown>>;
    const merged = { ...DEFAULT_THRESHOLDS };
    for (const key of Object.keys(DEFAULT_THRESHOLDS) as (keyof ReviewThresholds)[]) {
      const v = stored[key];
      // `> 0` : un seuil à zéro ou négatif ferait remonter TOUTES les tâches, ce
      // qui ressemble à un bug bien plus qu'à un réglage.
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) merged[key] = v;
    }
    return merged;
  } catch {
    // `localStorage` peut lever (navigation privée verrouillée) et le JSON peut
    // être corrompu. Ni l'un ni l'autre n'est une raison de ne pas afficher la
    // revue.
    return DEFAULT_THRESHOLDS;
  }
}

export function writeThresholds(t: ReviewThresholds): void {
  try {
    window.localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(t));
  } catch {
    // Perdre un réglage est un désagrément, pas une panne.
  }
}

/** Date ISO de la dernière consultation, `null` si jamais consultée. */
export function readLastReview(): string | null {
  try {
    const raw = window.localStorage.getItem(LAST_KEY);
    if (!raw) return null;
    return Number.isFinite(Date.parse(raw)) ? raw : null;
  } catch {
    return null;
  }
}

export function markReviewed(now: number = Date.now()): void {
  try {
    window.localStorage.setItem(LAST_KEY, new Date(now).toISOString());
  } catch {
    // Idem.
  }
}
