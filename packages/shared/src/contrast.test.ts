import { describe, expect, it } from 'vitest';
import { ALL, PARK, QUADS } from './quadrants';

/**
 * Verrou de contraste — WCAG 2.1 AA.
 *
 * Les cinq cases sont conformes AUJOURD'HUI : ce fichier ne corrige rien, il
 * empêche qu'un futur ajustement de teinte casse la conformité en silence. Les
 * commentaires de `quadrants.ts` montrent que ces `bg` ont déjà été retouchés à la
 * main pour des raisons de lisibilité — c'est précisément le genre de retouche qui
 * peut faire passer un rapport sous le seuil sans que personne ne le remarque.
 *
 * Seuils : 4,5:1 pour du texte normal, 3:1 pour du grand texte (≥ 18,66 px, ou
 * ≥ 24 px non gras) et pour les éléments non textuels.
 */

/** Luminance relative d'une composante sRVB, selon la formule WCAG. */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Le fond de page, copié de `--color-bg` (`apps/web/src/styles.css`).
 *
 * Dupliqué à regret : la palette du web n'est pas exportée depuis ce paquet. La
 * seule case concernée est « À trier », dont le `bg` est `transparent` — d'où
 * l'assertion ci-dessous, qui casse si cette hypothèse cesse d'être vraie.
 */
const PAGE_BG = '#f5ead8';

/** Le fond réel derrière une case : celui de la page quand la case est transparente. */
function behind(bg: string): string {
  return bg === 'transparent' ? PAGE_BG : bg;
}

describe('contraste des cases (WCAG AA)', () => {
  it('la formule est juste', () => {
    // Sans ce garde-fou, une erreur de formule rendrait tous les tests suivants
    // vrais pour de mauvaises raisons.
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('« À trier » est bien la seule case sans fond propre', () => {
    // L'hypothèse dont dépend `behind`.
    expect(PARK.bg).toBe('transparent');
    expect(QUADS.every((q) => q.bg !== 'transparent')).toBe(true);
  });

  it.each(ALL.map((q) => [q.label, q] as const))(
    '%s : le texte sur le fond de case tient 4,5:1',
    (_label, q) => {
      // `--q-dark` sert au libellé (19 px, donc grand texte) MAIS aussi au
      // sous-titre à 11,5 px et à l'étiquette de matrice à 10,5 px, qui sont du
      // texte normal. C'est donc le seuil le plus exigeant qui s'applique.
      expect(contrast(q.dark, behind(q.bg))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(ALL.map((q) => [q.label, q] as const))(
    '%s : le compteur blanc sur `ink` tient 4,5:1',
    (_label, q) => {
      // `.quad-count` : blanc sur `--q-ink`, 11 px gras — texte normal.
      expect(contrast('#ffffff', q.ink)).toBeGreaterThanOrEqual(4.5);
    },
  );

  // « À trier » est volontairement exclue : son fond EST celui de la page, elle
  // se distingue par son contour tireté. La tester ici n'aurait aucun sens.
  it.each(QUADS.map((q) => [q.label, q] as const))(
    '%s : le fond de case reste détachable du fond de page',
    (_label, q) => {
      // Pas une exigence WCAG — une case est identifiée par son libellé, pas par
      // sa teinte. Mais un fond qui se confond avec la page ferait perdre la
      // grille, et les commentaires de `quadrants.ts` racontent l'ajustement
      // délicat de « Déléguer », seule case de la même famille que le beige.
      // Plancher posé sous la plus faible mesurée aujourd'hui (Planifier, 1,053).
      expect(contrast(q.bg, PAGE_BG)).toBeGreaterThan(1.04);
    },
  );
});
