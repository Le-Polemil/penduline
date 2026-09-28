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
// ⚠️ Le battement de cœur passe par un Web Worker (`public/penduline-heartbeat.js`),
// et le panneau y est PLUS exposé que le web : il reste ouvert des heures sur un
// poste au repos. Sans worker, ses minuteurs sont bridés, le battement cesse, le
// serveur ferme la connexion — et le panneau continue d'afficher un état figé en
// se croyant à jour. C'était le bug du 28 septembre.
//
// `chrome.runtime.getURL` plutôt qu'un chemin relatif : le worker est alors
// désigné par une URL `chrome-extension://` explicite, de même origine que la
// page, donc autorisée par le `script-src 'self'` de MV3.
//
// Repli sur un chemin relatif quand les API chrome ne sont pas là — même garde
// et même raison que `chromeStorage` : le panneau s'ouvre aussi dans un onglet
// normal pour l'aperçu, et un `chrome.runtime` absent ferait tomber le module
// entier au chargement.
const heartbeatWorkerUrl =
  typeof chrome !== 'undefined' && chrome.runtime?.getURL
    ? chrome.runtime.getURL('penduline-heartbeat.js')
    : '/penduline-heartbeat.js';

export const supabase: SupabaseClient = isConfigured
  ? createSupabase({ url: url!, anonKey: anonKey!, storage: chromeStorage, heartbeatWorkerUrl })
  : (null as unknown as SupabaseClient);
