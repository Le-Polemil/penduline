import { readFileSync } from 'node:fs';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/**
 * La ressource d'interface des visuels Penduline — extension MCP Apps.
 *
 * Le mécanisme, tel que le décrit l'extension `io.modelcontextprotocol/ui`
 * (révision 2026-01-26, celle de `@modelcontextprotocol/ext-apps` 1.x) :
 *
 *   1. Le serveur déclare une RESSOURCE `ui://…` de type
 *      `text/html;profile=mcp-app` : une page HTML autonome.
 *   2. Chaque outil qui veut un visuel la désigne dans sa définition, par
 *      `_meta.ui.resourceUri`. Un hôte qui ne connaît pas l'extension ignore ce
 *      `_meta`, comme tout `_meta` — c'est ce qui garantit qu'il se comporte
 *      exactement comme avant.
 *   3. L'hôte qui la connaît charge la page dans une iframe isolée, lui parle
 *      en JSON-RPC par `postMessage` (`ui/initialize`, puis
 *      `ui/notifications/tool-result`), et la page dessine `structuredContent`.
 *
 * Pourquoi à la main et non avec `@modelcontextprotocol/ext-apps` : sa branche
 * 2.x exige le SDK MCP v2 (`@modelcontextprotocol/server`), et ce serveur est
 * sur la v1. La branche 1.x serait compatible, mais elle n'apporte côté serveur
 * que deux enveloppes de `registerTool`/`registerResource` — dix lignes,
 * ci-dessous — et côté page un client qu'il faudrait de toute façon embarquer
 * dans le HTML sans bundler. Le protocole utile ici tient en quatre messages ; on
 * l'écrit donc dans la page, sans dépendance.
 */

/** Le type MIME que l'extension réserve aux pages d'app. */
export const MIME_APP = 'text/html;profile=mcp-app';

/** La révision du protocole MCP Apps que parle la page. */
export const VERSION_MCP_APPS = '2026-01-26';

/**
 * UNE ressource pour les trois visuels : la page choisit son gabarit d'après
 * `structuredContent.vue`. Trois pages presque identiques — même palette, même
 * pont `postMessage`, même logo — seraient trois copies à tenir alignées.
 */
export const URI_VISUEL = 'ui://penduline/visuel.html';

/**
 * Le `_meta` à poser sur un outil pour qu'il s'affiche avec le visuel.
 *
 * Les DEUX clés, comme le fait `registerAppTool` d'`ext-apps` : `ui.resourceUri`
 * est la forme actuelle, `"ui/resourceUri"` l'ancienne, que des hôtes encore en
 * circulation sont seuls à lire. Les poser toutes deux ne coûte rien.
 */
export function metaVisuel(uri: string = URI_VISUEL): Record<string, unknown> {
  return { ui: { resourceUri: uri }, 'ui/resourceUri': uri };
}

/**
 * Ce que la page demande au bac à sable de l'hôte.
 *
 * Les seules origines externes sont celles des polices (Caprasimo, Figtree).
 * Un hôte qui refuserait ce `csp` ne casse rien : la pile de repli de la page
 * (`Georgia`, `system-ui`) prend le relais. Pas de `connectDomains` : la page ne
 * parle qu'à l'hôte, jamais au réseau.
 *
 * `prefersBorder: false` : chaque carte dessine déjà son propre cadre arrondi ;
 * un second cadre de l'hôte autour ferait double trait.
 */
export const META_RESSOURCE = {
  ui: {
    csp: { resourceDomains: ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'] },
    prefersBorder: false,
  },
};

// ── Palette ──────────────────────────────────────────────────────────────────

/**
 * Les deux jeux de variables des maquettes (`.pd-light` / `.pd-dark`), en TS
 * plutôt qu'en dur dans le HTML : c'est ce qui permet au test de contraste de
 * vérifier EXACTEMENT les couleurs que la page emploie.
 *
 * Les valeurs claires des cases sont celles de `packages/shared/src/quadrants.ts`
 * (ink / dark / bg). Elles sont recopiées et non importées parce que la page
 * a AUSSI besoin d'un jeu sombre que `QUADS` ne porte pas ; le test vérifie que
 * les deux sources ne divergent pas.
 */
export const JETONS = {
  clair: {
    bg: '#f5ead8',
    surface: '#ebddc5',
    card: '#fdf6e9',
    text: '#201e1d',
    muted: '#645c50',
    accent: '#c67139',
    link: '#8c491a',
    divider: 'rgba(32,30,29,.16)',
    ghost: 'rgba(32,30,29,.08)',
    danger: '#a63d2a',
    'danger-bg': '#f6dcd3',
    faire: '#5c6b45',
    'faire-d': '#43502f',
    'faire-bg': '#dbe3ce',
    planifier: '#38607f',
    'planifier-d': '#27455c',
    'planifier-bg': '#dde7ef',
    deleguer: '#8f6a14',
    'deleguer-d': '#6b4f0e',
    'deleguer-bg': '#f2e0c4',
    eliminer: '#a63d2a',
    'eliminer-d': '#7c2d1e',
    'eliminer-bg': '#e3d8d4',
  },
  sombre: {
    bg: '#1d1a16',
    surface: '#28231d',
    card: '#302a23',
    text: '#f3e9d8',
    muted: '#c2b6a2',
    accent: '#e08a52',
    link: '#f0a774',
    divider: 'rgba(243,233,216,.14)',
    ghost: 'rgba(243,233,216,.08)',
    danger: '#f0b4a5',
    'danger-bg': '#3a2622',
    faire: '#a3b585',
    'faire-d': '#c9d6b3',
    'faire-bg': '#2c3324',
    planifier: '#8db0cc',
    'planifier-d': '#bcd2e4',
    'planifier-bg': '#23303b',
    deleguer: '#d9ae4c',
    'deleguer-d': '#ecd29a',
    'deleguer-bg': '#3a2f1a',
    eliminer: '#e5826b',
    'eliminer-d': '#f0b4a5',
    'eliminer-bg': '#3a2622',
  },
} as const;

const declarations = (jeu: Record<string, string>) =>
  Object.entries(jeu)
    .map(([nom, valeur]) => `--${nom}:${valeur}`)
    .join(';');

/**
 * Le thème, en trois couches, de la plus faible à la plus forte :
 *
 *   1. clair par défaut (`:root`) ;
 *   2. sombre si le système le préfère — sauf si l'hôte a imposé le clair ;
 *   3. le thème que l'HÔTE annonce (`hostContext.theme`), posé par la page en
 *      classe `pd-light` / `pd-dark` sur `<html>`.
 *
 * L'hôte l'emporte parce que c'est lui qui peint autour : un Claude en thème
 * clair sur un système sombre doit recevoir une carte claire.
 */
export function cssJetons(): string {
  const clair = declarations(JETONS.clair);
  const sombre = declarations(JETONS.sombre);
  return [
    `:root,:root.pd-light{${clair}}`,
    `:root.pd-dark{${sombre}}`,
    `@media (prefers-color-scheme: dark){:root:not(.pd-light){${sombre}}}`,
  ].join('\n');
}

// ── La page ──────────────────────────────────────────────────────────────────

/**
 * Le logo, en data URI.
 *
 * Copie réduite (2×, 41×64) de `apps/web/public/logo.png` : la page l'affiche
 * en 21×32, et l'original de 103×160 aurait quadruplé le poids de la ressource
 * pour des pixels que personne ne verra. Inliné parce que le bac à sable de
 * l'hôte n'autorise aucune image distante qu'on n'aurait pas déclarée — et une
 * URL vers l'app web, en plus, ferait dépendre le visuel de sa disponibilité.
 */
function logoDataUri(): string {
  const png = readFileSync(new URL('./logo.png', import.meta.url));
  return `data:image/png;base64,${png.toString('base64')}`;
}

/**
 * Le HTML final : le gabarit `visuel.html`, avec sa palette et son logo.
 *
 * Assemblé UNE fois au chargement du module : la page est la même pour tout le
 * monde, rien de propre à l'utilisateur n'y entre — ses données arrivent par
 * `structuredContent`, jamais par la ressource.
 */
export function pageVisuel(): string {
  const gabarit = readFileSync(new URL('./visuel.html', import.meta.url), 'utf8');
  return gabarit
    .replace('/*__JETONS__*/', cssJetons())
    .replace('__LOGO__', logoDataUri())
    .replace('__VERSION_MCP_APPS__', VERSION_MCP_APPS);
}

let page: string | undefined;

/** Déclare la ressource `ui://penduline/visuel.html` sur le serveur. */
export function enregistrerVisuel(serveur: McpServer): void {
  page ??= pageVisuel();
  const html = page;
  serveur.registerResource(
    'visuel-penduline',
    URI_VISUEL,
    {
      title: 'Visuels Penduline',
      description:
        'Rendu de la matrice, de la liste des matrices et des écritures, pour les hôtes MCP Apps.',
      mimeType: MIME_APP,
      _meta: META_RESSOURCE,
    },
    async (uri) => ({
      contents: [{ uri: uri.href, mimeType: MIME_APP, text: html, _meta: META_RESSOURCE }],
    }),
  );
}
