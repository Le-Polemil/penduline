import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Fabrique un client Supabase. Utilisée par le web (persistance localStorage,
 * défaut) ET par l'extension (persistance chrome.storage via un adaptateur).
 *
 * Les clés URL + anon sont publiques : la sécurité repose sur les policies RLS.
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
  /** Adaptateur de stockage de session (par défaut : localStorage du navigateur). */
  storage?: {
    getItem: (key: string) => string | null | Promise<string | null>;
    setItem: (key: string, value: string) => void | Promise<void>;
    removeItem: (key: string) => void | Promise<void>;
  };
  /**
   * URL du script de battement de cœur, exécuté dans un Web Worker.
   *
   * ⚠️ **Sans lui, le temps réel meurt en silence dans un onglet ou un panneau
   * laissé en arrière-plan.** Le battement de supabase-js tourne sinon sur un
   * `setInterval` de la page, que le navigateur bride ; il s'espace, cesse, le
   * serveur ferme la connexion — et le client ne le détecte pas, puisque c'est
   * ce même minuteur qui devait le détecter. L'abonnement se croit alors établi
   * et ne délivre plus rien, indéfiniment.
   *
   * Un worker n'est pas bridé de la même façon : le battement continue, la
   * coupure est vue, et la bibliothèque se reconnecte d'elle-même.
   *
   * Une URL EXPLICITE, et non le worker `blob:` que supabase-js sait fabriquer
   * seul : dans une extension MV3, `blob:` relève de `script-src`, qui vaut
   * `'self'`, et le comportement a varié selon les versions de Chrome. Un
   * fichier de même origine ne pose la question nulle part.
   *
   * Absente, on ne déclare aucun worker — le comportement d'avant, pour un
   * appelant qui n'en sert pas (les tests, par exemple).
   */
  heartbeatWorkerUrl?: string;
}

export function createSupabase(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: config.storage,
    },
    realtime: config.heartbeatWorkerUrl
      ? { worker: true, workerUrl: config.heartbeatWorkerUrl }
      : undefined,
  });
}
