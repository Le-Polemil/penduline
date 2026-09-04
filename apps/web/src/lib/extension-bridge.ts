import {
  BRIDGE_SIGNIN,
  BRIDGE_SIGNOUT,
  type BridgeMessage,
} from '@penduline/shared';

/**
 * Le bout émetteur du canal vers l'extension. Voir
 * `packages/shared/src/extension-bridge.ts` pour le contrat et les protections.
 *
 * Tout ici est en « au mieux » : l'app web ne dépend en rien de l'extension, et
 * l'échec d'un envoi ne doit jamais se voir. La connexion vient de réussir —
 * c'est le seul fait qui compte pour l'utilisateur devant l'écran.
 */

/**
 * L'ID de l'extension destinataire, injecté au build.
 *
 * Il n'y a pas de valeur par défaut possible : l'ID d'une extension chargée
 * localement est dérivé du CHEMIN du dossier, il diffère donc d'une machine à
 * l'autre et de celui du Store. Sans cette variable, le partage est simplement
 * inactif — d'où le `no-op` silencieux plutôt qu'une erreur au démarrage.
 */
const EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID as string | undefined;

/**
 * `chrome.runtime` n'est PAS exposé à toutes les pages : Chrome ne l'injecte que
 * si une extension installée déclare cette origine dans son
 * `externally_connectable`. Son absence est donc le cas NORMAL — navigateur non
 * Chromium, extension absente, ou origine hors du manifeste.
 */
type Runtime = { sendMessage?: (id: string, msg: unknown) => Promise<unknown> };

function runtime(): Runtime | null {
  const chrome = (globalThis as { chrome?: { runtime?: Runtime } }).chrome;
  return typeof chrome?.runtime?.sendMessage === 'function' ? chrome.runtime : null;
}

function send(message: BridgeMessage): void {
  if (!EXTENSION_ID) return;
  const rt = runtime();
  if (!rt?.sendMessage) return;

  // ⚠️ Le rejet doit être avalé des DEUX façons : `sendMessage` lève de façon
  // synchrone quand l'ID est inconnu, et rejette la promesse quand l'extension
  // ne répond pas (« Receiving end does not exist » — le cas courant, l'extension
  // n'ayant aucune raison d'accuser réception). Un rejet non traité remonterait
  // en erreur dans la console d'une app qui fonctionne parfaitement.
  try {
    void rt.sendMessage(EXTENSION_ID, message)?.catch(() => {});
  } catch {
    // Idem.
  }
}

/**
 * Pousse la session courante vers l'extension, qui s'y connecte sans rien demander.
 *
 * ⚠️ Les deux champs sont recopiés UN À UN, jamais par `...session`. L'appelant
 * passe l'objet `Session` d'auth-js, qui porte le profil utilisateur complet :
 * un spread enverrait tout ça sur le canal, alors que le récepteur n'a besoin
 * que des jetons — et n'en lit d'ailleurs pas d'autres.
 */
export function shareSession(session: {
  access_token: string;
  refresh_token: string;
}): void {
  send({
    type: BRIDGE_SIGNIN,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
}

/**
 * Propage la déconnexion.
 *
 * Le `signOut` de l'app web est en portée globale : il révoque aussi les jetons
 * de l'extension. Sans ce message, elle resterait affichée connectée avec une
 * session morte, jusqu'à ce qu'une écriture échoue.
 */
export function shareSignOut(): void {
  send({ type: BRIDGE_SIGNOUT });
}
