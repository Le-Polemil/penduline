import type { Env } from './env';
import type { Tokens } from './jwt';

/**
 * Le client PostgREST du serveur — `fetch` nu, sans `@supabase/supabase-js`.
 *
 * Le SDK est bâti pour un navigateur qui porte UNE session : il garde un client
 * par clé, rafraîchit des jetons, écoute le temps réel. Ici chaque requête part
 * avec un jeton fraîchement signé, valable 60 s, pour un utilisateur qui change
 * d'un appel à l'autre. Il n'y a donc rien à réutiliser d'un appel au suivant, et
 * `fetch` dit exactement ce qui part sur le fil.
 *
 * Kong exige l'en-tête `apikey` MÊME sur une requête déjà porteuse d'un JWT :
 * c'est lui qui route vers PostgREST, l'`Authorization` ne l'intéresse pas.
 */

/** ⚠️ `max_rows` de PostgREST : au-delà, il tronque SANS RIEN DIRE (#40). */
export const PAGE = 1000;

export class DbError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type Filtres = Record<string, string>;

export interface Rest {
  /** Une page au plus. Pour ce qui est borné par construction (un `id=eq.…`). */
  select<T>(table: string, filtres: Filtres): Promise<T[]>;
  /**
   * TOUTES les lignes, page par page.
   *
   * La pagination n'est pas une optimisation : sans elle, un compte dépassant
   * 1000 tâches en perdrait en silence, et l'agent répondrait sur une vue
   * amputée sans qu'aucune erreur ne le signale.
   */
  selectAll<T>(table: string, filtres: Filtres): Promise<T[]>;
  insert<T>(table: string, lignes: unknown[]): Promise<T[]>;
  update<T>(table: string, filtres: Filtres, patch: unknown): Promise<T[]>;
}

export interface Db {
  /** Agit AU NOM de l'utilisateur : les policies RLS s'appliquent telles quelles. */
  asUser(userId: string): Rest;
  /** Le seul usage légitime : `oauth_clients` et `oauth_grants`, invisibles sous RLS. */
  asService(): Rest;
}

export function createDb(env: Env, tokens: Tokens): Db {
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1`;

  function rest(jeton: () => Promise<string>): Rest {
    async function requete(
      methode: string,
      table: string,
      filtres: Filtres,
      corps?: unknown,
      prefer?: string,
    ): Promise<unknown> {
      const params = new URLSearchParams(filtres);
      const reponse = await fetch(`${base}/${table}?${params}`, {
        method: methode,
        headers: {
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${await jeton()}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(prefer ? { Prefer: prefer } : {}),
        },
        body: corps === undefined ? undefined : JSON.stringify(corps),
      });

      const texte = await reponse.text();
      if (!reponse.ok) {
        // Le message de PostgREST est repris tel quel : il nomme la contrainte
        // ou la policy qui a refusé, et c'est précisément ce qu'un agent a besoin
        // de lire pour corriger son appel plutôt que de le rejouer à l'identique.
        throw new DbError(reponse.status, texte || reponse.statusText);
      }
      return texte ? JSON.parse(texte) : [];
    }

    const select = async <T>(table: string, filtres: Filtres) =>
      (await requete('GET', table, filtres)) as T[];

    return {
      select,

      async selectAll<T>(table: string, filtres: Filtres) {
        const recues: T[] = [];
        for (let debut = 0; ; debut += PAGE) {
          const page = await select<T>(table, {
            ...filtres,
            limit: String(PAGE),
            offset: String(debut),
          });
          recues.push(...page);
          if (page.length < PAGE) return recues;
        }
      },

      async insert<T>(table: string, lignes: unknown[]) {
        return (await requete('POST', table, {}, lignes, 'return=representation')) as T[];
      },

      async update<T>(table: string, filtres: Filtres, patch: unknown) {
        return (await requete('PATCH', table, filtres, patch, 'return=representation')) as T[];
      },
    };
  }

  return {
    asUser: (userId) => rest(() => tokens.signSupabaseUser(userId)),
    asService: () => rest(() => tokens.signSupabaseService()),
  };
}
