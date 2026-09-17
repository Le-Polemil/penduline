import type { Env } from './env';

/**
 * Quota par AUTORISATION, en fenêtre glissante.
 *
 * Par autorisation et non par utilisateur : deux applications d'un même
 * utilisateur ne doivent pas se gêner, et une application emballée ne doit pas
 * couper l'accès aux autres. Le grain de la limite est celui de la révocation —
 * c'est le même objet qu'on surveille et qu'on peut couper.
 *
 * Fenêtre GLISSANTE et non seau horaire : un seau se vide d'un coup au
 * changement d'heure, ce qui autorise deux fois la limite à cheval sur la
 * frontière. Garder les horodatages coûte quelques centaines d'entiers et
 * supprime le cas.
 *
 * ⚠️ Limite assumée, la même que pour `oauth/store.ts` : **une seule instance**.
 * Le compteur vit en mémoire ; une seconde instance doublerait la limite
 * effective. En sortir demanderait un compteur en base, donc une écriture de
 * plus par appel — un coût réel contre un besoin qui n'existe pas encore.
 */

const MINUTE = 60 * 1000;
const JOUR = 24 * 60 * 60 * 1000;

export class QuotaError extends Error {
  /** Secondes à attendre avant que la fenêtre se libère — l'en-tête `Retry-After`. */
  constructor(
    message: string,
    readonly retryAfter: number,
  ) {
    super(message);
  }
}

export interface Quota {
  /** Tout appel d'outil. Lève avant que la requête n'atteigne le transport. */
  verifieAppel(grantId: string): void;
  /** Les outils qui écrivent, EN PLUS du compteur d'appels. */
  verifieEcriture(grantId: string): void;
  /** Purge les autorisations qu'on n'a plus vues. Appelée au fil de l'eau. */
  oublie(grantId: string): void;
}

interface Compteurs {
  appels: number[];
  ecritures: number[];
}

export function createQuota(env: Env, now: () => number = Date.now): Quota {
  const par = new Map<string, Compteurs>();

  function fenetre(horodatages: number[], duree: number, limite: number, quoi: string) {
    const t = now();
    const debut = t - duree;
    // Les horodatages sont croissants : tout ce qui est sorti est en tête.
    let i = 0;
    while (i < horodatages.length && horodatages[i] <= debut) i++;
    if (i > 0) horodatages.splice(0, i);

    if (horodatages.length >= limite) {
      // Le plus ancien encore dans la fenêtre dit quand une place se libère.
      const attente = Math.ceil((horodatages[0] + duree - t) / 1000);
      throw new QuotaError(
        `Quota dépassé : ${limite} ${quoi}. Réessayez dans ${attente} s.`,
        Math.max(attente, 1),
      );
    }
    horodatages.push(t);
  }

  const compteurs = (grantId: string) => {
    let c = par.get(grantId);
    if (!c) par.set(grantId, (c = { appels: [], ecritures: [] }));
    return c;
  };

  return {
    verifieAppel(grantId) {
      fenetre(compteurs(grantId).appels, MINUTE, env.MCP_QUOTA_CALLS_PER_MINUTE, 'appels par minute');
    },

    verifieEcriture(grantId) {
      fenetre(compteurs(grantId).ecritures, JOUR, env.MCP_QUOTA_WRITES_PER_DAY, 'écritures par jour');
    },

    oublie(grantId) {
      par.delete(grantId);
    },
  };
}
