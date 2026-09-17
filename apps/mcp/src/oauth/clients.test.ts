import { describe, expect, it, vi } from 'vitest';
import type { Db, Rest } from '../db';
import { HttpError } from '../http';
import { enregistrerClient, redirectionValide } from './clients';

function dbFactice() {
  const insert = vi.fn(async (_table: string, lignes: unknown[]) => lignes);
  const rest = { insert, select: vi.fn(), selectAll: vi.fn(), update: vi.fn() } as unknown as Rest;
  return { db: { asUser: () => rest, asService: () => rest } as Db, insert };
}

describe('redirectionValide', () => {
  it('accepte https', () => {
    expect(redirectionValide('https://claude.ai/callback')).toBe(true);
  });

  it('accepte http sur la machine de l’utilisateur — le cas majoritaire en MCP', () => {
    expect(redirectionValide('http://127.0.0.1:41234/callback')).toBe(true);
    expect(redirectionValide('http://localhost:3000/cb')).toBe(true);
  });

  it('refuse http ailleurs : le code passerait en clair sur le réseau', () => {
    expect(redirectionValide('http://exemple.test/cb')).toBe(false);
    // Le piège du préfixe : un hôte qui COMMENCE par localhost n'est pas localhost.
    expect(redirectionValide('http://localhost.attaquant.test/cb')).toBe(false);
  });

  it('refuse un fragment et ce qui n’est pas une URL', () => {
    expect(redirectionValide('https://claude.ai/cb#jeton')).toBe(false);
    expect(redirectionValide('pas une url')).toBe(false);
    expect(redirectionValide('javascript:alert(1)')).toBe(false);
  });
});

describe('enregistrerClient', () => {
  it('délivre un client_id et AUCUN secret', async () => {
    const { db, insert } = dbFactice();

    const reponse = await enregistrerClient(db, {
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/cb'],
    });

    expect(reponse.client_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(reponse).not.toHaveProperty('client_secret');
    expect(reponse.token_endpoint_auth_method).toBe('none');
    expect(insert).toHaveBeenCalledWith('oauth_clients', [
      { client_id: reponse.client_id, client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] },
    ]);
  });

  it('donne un nom par défaut plutôt que de refuser un client anonyme', async () => {
    const { db } = dbFactice();
    const reponse = await enregistrerClient(db, { redirect_uris: ['https://claude.ai/cb'] });
    expect(reponse.client_name).toBe('Application sans nom');
  });

  it("refuse une redirection invalide, et la NOMME dans l'erreur", async () => {
    const { db, insert } = dbFactice();

    await expect(
      enregistrerClient(db, { redirect_uris: ['https://ok.test/cb', 'http://mechant.test/cb'] }),
    ).rejects.toThrow(/http:\/\/mechant\.test\/cb/);
    expect(insert).not.toHaveBeenCalled();
  });

  it('refuse un enregistrement sans aucune redirection', async () => {
    const { db } = dbFactice();
    await expect(enregistrerClient(db, { client_name: 'X', redirect_uris: [] })).rejects.toThrow(
      HttpError,
    );
  });
});
