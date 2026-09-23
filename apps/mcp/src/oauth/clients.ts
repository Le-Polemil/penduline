import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from '../db';
import { HttpError } from '../http';

/**
 * Enregistrement dynamique (RFC 7591), et validation des URI de redirection.
 *
 * L'enregistrement est ouvert : n'importe quel client peut s'enregistrer, et
 * c'est voulu — c'est ce qui permet de brancher un client MCP sans passer par
 * une console d'administration. Ça ne donne AUCUN accès : un enregistrement ne
 * vaut rien tant qu'un utilisateur n'a pas dit oui sur l'écran de consentement.
 *
 * Le seul endroit où l'enregistrement doit être sévère, c'est l'URI de
 * redirection : c'est elle qui reçoit le code d'autorisation. Une validation
 * laxiste ici, et un client malveillant se fait envoyer le code d'un autre.
 */

export interface OAuthClient {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  created_at: string;
  last_used_at: string | null;
}

/**
 * Une URI de redirection acceptable.
 *
 * Deux formes, et deux seulement :
 *   · `https://…` — le cas d'un client hébergé ;
 *   · `http://127.0.0.1:…` ou `http://localhost:…` — le cas, très majoritaire
 *     ici, d'un client MCP qui tourne sur la machine de l'utilisateur et ouvre
 *     un port éphémère pour recevoir le code.
 *
 * `http://` ailleurs est refusé : le code passerait en clair sur le réseau.
 * Un fragment est refusé aussi — la RFC l'interdit, et il ne survivrait pas à la
 * redirection de toute façon.
 */
export function redirectionValide(valeur: string): boolean {
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return false;
  }
  if (url.hash) return false;
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  return false;
}

const schema = z.object({
  client_name: z.string().trim().min(1).max(120).default('Application sans nom'),
  redirect_uris: z.array(z.string()).min(1).max(10),
});

export interface Enregistrement {
  client_id: string;
  client_name: string;
  redirect_uris: string[];
  client_id_issued_at: number;
  token_endpoint_auth_method: 'none';
  grant_types: string[];
  response_types: string[];
}

export async function enregistrerClient(
  db: Db,
  corps: Record<string, unknown>,
): Promise<Enregistrement> {
  const parsed = schema.safeParse(corps);
  if (!parsed.success) {
    throw new HttpError(400, 'client_name ou redirect_uris invalide', 'invalid_client_metadata');
  }

  const { client_name, redirect_uris } = parsed.data;
  const fautive = redirect_uris.find((uri) => !redirectionValide(uri));
  if (fautive) {
    throw new HttpError(
      400,
      `redirect_uri refusée : ${fautive} — https, ou http sur localhost uniquement`,
      'invalid_redirect_uri',
    );
  }

  const client_id = randomUUID();
  await db.asService().insert('oauth_clients', [{ client_id, client_name, redirect_uris }]);

  return {
    client_id,
    client_name,
    redirect_uris,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    // Aucun `client_secret` : client public, c'est PKCE qui fait le travail.
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
  };
}

/** Relit un client enregistré. `undefined` si le `client_id` est inconnu. */
export async function lireClient(db: Db, clientId: string): Promise<OAuthClient | undefined> {
  const [client] = await db
    .asService()
    .select<OAuthClient>('oauth_clients', { client_id: `eq.${clientId}`, select: '*', limit: '1' });
  return client;
}
