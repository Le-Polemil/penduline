import { randomUUID, randomBytes } from 'node:crypto';

/**
 * Les deux états transitoires du parcours d'autorisation, EN MÉMOIRE.
 *
 *   demande en attente   entre `/authorize` et le clic sur l'écran de consentement
 *   code d'autorisation  entre le retour vers le client et `/token`
 *
 * Les deux se comptent en secondes et ne survivent pas à un redémarrage — ce qui
 * est exactement ce qu'on veut : un redémarrage doit annuler les parcours en
 * cours, pas les ressusciter. Ce qui doit durer (l'autorisation elle-même, le
 * jeton de rafraîchissement) est en base.
 *
 * Limite assumée, documentée aussi pour le quota : **une seule instance**. Une
 * deuxième demanderait une table, et le parcours d'un utilisateur casserait s'il
 * changeait d'instance entre deux redirections.
 */

/** Dix minutes : le temps de lire un écran de consentement, pas davantage. */
const TTL_DEMANDE = 10 * 60 * 1000;
/**
 * Deux minutes. Le client échange son code immédiatement après la redirection ;
 * la fenêtre n'a pas à couvrir autre chose qu'un aller-retour réseau.
 */
const TTL_CODE = 2 * 60 * 1000;

export interface DemandeEnAttente {
  id: string;
  clientId: string;
  clientName: string;
  redirectUri: string;
  codeChallenge: string;
  state?: string;
  expireA: number;
}

export interface CodeAutorisation {
  code: string;
  userId: string;
  grantId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  expireA: number;
}

export interface Store {
  ouvrirDemande(d: Omit<DemandeEnAttente, 'id' | 'expireA'>): DemandeEnAttente;
  lireDemande(id: string): DemandeEnAttente | undefined;
  /** Lit ET retire : une demande décidée ne doit pas pouvoir l'être deux fois. */
  consommerDemande(id: string): DemandeEnAttente | undefined;
  emettreCode(c: Omit<CodeAutorisation, 'code' | 'expireA'>): CodeAutorisation;
  /** Lit ET retire : un code rejoué ne doit rien donner. */
  consommerCode(code: string): CodeAutorisation | undefined;
}

export function createStore(now: () => number = Date.now): Store {
  const demandes = new Map<string, DemandeEnAttente>();
  const codes = new Map<string, CodeAutorisation>();

  /** Balayage paresseux : les deux tables sont minuscules, et rien ne presse. */
  function purge() {
    const t = now();
    for (const [id, d] of demandes) if (d.expireA <= t) demandes.delete(id);
    for (const [c, code] of codes) if (code.expireA <= t) codes.delete(c);
  }

  function consommer<T extends { expireA: number }>(
    table: Map<string, T>,
    cle: string,
  ): T | undefined {
    const valeur = table.get(cle);
    if (!valeur) return undefined;
    table.delete(cle);
    // Expiré = inexistant. Le retirer d'abord évite qu'un appelant distrait le
    // retrouve au coup d'après.
    return valeur.expireA > now() ? valeur : undefined;
  }

  return {
    ouvrirDemande(d) {
      purge();
      const demande = { ...d, id: randomUUID(), expireA: now() + TTL_DEMANDE };
      demandes.set(demande.id, demande);
      return demande;
    },

    lireDemande(id) {
      const demande = demandes.get(id);
      return demande && demande.expireA > now() ? demande : undefined;
    },

    consommerDemande: (id) => consommer(demandes, id),

    emettreCode(c) {
      purge();
      // 32 octets : hors de portée d'une énumération, et le code ne vit que deux
      // minutes de toute façon.
      const code = randomBytes(32).toString('base64url');
      const emis = { ...c, code, expireA: now() + TTL_CODE };
      codes.set(code, emis);
      return emis;
    },

    consommerCode: (code) => consommer(codes, code),
  };
}
