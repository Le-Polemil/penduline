import { describe, expect, it } from 'vitest';
import type { Env } from '../env';
import { metadonneesRessource, metadonneesServeur } from './metadata';

const env = {
  SUPABASE_URL: 'https://api.penduline.test',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_JWT_SECRET: 'supabase-'.padEnd(40, 'x'),
  MCP_TOKEN_SECRET: 'mcp-'.padEnd(40, 'y'),
  // Avec une barre finale, pour vérifier qu'elle ne se retrouve pas doublée.
  MCP_PUBLIC_URL: 'https://mcp.penduline.test/',
  WEB_APP_URL: 'https://penduline.test',
  PORT: 8787,
  MCP_QUOTA_CALLS_PER_MINUTE: 60,
  MCP_QUOTA_WRITES_PER_DAY: 500,
} satisfies Env;

describe('métadonnées du serveur d’autorisation', () => {
  it('annonce les trois points d’entrée sans barre doublée', () => {
    const m = metadonneesServeur(env);
    expect(m.issuer).toBe('https://mcp.penduline.test');
    expect(m.authorization_endpoint).toBe('https://mcp.penduline.test/authorize');
    expect(m.token_endpoint).toBe('https://mcp.penduline.test/token');
    expect(m.registration_endpoint).toBe('https://mcp.penduline.test/register');
  });

  it('n’annonce QUE S256 — `plain` ne protège de rien', () => {
    expect(metadonneesServeur(env).code_challenge_methods_supported).toEqual(['S256']);
  });

  it('annonce des clients publics : aucun secret à distribuer', () => {
    expect(metadonneesServeur(env).token_endpoint_auth_methods_supported).toEqual(['none']);
  });
});

describe('métadonnées de la ressource protégée', () => {
  it('se désigne elle-même comme serveur d’autorisation', () => {
    const m = metadonneesRessource(env);
    expect(m.resource).toBe('https://mcp.penduline.test');
    expect(m.authorization_servers).toEqual(['https://mcp.penduline.test']);
  });
});
