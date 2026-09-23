import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import type { Env } from './env';

/**
 * Les trois jetons du serveur, et leur asymétrie voulue.
 *
 *   jeton d'accès MCP     MCP_TOKEN_SECRET     1 h    ce que le client présente
 *   JWT « authenticated » SUPABASE_JWT_SECRET  60 s   ce que PostgREST accepte, POUR un utilisateur
 *   JWT « service_role »  SUPABASE_JWT_SECRET  60 s   ce que PostgREST accepte, sans utilisateur
 *
 * Deux secrets, pas un : un jeton d'accès MCP présenté directement à PostgREST
 * doit être refusé. Sans cette séparation, le serveur ne serait qu'un
 * distributeur de clés de la base — n'importe quel client contournerait les
 * outils, les quotas et la révocation en tapant l'API directement.
 *
 * Les 60 s des deux jetons Supabase reprennent le raisonnement déjà écrit dans
 * `config.toml` : PostgREST valide un JWT HORS LIGNE, il ne peut pas savoir
 * qu'il a été révoqué. Sa durée de vie est donc exactement la fenêtre pendant
 * laquelle une révocation reste sans effet. Ici, elle vaut un appel.
 */

/** L'audience du jeton d'accès MCP. Ce que PostgREST ne connaît pas. */
export const MCP_AUDIENCE = 'penduline-mcp';

/** L'audience des jetons GoTrue, que PostgREST retrouve dans un jeton légitime. */
const SUPABASE_AUDIENCE = 'authenticated';

const MCP_ACCESS_TTL = '1h';
/** En secondes, pour rester lisible à côté du raisonnement ci-dessus. */
const SUPABASE_TTL_SECONDS = 60;

const cle = (secret: string) => new TextEncoder().encode(secret);

export class TokenError extends Error {}

/** Ce que porte un jeton d'accès MCP — et rien de plus. */
export interface McpAccessClaims {
  /** L'utilisateur Penduline au nom de qui le client agit. */
  userId: string;
  /** L'autorisation, relue en base à chaque appel pour honorer une révocation. */
  grantId: string;
  /** L'application, pour les messages et le journal. */
  clientId: string;
}

export interface Tokens {
  signMcpAccess(claims: McpAccessClaims): Promise<string>;
  verifyMcpAccess(token: string): Promise<McpAccessClaims>;
  signSupabaseUser(userId: string): Promise<string>;
  signSupabaseService(): Promise<string>;
  verifySupabaseUser(token: string): Promise<string>;
}

/**
 * Lie les secrets une fois pour toutes. Une fabrique plutôt que des fonctions
 * libres prenant `env` en premier argument : l'appelant ne peut alors pas se
 * tromper de secret, puisqu'il n'en manipule aucun.
 */
export function createTokens(env: Env): Tokens {
  const secretMcp = cle(env.MCP_TOKEN_SECRET);
  const secretSupabase = cle(env.SUPABASE_JWT_SECRET);
  const issuer = env.MCP_PUBLIC_URL;

  async function signSupabase(payload: JWTPayload, role: string, subject?: string) {
    let jwt = new SignJWT({ ...payload, role })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setAudience(SUPABASE_AUDIENCE)
      .setExpirationTime(`${SUPABASE_TTL_SECONDS}s`);
    if (subject) jwt = jwt.setSubject(subject);
    return jwt.sign(secretSupabase);
  }

  return {
    async signMcpAccess({ userId, grantId, clientId }) {
      return new SignJWT({ grant_id: grantId, client_id: clientId })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer(issuer)
        .setAudience(MCP_AUDIENCE)
        .setSubject(userId)
        .setExpirationTime(MCP_ACCESS_TTL)
        .sign(secretMcp);
    },

    async verifyMcpAccess(token) {
      const { payload } = await jwtVerify(token, secretMcp, {
        audience: MCP_AUDIENCE,
        issuer,
      }).catch(() => {
        throw new TokenError("jeton d'accès invalide ou expiré");
      });

      const { sub, grant_id: grantId, client_id: clientId } = payload;
      if (typeof sub !== 'string' || typeof grantId !== 'string' || typeof clientId !== 'string') {
        throw new TokenError("jeton d'accès incomplet");
      }
      return { userId: sub, grantId, clientId };
    },

    /**
     * Le jeton avec lequel le serveur agit AU NOM de l'utilisateur. Les policies
     * RLS existantes s'appliquent telles quelles : aucune règle d'isolation n'est
     * réécrite en TypeScript, donc aucune ne peut diverger de la base.
     */
    async signSupabaseUser(userId) {
      return signSupabase({}, 'authenticated', userId);
    },

    /**
     * Le jeton `service_role`, dont l'usage est volontairement étroit : lire
     * `oauth_clients` et `oauth_grants`, invisibles sous RLS. Il ne touche jamais
     * une donnée métier — celles-là passent toujours par le jeton utilisateur.
     */
    async signSupabaseService() {
      return signSupabase({}, 'service_role');
    },

    /**
     * Vérifie le JWT que l'application web présente sur `/authorize/decision`.
     * C'est le seul endroit où le serveur fait confiance à un jeton qu'il n'a pas
     * signé lui-même — d'où le contrôle explicite du rôle : un `service_role`
     * égaré ne doit pas pouvoir se faire passer pour un utilisateur.
     */
    async verifySupabaseUser(token) {
      const { payload } = await jwtVerify(token, secretSupabase, {
        audience: SUPABASE_AUDIENCE,
      }).catch(() => {
        throw new TokenError('session invalide ou expirée');
      });

      if (payload.role !== 'authenticated') throw new TokenError('rôle inattendu');
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new TokenError('session sans utilisateur');
      }
      return payload.sub;
    },
  };
}
