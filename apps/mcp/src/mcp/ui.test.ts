import { QUADS } from '@penduline/shared';
import { describe, expect, it } from 'vitest';
import { JETONS, META_RESSOURCE, MIME_APP, URI_VISUEL, VERSION_MCP_APPS, cssJetons, metaVisuel, pageVisuel } from './ui';

/**
 * La ressource d'interface : sa forme (ce que lit un hôte MCP Apps), la page
 * assemblée, et le verrou de contraste de sa palette.
 */

describe('le lien outil → ressource', () => {
  it('pose la clé actuelle ET l’ancienne, toutes deux vers `ui://`', () => {
    expect(metaVisuel()).toEqual({
      ui: { resourceUri: URI_VISUEL },
      'ui/resourceUri': URI_VISUEL,
    });
    expect(URI_VISUEL.startsWith('ui://')).toBe(true);
  });

  it('annonce le type MIME réservé par l’extension', () => {
    expect(MIME_APP).toBe('text/html;profile=mcp-app');
  });

  it('ne demande au bac à sable que les origines des polices — aucune connexion', () => {
    expect(META_RESSOURCE.ui.csp).toEqual({
      resourceDomains: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
    });
    expect(META_RESSOURCE.ui.csp).not.toHaveProperty('connectDomains');
  });
});

describe('la page assemblée', () => {
  const page = pageVisuel();

  it('n’a plus aucun emplacement à remplir', () => {
    expect(page).not.toMatch(/__[A-Z_]+__/);
    expect(page).not.toContain('/*__JETONS__*/');
  });

  it('embarque le logo en data URI, et aucune image distante', () => {
    expect(page).toContain("var LOGO = 'data:image/png;base64,");
    expect(page).not.toMatch(/<img[^>]+src="https?:/);
  });

  it('parle la révision du protocole qu’elle annonce', () => {
    expect(page).toContain(`var VERSION = '${VERSION_MCP_APPS}'`);
    expect(page).toContain("'ui/initialize'");
    expect(page).toContain("'ui/notifications/initialized'");
    expect(page).toContain("'ui/notifications/tool-result'");
  });

  it('suit le thème de l’hôte, puis celui du système', () => {
    const css = cssJetons();
    expect(css).toContain(':root.pd-dark{');
    expect(css).toContain('@media (prefers-color-scheme: dark){:root:not(.pd-light){');
    expect(page).toContain(css);
  });

  it('n’emploie `innerHTML` que pour ses icônes constantes', () => {
    // Un titre de tâche est une saisie libre : il ne doit JAMAIS atteindre
    // `innerHTML`. Une seule affectation est tolérée, celle des icônes.
    expect(page.match(/\.innerHTML\s*=/g)).toEqual(['.innerHTML =']);
    expect(page).toContain('s.innerHTML = ICONES[nom];');
  });
});

/** WCAG — mêmes formules que `packages/shared/src/contrast.test.ts`. */
function canal(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => canal(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('palette', () => {
  it('le jeu clair des cases est celui de `packages/shared`', () => {
    for (const q of QUADS) {
      expect(JETONS.clair[q.key as 'faire']).toBe(q.ink);
      expect(JETONS.clair[`${q.key}-d` as 'faire-d']).toBe(q.dark);
      expect(JETONS.clair[`${q.key}-bg` as 'faire-bg']).toBe(q.bg);
    }
  });

  it('les deux jeux définissent les mêmes variables', () => {
    expect(Object.keys(JETONS.sombre).sort()).toEqual(Object.keys(JETONS.clair).sort());
  });

  /**
   * Chaque couple texte/fond que la page pose réellement. 4,5:1 pour le texte
   * (tout y est en petite taille), 3:1 pour les éléments non textuels : la coche
   * pleine, les segments de barre, l'anneau de focus.
   */
  const TEXTE: [string, string][] = [
    ['text', 'card'],
    ['muted', 'card'],
    ['link', 'card'],
    ['text', 'surface'],
    ['muted', 'surface'],
    ['danger', 'danger-bg'],
    ['danger', 'card'],
    ...['faire', 'planifier', 'deleguer', 'eliminer'].flatMap(
      (q): [string, string][] => [
        [`${q}-d`, `${q}-bg`],
        ['text', `${q}-bg`],
        [`${q}-d`, 'card'],
      ],
    ),
  ];
  const NON_TEXTE: [string, string][] = [
    ['accent', 'card'],
    ...['faire', 'planifier', 'deleguer', 'eliminer'].map((q): [string, string] => [q, 'card']),
  ];

  for (const [nom, jeu] of Object.entries(JETONS) as [string, Record<string, string>][]) {
    it(`thème ${nom} : tout texte à 4,5:1 au moins`, () => {
      for (const [t, f] of TEXTE) {
        expect({ couple: `${t} / ${f}`, ok: contraste(jeu[t], jeu[f]) >= 4.5 }).toEqual({
          couple: `${t} / ${f}`,
          ok: true,
        });
      }
    });

    it(`thème ${nom} : tout élément non textuel à 3:1 au moins`, () => {
      for (const [t, f] of NON_TEXTE) {
        expect({ couple: `${t} / ${f}`, ok: contraste(jeu[t], jeu[f]) >= 3 }).toEqual({
          couple: `${t} / ${f}`,
          ok: true,
        });
      }
    });
  }
});
