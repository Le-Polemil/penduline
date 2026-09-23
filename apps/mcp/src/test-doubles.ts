import { randomUUID } from 'node:crypto';
import type { Db, Filtres, Rest } from './db';
import type { Env } from './env';

/**
 * Doublures de test, sur le modèle de `packages/shared/src/test-fixtures.ts`.
 *
 * `fausseDb` rejoue le peu de PostgREST dont le serveur se sert : les filtres
 * `eq.` et `is.null`, `limit`, et le retour de représentation en écriture. Assez
 * pour éprouver la LOGIQUE des parcours sans une base, et volontairement pas
 * plus — une réimplémentation complète de PostgREST finirait par tester
 * elle-même plutôt que le code.
 */

const NON_FILTRES = new Set(['select', 'limit', 'offset', 'order']);

type Ligne = Record<string, unknown>;

function correspond(ligne: Ligne, filtres: Filtres): boolean {
  return Object.entries(filtres).every(([colonne, valeur]) => {
    if (NON_FILTRES.has(colonne)) return true;
    if (valeur === 'is.null') return ligne[colonne] === null || ligne[colonne] === undefined;
    if (valeur === 'is.not.null') return ligne[colonne] != null;
    if (valeur.startsWith('eq.')) return String(ligne[colonne]) === valeur.slice(3);
    throw new Error(`filtre non géré par la doublure : ${colonne}=${valeur}`);
  });
}

/**
 * `object[]` en entrée plutôt que `Ligne[]` : une INTERFACE comme `Task` n'est
 * pas assignable à `Record<string, unknown>` (pas de signature d'index), et
 * exiger l'un obligerait chaque appelant à un `as never` qui masquerait de
 * vraies erreurs de type.
 */
export function fausseDb(tables: Record<string, object[]> = {}) {
  const contenu = { ...tables } as Record<string, Ligne[]>;
  const lignes = (table: string) => (contenu[table] ??= []);

  const rest: Rest = {
    async select<T>(table: string, filtres: Filtres) {
      const trouvees = lignes(table).filter((l) => correspond(l, filtres));
      const limite = filtres.limit ? Number(filtres.limit) : undefined;
      return (limite ? trouvees.slice(0, limite) : trouvees) as T[];
    },
    async selectAll<T>(table: string, filtres: Filtres) {
      return lignes(table).filter((l) => correspond(l, filtres)) as T[];
    },
    async insert<T>(table: string, nouvelles: unknown[]) {
      const creees = (nouvelles as Ligne[]).map((l) => ({
        id: randomUUID(),
        created_at: new Date().toISOString(),
        last_used_at: null,
        revoked_at: null,
        ...l,
      }));
      lignes(table).push(...creees);
      return creees as T[];
    },
    async update<T>(table: string, filtres: Filtres, patch: unknown) {
      const touchees = lignes(table).filter((l) => correspond(l, filtres));
      for (const ligne of touchees) Object.assign(ligne, patch);
      return touchees as T[];
    },
  };

  return { db: { asUser: () => rest, asService: () => rest } as Db, contenu };
}

export const envDeTest = {
  SUPABASE_URL: 'https://api.penduline.test',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_JWT_SECRET: 'supabase-'.padEnd(40, 'x'),
  MCP_TOKEN_SECRET: 'mcp-'.padEnd(40, 'y'),
  MCP_PUBLIC_URL: 'https://mcp.penduline.test',
  WEB_APP_URL: 'https://penduline.test',
  PORT: 8787,
  MCP_QUOTA_CALLS_PER_MINUTE: 60,
  MCP_QUOTA_WRITES_PER_DAY: 500,
} satisfies Env;
