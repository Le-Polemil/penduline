import { decodeJwt } from 'jose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbError, PAGE, createDb } from './db';
import type { Env } from './env';
import { createTokens } from './jwt';

const env = {
  SUPABASE_URL: 'https://api.penduline.test/',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_JWT_SECRET: 'supabase-'.padEnd(40, 'x'),
  MCP_TOKEN_SECRET: 'mcp-'.padEnd(40, 'y'),
  MCP_PUBLIC_URL: 'https://mcp.penduline.test',
  WEB_APP_URL: 'https://penduline.test',
  PORT: 8787,
  MCP_QUOTA_CALLS_PER_MINUTE: 60,
  MCP_QUOTA_WRITES_PER_DAY: 500,
} satisfies Env;

const db = createDb(env, createTokens(env));
const UTILISATEUR = '11111111-1111-4111-8111-111111111111';

/** Les requêtes observées, dans l'ordre. */
type Appel = { url: URL; methode: string; entetes: Record<string, string>; corps?: string };

function stubFetch(reponses: Array<{ status?: number; body: unknown }>) {
  const appels: Appel[] = [];
  let i = 0;
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    appels.push({
      url: new URL(url),
      methode: init.method!,
      entetes: init.headers as Record<string, string>,
      corps: init.body as string | undefined,
    });
    const { status = 200, body } = reponses[Math.min(i++, reponses.length - 1)];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  });
  return appels;
}

afterEach(() => vi.unstubAllGlobals());

const lignes = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i }));

describe('selectAll', () => {
  it('enchaîne les pages tant que PostgREST en rend une pleine', async () => {
    const appels = stubFetch([{ body: lignes(PAGE) }, { body: lignes(PAGE) }, { body: lignes(7) }]);

    const tout = await db.asUser(UTILISATEUR).selectAll('tasks', { select: '*' });

    expect(tout).toHaveLength(2 * PAGE + 7);
    expect(appels).toHaveLength(3);
    expect(appels.map((a) => a.url.searchParams.get('offset'))).toEqual(['0', '1000', '2000']);
    expect(appels[0].url.searchParams.get('limit')).toBe(String(PAGE));
  });

  it('redemande une page après une page EXACTEMENT pleine', async () => {
    // Le cas qui piège : une dernière page pleine est indistinguable d'une suite,
    // il faut aller voir. S'arrêter là tronquerait en silence, ce qui est
    // précisément le défaut qu'on vient corriger.
    const appels = stubFetch([{ body: lignes(PAGE) }, { body: [] }]);

    expect(await db.asUser(UTILISATEUR).selectAll('tasks', {})).toHaveLength(PAGE);
    expect(appels).toHaveLength(2);
  });

  it("ne demande qu'une page quand la première est courte", async () => {
    const appels = stubFetch([{ body: lignes(3) }]);

    expect(await db.asUser(UTILISATEUR).selectAll('boards', {})).toHaveLength(3);
    expect(appels).toHaveLength(1);
  });
});

describe('en-têtes et jetons', () => {
  it("porte l'`apikey` de Kong ET un jeton utilisateur signé à la volée", async () => {
    const appels = stubFetch([{ body: [] }]);

    await db.asUser(UTILISATEUR).select('boards', { select: '*' });

    expect(appels[0].entetes.apikey).toBe('anon-key');
    const jeton = decodeJwt(appels[0].entetes.Authorization.replace('Bearer ', ''));
    expect(jeton.role).toBe('authenticated');
    expect(jeton.sub).toBe(UTILISATEUR);
  });

  it('bascule sur `service_role` pour les tables sans propriétaire', async () => {
    const appels = stubFetch([{ body: [] }]);

    await db.asService().select('oauth_clients', {});

    const jeton = decodeJwt(appels[0].entetes.Authorization.replace('Bearer ', ''));
    expect(jeton.role).toBe('service_role');
    expect(jeton.sub).toBeUndefined();
  });

  it('demande la représentation en écriture, pour relire ce qui a été écrit', async () => {
    const appels = stubFetch([{ body: [{ id: 'a' }] }]);

    await db.asUser(UTILISATEUR).insert('tasks', [{ title: 'x' }]);

    expect(appels[0].methode).toBe('POST');
    expect(appels[0].entetes.Prefer).toBe('return=representation');
    expect(JSON.parse(appels[0].corps!)).toEqual([{ title: 'x' }]);
  });

  it("ne double pas la barre oblique de l'URL de base", async () => {
    const appels = stubFetch([{ body: [] }]);

    await db.asUser(UTILISATEUR).select('boards', {});

    expect(appels[0].url.pathname).toBe('/rest/v1/boards');
  });
});

describe('erreurs', () => {
  it('remonte le message de PostgREST tel quel — il nomme la contrainte', async () => {
    stubFetch([
      {
        status: 400,
        body: '{"code":"P0001","message":"Profondeur maximale atteinte : une sous-tâche ne peut pas en avoir"}',
      },
    ]);

    await expect(db.asUser(UTILISATEUR).insert('tasks', [{}])).rejects.toThrow(
      /Profondeur maximale/,
    );
  });

  it('porte le statut HTTP, pour distinguer un refus RLS d’une contrainte', async () => {
    stubFetch([{ status: 403, body: '{"code":"42501"}' }]);

    await expect(db.asService().select('oauth_clients', {})).rejects.toMatchObject({
      status: 403,
    });
    await expect(db.asService().select('oauth_clients', {})).rejects.toBeInstanceOf(DbError);
  });
});
