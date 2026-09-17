import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * PKCE, méthode S256 (RFC 7636) — et elle seule.
 *
 * Ce que PKCE empêche : un code d'autorisation intercepté (dans un journal, dans
 * l'historique du navigateur, par une application locale qui écoute le même
 * port) ne vaut rien sans le `code_verifier`, que seul le client qui a lancé le
 * parcours connaît. C'est ce qui remplace le `client_secret` qu'un client public
 * ne peut pas garder.
 *
 * `plain` n'est pas implémenté, et ce n'est pas un oubli : il transmet le
 * vérifieur en clair au moment même où il faudrait le cacher.
 */

/** Le `code_challenge` correspondant à un vérifieur : base64url(sha256(verifier)). */
export function defi(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

/**
 * Compare en temps constant. Une comparaison naïve fuit, par sa durée, le nombre
 * de caractères devinés — c'est peu, mais ça se mesure, et la version sûre coûte
 * une ligne.
 */
export function verifiePkce(codeChallenge: string, codeVerifier: string | undefined): boolean {
  if (!codeVerifier) return false;
  // RFC 7636 §4.1 : 43 à 128 caractères. Un vérifieur trop court serait
  // devinable, et le contrôle ne peut pas vivre ailleurs qu'ici.
  if (codeVerifier.length < 43 || codeVerifier.length > 128) return false;

  const attendu = Buffer.from(codeChallenge);
  const calcule = Buffer.from(defi(codeVerifier));
  return attendu.length === calcule.length && timingSafeEqual(attendu, calcule);
}
