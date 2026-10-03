import {
  ALL as BASE_ALL,
  PARK as BASE_PARK,
  QUADS as BASE_QUADS,
  type Quadrant,
  type QuadrantKey,
} from '@penduline/shared';

/**
 * Les cases, mais peintes par la feuille de styles.
 *
 * `@penduline/shared` porte les couleurs en hexadécimal : elles servent aussi à
 * l'extension et au serveur MCP, qui n'ont pas de thème sombre à suivre. Le web,
 * lui, en a un (`prefers-color-scheme`), et une couleur posée en style en ligne
 * ne peut pas changer avec une requête média. On remplace donc chaque teinte par
 * une variable CSS — `--q-faire-ink`, `--q-faire-dark`, `--q-faire-bg`… —
 * définie dans `styles.css` pour les deux thèmes.
 *
 * ⚠️ « À trier » garde son `bg: 'transparent'` LITTÉRAL : plusieurs écrans le
 * testent (`q.bg === 'transparent'`) pour savoir que la case n'a pas de fond
 * propre. Une variable ferait échouer ce test sans bruit.
 *
 * Les valeurs claires de `styles.css` sont celles de `quadrants.ts` ; un test
 * (`styles.test.ts`) vérifie qu'elles ne divergent pas.
 */
function themed(q: Quadrant): Quadrant {
  return {
    ...q,
    ink: `var(--q-${q.key}-ink)`,
    dark: `var(--q-${q.key}-dark)`,
    bg: q.bg === 'transparent' ? 'transparent' : `var(--q-${q.key}-bg)`,
  };
}

export const QUADS: Quadrant[] = BASE_QUADS.map(themed);
export const PARK: Quadrant = themed(BASE_PARK);
export const ALL: Quadrant[] = BASE_ALL.map(themed);

const BY_KEY = Object.fromEntries(ALL.map((q) => [q.key, q])) as Record<QuadrantKey, Quadrant>;

/** Même contrat que `quadrant()` de `@penduline/shared` : clé inconnue → « À trier ». */
export function quadrant(key: QuadrantKey): Quadrant {
  return BY_KEY[key] ?? PARK;
}
