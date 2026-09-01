import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabase } from '@penduline/shared';
import { chromeStorage } from './storage';

// Mêmes valeurs publiques que le web, injectées au build depuis le `.env` racine
// (voir vite.config.ts → envDir). La session est persistée via chrome.storage.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** false quand le build n'a pas reçu les clés Supabase → écran de config. */
export const isConfigured = Boolean(url && anonKey);

// On ne construit le client que si configuré : `createClient(undefined, …)`
// lèverait « supabaseUrl is required » au chargement du panneau.
export const supabase: SupabaseClient = isConfigured
  ? createSupabase({ url: url!, anonKey: anonKey!, storage: chromeStorage })
  : (null as unknown as SupabaseClient);
