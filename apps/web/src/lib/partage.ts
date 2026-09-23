import type { BoardRole, InvitationLue } from '@penduline/shared';
import { supabase } from './supabase';

/**
 * Le peu que l'application a besoin de savoir d'un lien d'invitation (#53).
 *
 * Volontairement à côté de `lib/mcp.ts`, et bâti sur le même patron : un chemin
 * dédié, une lecture PURE de l'URL, et un écran rendu par `App` avant le reste.
 * Deux fonctionnalités qui entrent par l'URL doivent entrer de la même façon.
 */

/** Le chemin d'un lien d'invitation. */
export const INVITATION_PATH = '/invitation';

/**
 * Le jeton porté par l'URL, ou `null`.
 *
 * ⚠️ Volontairement PURE, comme `readAuthorizeRequest` et `readView` : elle sert
 * d'initialiseur à `useState`, que StrictMode invoque deux fois en
 * développement. Elle prend sa source en paramètre pour être vérifiable sans
 * navigateur — les tests de ce dépôt tournent en environnement `node`.
 */
export function readInvitation(
  loc: { pathname: string; search: string } = window.location,
): string | null {
  if (loc.pathname !== INVITATION_PATH) return null;
  const jeton = new URLSearchParams(loc.search).get('jeton');
  // Un jeton vide n'est pas un jeton : sans ça, `/invitation?jeton=` afficherait
  // un écran d'acceptation qui ne peut mener nulle part.
  return jeton && jeton.length > 0 ? jeton : null;
}

/** L'URL complète d'un lien, telle qu'on la donne à copier. */
export function lienInvitation(jeton: string): string {
  return `${window.location.origin}${INVITATION_PATH}?jeton=${encodeURIComponent(jeton)}`;
}

/**
 * Ce que l'écran d'acceptation affiche — rendu par le SERVEUR.
 *
 * ⚠️ **Jamais lu dans l'URL**, et c'est la règle qui gouverne déjà l'écran de
 * consentement MCP : un lien forgé afficherait sinon un nom de matrice
 * rassurant au-dessus du partage de quelqu'un d'autre.
 *
 * `null` couvre les trois cas — jeton inconnu, expiré, déjà consommé — sans les
 * distinguer. La base ne les distingue pas non plus : les séparer ferait de
 * l'écran un oracle permettant de tester des jetons au hasard.
 */
export async function lireInvitation(jeton: string): Promise<InvitationLue | null> {
  const { data, error } = await supabase.rpc('lire_invitation', { jeton });
  if (error) return null;
  const lignes = data as InvitationLue[] | null;
  return lignes?.[0] ?? null;
}

export class InvitationRefusee extends Error {}

/**
 * Consomme l'invitation et rend l'identifiant de la matrice rejointe.
 *
 * Lève `InvitationRefusee` plutôt que de rendre `null` : l'appelant DOIT dire
 * quelque chose à l'écran, et un `null` silencieux se laisse oublier.
 */
export async function accepterInvitation(jeton: string): Promise<string> {
  const { data, error } = await supabase.rpc('accepter_invitation', { jeton });
  if (error) throw new InvitationRefusee(error.message);
  return data as string;
}

/** Le rôle, écrit pour être lu. */
export function libelleRole(role: BoardRole | null): string {
  if (role === null) return 'propriétaire';
  return role === 'ecriture' ? 'écriture' : 'lecture';
}

/** Ce que le rôle permet, en une phrase. */
export function explicationRole(role: BoardRole): string {
  return role === 'ecriture'
    ? 'Ajouter, cocher et déplacer des tâches. Pas renommer ni supprimer la matrice.'
    : 'Voir la matrice et ses tâches, sans rien pouvoir y changer.';
}
