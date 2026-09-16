/**
 * Le strict minimum de `node:fs` et `node:url`, déclaré ici (#91).
 *
 * ⚠️ POURQUOI PAS `@types/node`. `tsconfig.json` restreint volontairement
 * `"types"` à `["vite/client"]` : ajouter `"node"` rendrait `process`, `Buffer`
 * et `__dirname` visibles dans TOUT le code de l'app web, où ils n'existent pas à
 * l'exécution. On paierait la sécurité de milliers de lignes pour un seul test.
 *
 * ⚠️ POURQUOI PAS `?raw`, comme `pwa/manifest.test.ts`. Le greffon CSS de Vite
 * revendique l'extension `.css` avant que la requête `?raw` ne soit honorée, et
 * l'import renvoie une chaîne VIDE — vérifié, `raw.length === 0`. Le test
 * passerait alors sur un fichier inexistant, c'est-à-dire ne verrouillerait rien.
 * `assetsInclude` et `import.meta.glob({ query: '?raw' })` donnent le même vide.
 *
 * Deux signatures, celles qu'utilise `styles.test.ts`, et rien d'autre.
 */
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: URL): string;
}
