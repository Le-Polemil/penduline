import { describe, expect, it } from 'vitest';
import { HttpError } from '../http';
import { createTokens } from '../jwt';
import { envDeTest, fausseDb } from '../test-doubles';
import { deciderAutorisation, demarrerAutorisation, lireDemandePublique } from './authorize';
import { createStore } from './store';

const tokens = createTokens(envDeTest);
const UTILISATEUR = '11111111-1111-4111-8111-111111111111';

const CLIENT = {
  client_id: 'client-1',
  client_name: 'Claude',
  redirect_uris: ['https://claude.ai/cb'],
};

function contexte(clients = [CLIENT]) {
  const { db, contenu } = fausseDb({ oauth_clients: [...clients] });
  return { db, contenu, store: createStore() };
}

const params = (extra: Record<string, string> = {}) =>
  new URLSearchParams({
    client_id: 'client-1',
    redirect_uri: 'https://claude.ai/cb',
    response_type: 'code',
    code_challenge: 'un-defi',
    code_challenge_method: 'S256',
    state: 'etat-42',
    ...extra,
  });

describe('/authorize', () => {
  it("redirige vers l'écran de consentement de l'app web", async () => {
    const { db, store } = contexte();

    const vers = new URL(await demarrerAutorisation(db, store, envDeTest, params()));

    expect(vers.origin).toBe('https://penduline.test');
    expect(vers.pathname).toBe('/autoriser');
    expect(store.lireDemande(vers.searchParams.get('demande')!)?.state).toBe('etat-42');
  });

  it('accepte une redirection omise quand le client n’en a enregistré qu’une', async () => {
    const { db, store } = contexte();
    const sansUri = params();
    sansUri.delete('redirect_uri');

    const vers = new URL(await demarrerAutorisation(db, store, envDeTest, sansUri));
    const demande = store.lireDemande(vers.searchParams.get('demande')!);
    expect(demande?.redirectUri).toBe('https://claude.ai/cb');
  });

  /**
   * Les deux seuls cas qui refusent EN DUR. Rediriger avant d'avoir vérifié le
   * client et son URI reviendrait à renvoyer l'utilisateur vers une adresse que
   * l'appelant a choisie.
   */
  describe('refus sur place, sans redirection', () => {
    it('client inconnu', async () => {
      const { db, store } = contexte([]);
      await expect(demarrerAutorisation(db, store, envDeTest, params())).rejects.toThrow(HttpError);
    });

    it('redirect_uri absente de l’enregistrement', async () => {
      const { db, store } = contexte();
      const autre = params({ redirect_uri: 'https://attaquant.test/cb' });
      await expect(demarrerAutorisation(db, store, envDeTest, autre)).rejects.toThrow(
        /redirect_uri/,
      );
    });

    it('redirection ambiguë quand le client en a enregistré plusieurs', async () => {
      const { db, store } = contexte([
        { ...CLIENT, redirect_uris: ['https://claude.ai/cb', 'https://claude.ai/autre'] },
      ]);
      const sansUri = params();
      sansUri.delete('redirect_uri');
      await expect(demarrerAutorisation(db, store, envDeTest, sansUri)).rejects.toThrow(HttpError);
    });
  });

  describe('refus renvoyés au client, une fois la redirection vérifiée', () => {
    it('response_type autre que `code`', async () => {
      const { db, store } = contexte();
      const vers = new URL(
        await demarrerAutorisation(db, store, envDeTest, params({ response_type: 'token' })),
      );
      expect(vers.origin + vers.pathname).toBe('https://claude.ai/cb');
      expect(vers.searchParams.get('error')).toBe('unsupported_response_type');
      expect(vers.searchParams.get('state')).toBe('etat-42');
    });

    it('PKCE absent, ou annoncé en `plain`', async () => {
      const { db, store } = contexte();
      const sansDefi = params();
      sansDefi.delete('code_challenge');

      const a = new URL(await demarrerAutorisation(db, store, envDeTest, sansDefi));
      const b = new URL(
        await demarrerAutorisation(db, store, envDeTest, params({ code_challenge_method: 'plain' })),
      );
      expect(a.searchParams.get('error')).toBe('invalid_request');
      expect(b.searchParams.get('error')).toBe('invalid_request');
    });
  });
});

describe('lecture de la demande par l’écran de consentement', () => {
  it('rend le nom du client et l’HÔTE de redirection, rien de plus', async () => {
    const { db, store } = contexte();
    const vers = new URL(await demarrerAutorisation(db, store, envDeTest, params()));

    const vue = lireDemandePublique(store, vers.searchParams.get('demande')!);

    expect(vue).toMatchObject({ client_name: 'Claude', redirect_host: 'claude.ai' });
    expect(vue).not.toHaveProperty('codeChallenge');
  });

  it('refuse une demande inconnue', () => {
    const { store } = contexte();
    expect(() => lireDemandePublique(store, 'inexistante')).toThrow(HttpError);
  });
});

describe('/authorize/decision', () => {
  async function demandeOuverte() {
    const ctx = contexte();
    const vers = new URL(await demarrerAutorisation(ctx.db, ctx.store, envDeTest, params()));
    return { ...ctx, demande: vers.searchParams.get('demande')! };
  }

  it('accordée : renvoie un code vers le client, avec son `state`', async () => {
    const { db, store, contenu, demande } = await demandeOuverte();
    const jeton = await tokens.signSupabaseUser(UTILISATEUR);

    const { redirect_to } = await deciderAutorisation(db, store, tokens, {
      demande,
      autorise: true,
      jeton,
    });

    const vers = new URL(redirect_to);
    expect(vers.origin + vers.pathname).toBe('https://claude.ai/cb');
    expect(vers.searchParams.get('code')).toBeTruthy();
    expect(vers.searchParams.get('state')).toBe('etat-42');
    expect(contenu.oauth_grants).toHaveLength(1);
    expect(contenu.oauth_grants[0]).toMatchObject({ user_id: UTILISATEUR, client_name: 'Claude' });
  });

  it('refusée : renvoie `access_denied`, et n’ouvre aucune autorisation', async () => {
    const { db, store, contenu, demande } = await demandeOuverte();
    const jeton = await tokens.signSupabaseUser(UTILISATEUR);

    const { redirect_to } = await deciderAutorisation(db, store, tokens, {
      demande,
      autorise: false,
      jeton,
    });

    expect(new URL(redirect_to).searchParams.get('error')).toBe('access_denied');
    expect(contenu.oauth_grants ?? []).toHaveLength(0);
  });

  it('ne se tranche pas deux fois', async () => {
    const { db, store, demande } = await demandeOuverte();
    const jeton = await tokens.signSupabaseUser(UTILISATEUR);

    await deciderAutorisation(db, store, tokens, { demande, autorise: true, jeton });
    await expect(
      deciderAutorisation(db, store, tokens, { demande, autorise: true, jeton }),
    ).rejects.toThrow(HttpError);
  });

  it('refuse un jeton de session invalide AVANT de toucher à la demande', async () => {
    const { db, store, demande } = await demandeOuverte();

    await expect(
      deciderAutorisation(db, store, tokens, { demande, autorise: true, jeton: 'pas-un-jeton' }),
    ).rejects.toThrow();
    // La demande doit être intacte : un jeton invalide ne doit pas la consommer.
    expect(store.lireDemande(demande)).toBeDefined();
  });

  it('réutilise l’autorisation existante plutôt que d’en empiler une seconde', async () => {
    const { db, store, contenu } = contexte();
    const jeton = await tokens.signSupabaseUser(UTILISATEUR);

    for (const _ of [1, 2]) {
      const vers = new URL(await demarrerAutorisation(db, store, envDeTest, params()));
      await deciderAutorisation(db, store, tokens, {
        demande: vers.searchParams.get('demande')!,
        autorise: true,
        jeton,
      });
    }

    expect(contenu.oauth_grants).toHaveLength(1);
  });

  it('rouvre une autorisation après révocation, sans ressusciter l’ancienne', async () => {
    const { db, store, contenu } = contexte();
    const jeton = await tokens.signSupabaseUser(UTILISATEUR);

    const premiere = new URL(await demarrerAutorisation(db, store, envDeTest, params()));
    await deciderAutorisation(db, store, tokens, {
      demande: premiere.searchParams.get('demande')!,
      autorise: true,
      jeton,
    });
    contenu.oauth_grants[0].revoked_at = new Date().toISOString();

    const seconde = new URL(await demarrerAutorisation(db, store, envDeTest, params()));
    await deciderAutorisation(db, store, tokens, {
      demande: seconde.searchParams.get('demande')!,
      autorise: true,
      jeton,
    });

    expect(contenu.oauth_grants).toHaveLength(2);
    expect(contenu.oauth_grants[0].revoked_at).not.toBeNull();
    expect(contenu.oauth_grants[1].revoked_at).toBeNull();
  });
});
