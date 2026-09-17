import { createHash, randomBytes } from 'node:crypto';
import type { Db } from '../db';
import { HttpError } from '../http';
import type { Tokens } from '../jwt';
import type { OAuthGrant } from './authorize';
import { verifiePkce } from './pkce';
import type { Store } from './store';

/**
 * `/token` — les deux seuls échanges que le serveur accepte.
 *
 *   authorization_code   le code fraîchement reçu + le `code_verifier` → jetons
 *   refresh_token        un jeton de rafraîchissement → jetons, ET ROTATION
 *
 * Le jeton de rafraîchissement n'est PAS un JWT : il est opaque, tiré au hasard,
 * et seul son SHA-256 est en base. Un JWT serait vérifiable hors ligne, donc
 * impossible à révoquer avant son échéance — soit exactement ce qu'un jeton de
 * longue durée ne doit pas être. Ici, révoquer l'autorisation le tue sur-le-champ.
 */

/** Durée annoncée du jeton d'accès, en secondes. Doit suivre `MCP_ACCESS_TTL`. */
const EXPIRE_DANS = 3600;

export function empreinte(jeton: string): string {
  return createHash('sha256').update(jeton, 'utf8').digest('hex');
}

function refus(code: string, description: string): never {
  throw new HttpError(400, description, code);
}

export interface Jetons {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

/**
 * Délivre le couple de jetons et POSE le nouveau hash de rafraîchissement.
 *
 * La rotation est ici systématique — le jeton rendu au précédent échange cesse
 * de valoir quoi que ce soit.
 *
 * ⚠️ C'est l'INVERSE du choix fait pour les sessions Supabase
 * (`config.toml`, rotation désactivée), et les deux sont justes. Là-bas, le même
 * jeton vit dans deux stockages qui dérivent l'un de l'autre (PWA et onglet,
 * puis web et extension) : la rotation les fait se révoquer mutuellement. Ici,
 * un seul client détient le jeton, personne ne le partage, et la rotation
 * retrouve ce qu'elle est censée apporter — un jeton volé cesse de servir dès
 * que le client légitime se rafraîchit.
 */
async function delivrer(db: Db, tokens: Tokens, grant: OAuthGrant): Promise<Jetons> {
  const refresh = randomBytes(32).toString('base64url');

  await db.asService().update('oauth_grants', { id: `eq.${grant.id}` }, {
    refresh_token_hash: empreinte(refresh),
    last_used_at: new Date().toISOString(),
  });

  return {
    access_token: await tokens.signMcpAccess({
      userId: grant.user_id,
      grantId: grant.id,
      clientId: grant.client_id,
    }),
    token_type: 'Bearer',
    expires_in: EXPIRE_DANS,
    refresh_token: refresh,
    scope: 'penduline',
  };
}

/** L'autorisation, si elle existe encore ET n'a pas été révoquée. */
async function autorisationVivante(db: Db, id: string): Promise<OAuthGrant> {
  const [grant] = await db
    .asService()
    .select<OAuthGrant>('oauth_grants', { id: `eq.${id}`, revoked_at: 'is.null', select: '*', limit: '1' });
  if (!grant) refus('invalid_grant', 'autorisation révoquée ou inconnue');
  return grant;
}

async function echangerCode(
  db: Db,
  store: Store,
  tokens: Tokens,
  corps: Record<string, string>,
): Promise<Jetons> {
  const code = store.consommerCode(corps.code ?? '');
  // Un code inconnu, déjà échangé ou expiré : le même refus, sans dire lequel.
  // Distinguer les trois renseignerait un attaquant sur ce qu'il a trouvé.
  if (!code) refus('invalid_grant', "code d'autorisation invalide, expiré ou déjà utilisé");

  if (corps.client_id && corps.client_id !== code.clientId) {
    refus('invalid_grant', 'code émis pour un autre client');
  }
  // La RFC l'exige quand `redirect_uri` était présente à `/authorize` : elle l'est
  // toujours ici, puisqu'on la résout avant d'ouvrir la demande.
  if (corps.redirect_uri && corps.redirect_uri !== code.redirectUri) {
    refus('invalid_grant', 'redirect_uri différente de celle du code');
  }
  if (!verifiePkce(code.codeChallenge, corps.code_verifier)) {
    refus('invalid_grant', 'code_verifier ne correspond pas au code_challenge');
  }

  // Relue MAINTENANT : l'utilisateur a pu révoquer entre le consentement et
  // l'échange. Deux minutes suffisent à changer d'avis.
  return delivrer(db, tokens, await autorisationVivante(db, code.grantId));
}

async function rafraichir(db: Db, tokens: Tokens, corps: Record<string, string>): Promise<Jetons> {
  const presente = corps.refresh_token;
  if (!presente) refus('invalid_request', 'refresh_token manquant');

  const [grant] = await db.asService().select<OAuthGrant>('oauth_grants', {
    refresh_token_hash: `eq.${empreinte(presente)}`,
    revoked_at: 'is.null',
    select: '*',
    limit: '1',
  });
  // Rejouer un jeton déjà tourné tombe ici : son hash n'est plus en base.
  //
  // Limite assumée : faute de garder les hash précédents, le serveur ne sait pas
  // distinguer un REJEU d'un jeton simplement faux, et ne peut donc pas révoquer
  // la famille par précaution. La contrepartie de la rotation reste acquise — le
  // jeton volé ne sert plus dès le rafraîchissement suivant du client légitime.
  if (!grant) refus('invalid_grant', 'jeton de rafraîchissement invalide ou révoqué');

  if (corps.client_id && corps.client_id !== grant.client_id) {
    refus('invalid_grant', 'jeton émis pour un autre client');
  }

  return delivrer(db, tokens, grant);
}

export async function echangerJetons(
  db: Db,
  store: Store,
  tokens: Tokens,
  corps: Record<string, string>,
): Promise<Jetons> {
  switch (corps.grant_type) {
    case 'authorization_code':
      return echangerCode(db, store, tokens, corps);
    case 'refresh_token':
      return rafraichir(db, tokens, corps);
    default:
      throw new HttpError(400, `grant_type non supporté : ${corps.grant_type ?? '(absent)'}`, 'unsupported_grant_type');
  }
}
