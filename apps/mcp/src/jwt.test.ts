import { SignJWT, decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import type { Env } from './env';
import { MCP_AUDIENCE, TokenError, createTokens } from './jwt';

const env = {
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

const tokens = createTokens(env);

const UTILISATEUR = '11111111-1111-4111-8111-111111111111';
const claims = { userId: UTILISATEUR, grantId: 'grant-1', clientId: 'client-1' };

/** Durée de vie annoncée par le jeton, en secondes. */
const duree = (jeton: string) => {
  const { exp, iat } = decodeJwt(jeton);
  return exp! - iat!;
};

describe("jeton d'accès MCP", () => {
  it('porte utilisateur, autorisation et client, pour une heure', async () => {
    const jeton = await tokens.signMcpAccess(claims);
    const payload = decodeJwt(jeton);

    expect(payload.sub).toBe(UTILISATEUR);
    expect(payload.grant_id).toBe('grant-1');
    expect(payload.client_id).toBe('client-1');
    expect(payload.aud).toBe(MCP_AUDIENCE);
    expect(payload.iss).toBe(env.MCP_PUBLIC_URL);
    expect(duree(jeton)).toBe(3600);
  });

  it('se relit tel qu’il a été signé', async () => {
    expect(await tokens.verifyMcpAccess(await tokens.signMcpAccess(claims))).toEqual(claims);
  });

  it('est refusé une fois expiré', async () => {
    const perime = await new SignJWT({ grant_id: 'g', client_id: 'c' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(env.MCP_PUBLIC_URL)
      .setAudience(MCP_AUDIENCE)
      .setSubject(UTILISATEUR)
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign(new TextEncoder().encode(env.MCP_TOKEN_SECRET));

    await expect(tokens.verifyMcpAccess(perime)).rejects.toThrow(TokenError);
  });
});

describe('jetons Supabase', () => {
  it('le jeton utilisateur porte `role: authenticated` et vit 60 s', async () => {
    const jeton = await tokens.signSupabaseUser(UTILISATEUR);
    const payload = decodeJwt(jeton);

    expect(payload.role).toBe('authenticated');
    expect(payload.aud).toBe('authenticated');
    expect(payload.sub).toBe(UTILISATEUR);
    expect(duree(jeton)).toBe(60);
  });

  it('le jeton de service porte `role: service_role`, sans utilisateur', async () => {
    const jeton = await tokens.signSupabaseService();
    const payload = decodeJwt(jeton);

    expect(payload.role).toBe('service_role');
    expect(payload.sub).toBeUndefined();
    expect(duree(jeton)).toBe(60);
  });

  it('un `service_role` ne peut pas se faire passer pour un utilisateur', async () => {
    await expect(tokens.verifySupabaseUser(await tokens.signSupabaseService())).rejects.toThrow(
      /rôle inattendu/,
    );
  });
});

/**
 * Le test qui justifie l'existence de deux secrets. S'il tombe, le serveur n'est
 * plus qu'un distributeur de clés de la base.
 */
describe('étanchéité des deux secrets', () => {
  it("un jeton d'accès MCP est REFUSÉ comme jeton Supabase", async () => {
    await expect(tokens.verifySupabaseUser(await tokens.signMcpAccess(claims))).rejects.toThrow(
      TokenError,
    );
  });

  it("un jeton Supabase est REFUSÉ comme jeton d'accès MCP", async () => {
    await expect(tokens.verifyMcpAccess(await tokens.signSupabaseUser(UTILISATEUR))).rejects.toThrow(
      TokenError,
    );
  });
});
