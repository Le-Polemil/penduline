import {
  PARK as BASE_PARK,
  QUADS as BASE_QUADS,
  type Quadrant,
} from '@penduline/shared';

/**
 * Les cases, mais peintes par la feuille de styles — exactement comme
 * `apps/web/src/lib/quads.ts`, et pour la même raison.
 *
 * `@penduline/shared` porte les couleurs en hexadécimal : elles servent aussi au
 * serveur MCP, qui n'a pas de thème sombre à suivre. Le panneau, lui, en a un
 * depuis cette refonte, et une couleur posée en style en ligne ne peut pas
 * changer avec une requête média. On remplace donc chaque teinte par une
 * variable CSS — `--q-faire-ink`, `--q-faire-dark`, `--q-faire-bg` — définie
 * dans `styles.css` pour les deux thèmes.
 *
 * ⚠️ « À trier » garde son `bg: 'transparent'` LITTÉRAL : `quad-bg.ts` le teste
 * (`q.bg === 'transparent'`) pour savoir que la case n'a pas de fond propre, et
 * une variable ferait échouer ce test sans bruit.
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
export const ALL: Quadrant[] = [...QUADS, PARK];
