/**
 * Les suggestions mises en sommeil (« Je garde ») : clé → date ISO de réveil.
 *
 * `localStorage`, comme les replis et les réglages de la revue : se taire sur une
 * suggestion est un état de LECTURE, propre à cet appareil — pas une donnée du
 * compte. Corollaire assumé : un « Je garde » sur le téléphone ne tait pas le
 * poste. C'est le même compromis que `reviewPrefs.ts`.
 *
 * Les échéances passées sont élaguées à la lecture : sans ça, la clé grossirait
 * d'une entrée par geste, indéfiniment.
 */

const KEY = 'penduline:suggestions-snoozed';

export function readSnoozed(now: number = Date.now()): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && Date.parse(v) > now) out[k] = v;
    }
    return out;
  } catch {
    // Navigation privée verrouillée ou JSON corrompu : on repart de rien, ce qui
    // ne fait que réafficher des suggestions.
    return {};
  }
}

export function writeSnoozed(map: Record<string, string>): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // Perdre une mise en sommeil est un désagrément, pas une panne.
  }
}
