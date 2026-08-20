/**
 * Classification des échecs d'écriture.
 *
 * Toutes les écritures de Penduline sont optimistes : l'état local change
 * d'abord, la persistance suit. Quand la persistance échoue, l'interface doit
 * dire quoi, pourquoi, et si le geste peut être rejoué — ce dernier point
 * surtout : proposer « Réessayer » sur un refus RLS ferait tourner
 * l'utilisateur en rond.
 *
 * La logique vit ici, hors de React et hors du store, parce qu'elle est pure et
 * partagée par le web et l'extension.
 */

export type WriteFailureKind =
  /** Requête jamais partie : réseau coupé, DNS, serveur injoignable. */
  | 'offline'
  /** Jeton invalide ou expiré : il faut se reconnecter. */
  | 'session'
  /** Le serveur a compris et refusé — policy RLS. Un bug, pas une manœuvre utilisateur. */
  | 'denied'
  /** Tout le reste : contrainte violée, 5xx, cas non prévu. */
  | 'unknown';

export interface WriteFailure {
  kind: WriteFailureKind;
  /** Message prêt à afficher, à la deuxième personne. */
  message: string;
  /** Rejouer le geste à l'identique a-t-il une chance d'aboutir ? */
  retryable: boolean;
}

/**
 * Forme minimale de l'erreur PostgREST dont on a besoin. On ne dépend pas du
 * type `PostgrestError` : `classifyWriteFailure` doit rester appelable depuis un
 * test avec un objet littéral.
 */
export interface WriteErrorLike {
  code?: string | null;
  message?: string;
}

/**
 * Décide ce qu'on montre à l'utilisateur après un échec d'écriture.
 *
 * Les repères de classification sont ceux de `postgrest-js` (2.110.8) :
 * une panne réseau y est convertie en `status: 0` avec un `code` vide, un JWT
 * refusé remonte en `401` avec un code `PGRST3xx`, un refus de policy en `403`
 * avec le `42501` de PostgreSQL.
 *
 * @param label Le geste, nommé comme le produit le nomme : « Renommer la matrice ».
 */
export function classifyWriteFailure(
  error: WriteErrorLike | null,
  status: number,
  label: string,
): WriteFailure {
  // L'ordre compte : un échec réseau porte parfois un `status` à 0 *et* un
  // message trompeur. Le statut tranche avant le code.
  if (status === 0) {
    return {
      kind: 'offline',
      message: `« ${label} » n'a pas pu être enregistré : connexion perdue.`,
      retryable: true,
    };
  }

  if (status === 401 || error?.code?.startsWith('PGRST3')) {
    return {
      kind: 'session',
      message: 'Votre session a expiré. Reconnectez-vous pour continuer.',
      retryable: false,
    };
  }

  if (status === 403 || error?.code === '42501') {
    return {
      kind: 'denied',
      // Pas de « Réessayer » ici, et pas d'explication technique : l'utilisateur
      // ne peut rien y faire, et le détail est déjà dans la console.
      message: `« ${label} » a été refusé par le serveur.`,
      retryable: false,
    };
  }

  return {
    kind: 'unknown',
    message: `« ${label} » n'a pas pu être enregistré.`,
    retryable: true,
  };
}
