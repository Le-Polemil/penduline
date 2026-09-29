import { createSupabase } from '@penduline/shared';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants. Copie .env.example vers .env et renseigne-les.',
  );
}

// Web : persistance par défaut (localStorage), aucun adaptateur requis.
//
// ⚠️ Le battement de cœur passe par un Web Worker (`public/penduline-heartbeat.js`).
// Sans lui, un onglet laissé en arrière-plan voit ses minuteurs bridés : le
// battement cesse, le serveur ferme la connexion, et le client ne le détecte
// pas — l'abonnement se croit établi et ne délivre plus rien.
export const supabase = createSupabase({
  url,
  anonKey,
  heartbeatWorkerUrl: '/penduline-heartbeat.js',
});
