/**
 * Le contrat du canal app web → extension.
 *
 * POURQUOI CE CANAL EXISTE. L'extension range sa session dans
 * `chrome.storage.local`, l'app web dans le `localStorage` de son origine : deux
 * stockages étanches, donc deux connexions à faire à la main. Ce module porte le
 * message qui évite la seconde — l'app web pousse sa session, l'extension la
 * reprend telle quelle.
 *
 * POURQUOI IL VIT DANS `shared`. Les deux bouts doivent s'accorder sur la forme
 * exacte du message, et un désaccord serait silencieux : `chrome.runtime`
 * transporte n'importe quel JSON sans rien valider. Le type et le garde vivent
 * donc au même endroit, et le garde est testé.
 *
 * ⚠️ CE MESSAGE TRANSPORTE UN REFRESH TOKEN. Trois protections, aucune
 * facultative :
 *
 * 1. `externally_connectable.matches` du manifeste : seules les origines listées
 *    voient `chrome.runtime` et peuvent émettre. C'est la barrière principale.
 * 2. Le récepteur revérifie `sender.origin` (voir `background.ts`) — le
 *    manifeste peut dériver, la vérification explicite non.
 * 3. L'émetteur cible un ID d'extension précis, et non « toutes les extensions ».
 *
 * Le canal est délibérément UNIDIRECTIONNEL : l'extension ne renvoie jamais sa
 * session à l'app web. Rien n'en aurait besoin, et ce serait une surface de plus.
 */

/** Le nom du canal, préfixé : `chrome.runtime` est partagé avec tout le reste. */
export const BRIDGE_SIGNIN = 'penduline:session';
export const BRIDGE_SIGNOUT = 'penduline:signout';

/**
 * La session poussée, réduite à ce dont `setSession` a besoin.
 *
 * Surtout pas l'objet `Session` entier : il porte le profil utilisateur complet,
 * dont le récepteur n'a que faire, et un objet large invite à s'en servir comme
 * d'une source de vérité alors qu'il est déjà périmé à l'arrivée.
 */
export interface BridgeSignIn {
  type: typeof BRIDGE_SIGNIN;
  access_token: string;
  refresh_token: string;
}

/**
 * La déconnexion, propagée elle aussi.
 *
 * Sans elle, l'extension garderait une session que le serveur vient de révoquer :
 * elle s'afficherait connectée et échouerait sur la première écriture. Le
 * `signOut` de l'app web est en portée globale (`App.tsx`), il révoque donc bien
 * les jetons de l'extension — c'est précisément ce qui rend le message nécessaire.
 */
export interface BridgeSignOut {
  type: typeof BRIDGE_SIGNOUT;
}

export type BridgeMessage = BridgeSignIn | BridgeSignOut;

/**
 * Valide un message reçu du monde extérieur.
 *
 * Écrit en défensif jusqu'au bout — `unknown` en entrée, chaque champ vérifié —
 * parce que l'appelant est une page web. Le typage TypeScript ne protège rien
 * ici : il décrit ce qu'on ESPÈRE recevoir, pas ce qui arrive.
 *
 * Les jetons sont vérifiés non vides et non pas seulement présents : `setSession`
 * accepte des chaînes vides sans broncher et détruit la session en place.
 */
export function parseBridgeMessage(raw: unknown): BridgeMessage | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const msg = raw as Record<string, unknown>;

  if (msg.type === BRIDGE_SIGNOUT) return { type: BRIDGE_SIGNOUT };

  if (msg.type === BRIDGE_SIGNIN) {
    const { access_token: access, refresh_token: refresh } = msg;
    if (typeof access !== 'string' || access === '') return null;
    if (typeof refresh !== 'string' || refresh === '') return null;
    return { type: BRIDGE_SIGNIN, access_token: access, refresh_token: refresh };
  }

  return null;
}
