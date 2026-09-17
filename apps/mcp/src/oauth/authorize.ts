import type { Db } from '../db';
import type { Env } from '../env';
import { HttpError } from '../http';
import type { Tokens } from '../jwt';
import { lireClient } from './clients';
import type { Store } from './store';

/**
 * `/authorize` et `/authorize/decision`.
 *
 * Le serveur MCP ne montre AUCUN écran : il n'a ni session de navigateur, ni
 * page de connexion, et en fabriquer une signifierait demander à l'utilisateur
 * son mot de passe Penduline sur un second domaine — exactement l'habitude que
 * l'hameçonnage exploite. Il redirige donc vers l'application web, déjà
 * connectée, qui pose la question et rapporte la réponse.
 *
 *   client ──GET /authorize──> 302 vers {WEB_APP_URL}/autoriser?demande=…
 *                                  │
 *                                  │ l'utilisateur voit le nom du client
 *                                  │ et l'hôte de redirection, puis tranche
 *                                  ▼
 *             POST /authorize/decision  (jeton Supabase de la session en cours)
 *                                  │
 *                                  ▼
 *                        { redirect_to: …?code=…&state=… }
 */

/** Une autorisation en base — ce que la modale « Applications connectées » liste. */
export interface OAuthGrant {
  id: string;
  user_id: string;
  client_id: string;
  client_name: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

function erreurVersClient(redirectUri: string, code: string, state?: string): string {
  const url = new URL(redirectUri);
  url.searchParams.set('error', code);
  if (state) url.searchParams.set('state', state);
  return url.toString();
}

/**
 * Valide la demande et ouvre le parcours. Rend l'URL vers laquelle rediriger —
 * l'écran de consentement si tout va bien, le client avec une erreur sinon.
 *
 * La frontière entre les deux n'est pas cosmétique : tant que `client_id` et
 * `redirect_uri` ne sont pas VÉRIFIÉS, rediriger reviendrait à renvoyer
 * l'utilisateur, et l'erreur, vers une adresse choisie par l'appelant. Ces
 * deux-là échouent donc en dur, sur place.
 */
export async function demarrerAutorisation(
  db: Db,
  store: Store,
  env: Env,
  params: URLSearchParams,
): Promise<string> {
  const clientId = params.get('client_id');
  if (!clientId) throw new HttpError(400, 'client_id manquant', 'invalid_request');

  const client = await lireClient(db, clientId);
  if (!client) throw new HttpError(400, 'client inconnu', 'invalid_client');

  const demandee = params.get('redirect_uri');
  // Omise et le client n'en a enregistré qu'une : c'est sans ambiguïté.
  const redirectUri = demandee ?? (client.redirect_uris.length === 1 ? client.redirect_uris[0] : null);
  if (!redirectUri || !client.redirect_uris.includes(redirectUri)) {
    throw new HttpError(400, "redirect_uri absente de l'enregistrement du client", 'invalid_request');
  }

  const state = params.get('state') ?? undefined;

  // À partir d'ici, rediriger est sûr : l'adresse vient de l'enregistrement.
  if (params.get('response_type') !== 'code') {
    return erreurVersClient(redirectUri, 'unsupported_response_type', state);
  }
  const codeChallenge = params.get('code_challenge');
  if (!codeChallenge || params.get('code_challenge_method') !== 'S256') {
    return erreurVersClient(redirectUri, 'invalid_request', state);
  }

  const demande = store.ouvrirDemande({
    clientId,
    clientName: client.client_name,
    redirectUri,
    codeChallenge,
    state,
  });

  const vers = new URL('/autoriser', env.WEB_APP_URL);
  vers.searchParams.set('demande', demande.id);
  return vers.toString();
}

/**
 * Ce que l'écran de consentement affiche.
 *
 * L'hôte, et pas l'URI entière : c'est la seule partie qui dit quelque chose à
 * un humain, et c'est celle qui compte — « ce code part vers claude.ai » ou
 * « vers votre machine ». Le chemin et les paramètres n'ajouteraient que du
 * bruit à relire.
 *
 * Rendu par le serveur plutôt que porté par l'URL : si le nom voyageait dans
 * `?application=…`, un lien forgé afficherait « Penduline » au-dessus de la
 * demande de quelqu'un d'autre.
 */
export function lireDemandePublique(store: Store, id: string) {
  const demande = store.lireDemande(id);
  if (!demande) throw new HttpError(404, 'demande inconnue ou expirée', 'invalid_request');
  return {
    client_name: demande.clientName,
    redirect_host: new URL(demande.redirectUri).host,
    expire_a: new Date(demande.expireA).toISOString(),
  };
}

/** L'autorisation active de ce couple (utilisateur, client), ou une nouvelle. */
async function autorisation(db: Db, userId: string, clientId: string, clientName: string) {
  const [existante] = await db.asService().select<OAuthGrant>('oauth_grants', {
    user_id: `eq.${userId}`,
    client_id: `eq.${clientId}`,
    revoked_at: 'is.null',
    select: '*',
    limit: '1',
  });
  if (existante) return existante;

  const [creee] = await db
    .asService()
    .insert<OAuthGrant>('oauth_grants', [{ user_id: userId, client_id: clientId, client_name: clientName }]);
  return creee;
}

export interface Decision {
  demande: string;
  autorise: boolean;
  /** Le jeton Supabase de la session en cours, tel que l'app web le détient. */
  jeton: string;
}

export async function deciderAutorisation(
  db: Db,
  store: Store,
  tokens: Tokens,
  { demande: id, autorise, jeton }: Decision,
): Promise<{ redirect_to: string }> {
  const userId = await tokens.verifySupabaseUser(jeton);

  // Consommée, pas seulement lue : une demande tranchée ne se retranche pas.
  const demande = store.consommerDemande(id);
  if (!demande) throw new HttpError(404, 'demande inconnue ou expirée', 'invalid_request');

  if (!autorise) {
    return { redirect_to: erreurVersClient(demande.redirectUri, 'access_denied', demande.state) };
  }

  const grant = await autorisation(db, userId, demande.clientId, demande.clientName);

  const { code } = store.emettreCode({
    userId,
    grantId: grant.id,
    clientId: demande.clientId,
    redirectUri: demande.redirectUri,
    // Le défi voyage jusqu'ici pour être comparé à `/token` : c'est ce qui lie le
    // code au client qui l'a demandé, et à lui seul.
    codeChallenge: demande.codeChallenge,
  });

  const vers = new URL(demande.redirectUri);
  vers.searchParams.set('code', code);
  if (demande.state) vers.searchParams.set('state', demande.state);
  return { redirect_to: vers.toString() };
}
