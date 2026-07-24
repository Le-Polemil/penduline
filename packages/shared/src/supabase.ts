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
}

export function createSupabase(config: SupabaseConfig): SupabaseClient {
  return createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storage: config.storage,
    },
  });
}
