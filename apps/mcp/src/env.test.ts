import { describe, expect, it } from 'vitest';
import { EnvError, readEnv } from './env';

const valide = {
  SUPABASE_URL: 'https://api.penduline.polemil.dev:8000',
  SUPABASE_ANON_KEY: 'anon-key',
  SUPABASE_JWT_SECRET: 'a'.repeat(40),
  MCP_TOKEN_SECRET: 'b'.repeat(40),
  MCP_PUBLIC_URL: 'https://mcp.penduline.polemil.dev',
  WEB_APP_URL: 'https://penduline.polemil.dev',
};

describe('readEnv', () => {
  it('accepte une configuration complète et applique les défauts de réglage', () => {
    const env = readEnv(valide);
    expect(env.PORT).toBe(8787);
    expect(env.MCP_QUOTA_CALLS_PER_MINUTE).toBe(60);
    expect(env.MCP_QUOTA_WRITES_PER_DAY).toBe(500);
  });

  it('lit les réglages fournis plutôt que les défauts', () => {
    const env = readEnv({ ...valide, PORT: '3000', MCP_QUOTA_CALLS_PER_MINUTE: '5' });
    expect(env.PORT).toBe(3000);
    expect(env.MCP_QUOTA_CALLS_PER_MINUTE).toBe(5);
  });

  it("signale d'un coup TOUT ce qui manque, pas la première erreur venue", () => {
    const { SUPABASE_ANON_KEY: _a, MCP_PUBLIC_URL: _b, ...incomplet } = valide;
    expect(() => readEnv(incomplet)).toThrow(/SUPABASE_ANON_KEY[\s\S]*MCP_PUBLIC_URL/);
  });

  it('refuse un secret trop court plutôt que de signer avec', () => {
    expect(() => readEnv({ ...valide, MCP_TOKEN_SECRET: 'court' })).toThrow(EnvError);
  });

  it("refuse deux secrets identiques — c'est toute la séparation du ticket", () => {
    const meme = 'c'.repeat(40);
    expect(() => readEnv({ ...valide, SUPABASE_JWT_SECRET: meme, MCP_TOKEN_SECRET: meme })).toThrow(
      /identique/,
    );
  });

  it('refuse une URL qui ne soit pas http(s)', () => {
    expect(() => readEnv({ ...valide, MCP_PUBLIC_URL: 'ftp://exemple.test' })).toThrow(EnvError);
  });
});
