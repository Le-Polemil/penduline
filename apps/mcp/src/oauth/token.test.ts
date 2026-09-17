import { describe, expect, it } from 'vitest';
import { HttpError } from '../http';
import { createTokens } from '../jwt';
import { envDeTest, fausseDb } from '../test-doubles';
import { demarrerAutorisation, deciderAutorisation } from './authorize';
import { defi } from './pkce';
import { createStore } from './store';
import { echangerJetons, empreinte } from './token';

const tokens = createTokens(envDeTest);
const UTILISATEUR = '11111111-1111-4111-8111-111111111111';
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

/** Déroule le parcours complet jusqu'au code, comme un vrai client le ferait. */
async function jusquAuCode() {
  const { db, contenu } = fausseDb({
    oauth_clients: [
      { client_id: 'client-1', client_name: 'Claude', redirect_uris: ['https://claude.ai/cb'] },
    ],
  });
  const store = createStore();

  const vers = new URL(
    await demarrerAutorisation(
      db,
      store,
      envDeTest,
      new URLSearchParams({
        client_id: 'client-1',
        redirect_uri: 'https://claude.ai/cb',
        response_type: 'code',
        code_challenge: defi(VERIFIER),
        code_challenge_method: 'S256',
      }),
    ),
  );

  const { redirect_to } = await deciderAutorisation(db, store, tokens, {
    demande: vers.searchParams.get('demande')!,
    autorise: true,
    jeton: await tokens.signSupabaseUser(UTILISATEUR),
  });

  return { db, store, contenu, code: new URL(redirect_to).searchParams.get('code')! };
}

const echangeValide = (code: string) => ({
  grant_type: 'authorization_code',
  code,
  code_verifier: VERIFIER,
  redirect_uri: 'https://claude.ai/cb',
  client_id: 'client-1',
});

describe('échange du code', () => {
  it("rend un jeton d'accès utilisable et un jeton de rafraîchissement", async () => {
    const { db, store, contenu, code } = await jusquAuCode();

    const jetons = await echangerJetons(db, store, tokens, echangeValide(code));

    expect(jetons.token_type).toBe('Bearer');
    expect(jetons.expires_in).toBe(3600);
    expect(await tokens.verifyMcpAccess(jetons.access_token)).toMatchObject({
      userId: UTILISATEUR,
      clientId: 'client-1',
    });
    // Seule l'empreinte est stockée : une fuite de la base ne rend aucun jeton.
    expect(contenu.oauth_grants[0].refresh_token_hash).toBe(empreinte(jetons.refresh_token));
    expect(contenu.oauth_grants[0].refresh_token_hash).not.toBe(jetons.refresh_token);
  });

  it('refuse un mauvais `code_verifier`', async () => {
    const { db, store, code } = await jusquAuCode();

    await expect(
      echangerJetons(db, store, tokens, { ...echangeValide(code), code_verifier: 'x'.repeat(43) }),
    ).rejects.toThrow(/code_verifier/);
  });

  it('refuse un code REJOUÉ', async () => {
    const { db, store, code } = await jusquAuCode();

    await echangerJetons(db, store, tokens, echangeValide(code));
    await expect(echangerJetons(db, store, tokens, echangeValide(code))).rejects.toThrow(
      /déjà utilisé/,
    );
  });

  it('refuse un code inconnu — et ne dit pas en quoi il est faux', async () => {
    const { db, store } = await jusquAuCode();

    await expect(
      echangerJetons(db, store, tokens, echangeValide('code-invente')),
    ).rejects.toThrow(/invalide, expiré ou déjà utilisé/);
  });

  it('refuse une `redirect_uri` différente de celle du code', async () => {
    const { db, store, code } = await jusquAuCode();

    await expect(
      echangerJetons(db, store, tokens, {
        ...echangeValide(code),
        redirect_uri: 'https://claude.ai/autre',
      }),
    ).rejects.toThrow(/redirect_uri/);
  });

  it("refuse un code présenté par un AUTRE client", async () => {
    const { db, store, code } = await jusquAuCode();

    await expect(
      echangerJetons(db, store, tokens, { ...echangeValide(code), client_id: 'client-2' }),
    ).rejects.toThrow(/autre client/);
  });

  it("refuse si l'autorisation a été révoquée entre le consentement et l'échange", async () => {
    const { db, store, contenu, code } = await jusquAuCode();
    contenu.oauth_grants[0].revoked_at = new Date().toISOString();

    await expect(echangerJetons(db, store, tokens, echangeValide(code))).rejects.toThrow(
      /révoquée/,
    );
  });
});

describe('rafraîchissement, avec rotation', () => {
  async function premierEchange() {
    const ctx = await jusquAuCode();
    const jetons = await echangerJetons(ctx.db, ctx.store, tokens, echangeValide(ctx.code));
    return { ...ctx, jetons };
  }

  it('rend un NOUVEAU jeton de rafraîchissement, et périme le précédent', async () => {
    const { db, store, jetons } = await premierEchange();

    const seconds = await echangerJetons(db, store, tokens, {
      grant_type: 'refresh_token',
      refresh_token: jetons.refresh_token,
    });

    expect(seconds.refresh_token).not.toBe(jetons.refresh_token);
    // Le premier ne vaut plus rien : c'est toute la rotation.
    await expect(
      echangerJetons(db, store, tokens, {
        grant_type: 'refresh_token',
        refresh_token: jetons.refresh_token,
      }),
    ).rejects.toThrow(/invalide ou révoqué/);
  });

  it('refuse un jeton de rafraîchissement inventé', async () => {
    const { db, store } = await premierEchange();

    await expect(
      echangerJetons(db, store, tokens, { grant_type: 'refresh_token', refresh_token: 'invente' }),
    ).rejects.toThrow(HttpError);
  });

  it('refuse dès que l’autorisation est révoquée — la révocation mord tout de suite', async () => {
    const { db, store, contenu, jetons } = await premierEchange();
    contenu.oauth_grants[0].revoked_at = new Date().toISOString();

    await expect(
      echangerJetons(db, store, tokens, {
        grant_type: 'refresh_token',
        refresh_token: jetons.refresh_token,
      }),
    ).rejects.toThrow(/invalide ou révoqué/);
  });
});

describe('grant_type', () => {
  it('refuse tout ce qui n’est pas `authorization_code` ou `refresh_token`', async () => {
    const { db, store } = await jusquAuCode();

    await expect(
      echangerJetons(db, store, tokens, { grant_type: 'password', username: 'x' }),
    ).rejects.toThrow(/non supporté/);
    await expect(echangerJetons(db, store, tokens, {})).rejects.toThrow(/absent/);
  });
});
