/**
 * Le peu que l'application web a besoin de savoir du serveur MCP (#23).
 *
 * Elle ne parle jamais MCP : elle tient seulement l'écran de consentement que
 * le serveur ne peut pas afficher lui-même — il n'a ni session de navigateur,
 * ni page de connexion, et lui en fabriquer une reviendrait à demander le mot
 * de passe Penduline sur un second domaine.
 */

/**
 * ⚠️ Variable de BUILD : Vite l'inline dans le bundle. La poser à l'exécution
 * n'a aucun effet, et changer d'URL impose un rebuild — le même piège que
 * `VITE_EXTENSION_ID`, oublié une fois déjà (`work/coolify-deploy.md`).
 *
 * Absente, on ne lève pas : l'écran le dit franchement. Une exception ici
 * casserait l'application entière pour une fonctionnalité que l'immense
 * majorité des chargements n'utilise pas.
 */
export const MCP_URL: string | undefined = import.meta.env.VITE_MCP_URL;

/** Le chemin de l'écran de consentement, vers lequel le serveur MCP redirige. */
export const AUTHORIZE_PATH = '/autoriser';

export interface DemandeAutorisation {
  client_name: string;
  /** L'hôte seul : « ce code part vers claude.ai ». Le chemin n'apprendrait rien. */
  redirect_host: string;
  expire_a: string;
}

/**
 * L'identifiant de demande porté par l'URL, ou `null`.
 *
 * ⚠️ Volontairement PURE, comme `readAuthHash` et `readView` : elle sert
 * d'initialiseur à `useState`, que StrictMode invoque deux fois en
 * développement. Elle prend sa source en paramètre pour être vérifiable sans
 * navigateur — les tests de ce dépôt tournent en environnement `node`.
 */
export function readAuthorizeRequest(
  loc: { pathname: string; search: string } = window.location,
): string | null {
  if (loc.pathname !== AUTHORIZE_PATH) return null;
  const demande = new URLSearchParams(loc.search).get('demande');
  // Une demande vide n'est pas une demande : sans ça, `/autoriser?demande=`
  // afficherait un écran de consentement qui ne peut mener nulle part.
  return demande && demande.length > 0 ? demande : null;
}

export class McpIndisponible extends Error {}

function base(): string {
  if (!MCP_URL) {
    throw new McpIndisponible(
      "L'adresse du serveur MCP n'est pas configurée (VITE_MCP_URL). Cette installation ne peut pas autoriser d'application.",
    );
  }
  return MCP_URL.replace(/\/$/, '');
}

export async function lireDemande(demande: string): Promise<DemandeAutorisation> {
  const r = await fetch(`${base()}/authorize/request?demande=${encodeURIComponent(demande)}`);
  if (!r.ok) {
    throw new Error(
      'Cette demande d’autorisation est inconnue ou a expiré. Relancez la connexion depuis l’application.',
    );
  }
  return (await r.json()) as DemandeAutorisation;
}

/**
 * Transmet la décision, avec le jeton de la session en cours — c'est lui, et
 * lui seul, qui dit au serveur QUI autorise.
 *
 * Rend l'URL vers laquelle renvoyer le client, refus compris : un refus est une
 * réponse, et le client doit l'apprendre plutôt que de rester en attente.
 */
export async function repondreDemande(
  demande: string,
  autorise: boolean,
  jeton: string,
): Promise<string> {
  const r = await fetch(`${base()}/authorize/decision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jeton}` },
    body: JSON.stringify({ demande, autorise }),
  });
  if (!r.ok) throw new Error("La décision n'a pas pu être transmise. Réessayez.");
  const { redirect_to } = (await r.json()) as { redirect_to: string };
  return redirect_to;
}
