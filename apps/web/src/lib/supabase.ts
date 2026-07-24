import { createSupabase } from '@penduline/shared';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY manquants. Copie .env.example vers .env et renseigne-les.',
  );
}

// Web : persistance par défaut (localStorage), aucun adaptateur requis.
export const supabase = createSupabase({ url, anonKey });
