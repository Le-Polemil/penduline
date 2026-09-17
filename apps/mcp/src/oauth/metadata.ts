import type { Env } from '../env';

/**
 * Les deux documents de découverte, servis tels quels.
 *
 * Un client MCP ne se configure pas : on lui donne une URL, il lit
 * `/.well-known/oauth-protected-resource` pour savoir QUI délivre les jetons,
 * puis `/.well-known/oauth-authorization-server` pour savoir OÙ. Ces deux
 * fichiers sont donc toute la configuration côté utilisateur — d'où le refus du
 * jeton personnel collé à la main, qui aurait demandé l'inverse.
 *
 * Ici les deux rôles — serveur d'autorisation et ressource protégée — sont tenus
 * par le même processus. La spécification l'autorise, et c'est le cas simple.
 */

const SCOPE = 'penduline';

export function metadonneesServeur(env: Env) {
  const base = env.MCP_PUBLIC_URL.replace(/\/$/, '');
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    scopes_supported: [SCOPE],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // S256 SEULEMENT. `plain` est encore dans la RFC mais ne protège de rien :
    // un `code_verifier` transmis en clair est exactement ce que PKCE existe
    // pour éviter. OAuth 2.1 l'a d'ailleurs retiré.
    code_challenge_methods_supported: ['S256'],
    // Clients publics : aucun secret à distribuer, donc aucun secret à fuiter.
    // C'est PKCE qui lie le code à celui qui l'a demandé, pas un mot de passe
    // d'application que chaque installation recopierait.
    token_endpoint_auth_methods_supported: ['none'],
  };
}

export function metadonneesRessource(env: Env) {
  const base = env.MCP_PUBLIC_URL.replace(/\/$/, '');
  return {
    resource: base,
    authorization_servers: [base],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ['header'],
  };
}
