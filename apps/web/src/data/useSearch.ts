import { useEffect, useState } from 'react';
import type { Task } from '@penduline/shared';
import { supabase } from '../lib/supabase';

/** Le temps qu'on laisse à la frappe avant d'interroger le serveur. */
const DEBOUNCE_MS = 250;

/**
 * Recherche sur le titre, toutes matrices confondues.
 *
 * Côté serveur, et ce n'est pas un choix : depuis #40 le client ne charge plus
 * que les tâches ouvertes. Chercher en mémoire ne trouverait donc ni les
 * terminées ni les supprimées — or retrouver une tâche supprimée est justement
 * un cas d'usage du ticket.
 *
 * La fonction `search_tasks` porte l'insensibilité aux accents (`unaccent`), que
 * la syntaxe de filtre de PostgREST ne permet pas d'exprimer.
 */
export function useSearch(query: string) {
  const [results, setResults] = useState<Task[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setBusy(false);
      return;
    }
    setBusy(true);

    // `vivant` couvre DEUX cas d'un coup : la frappe qui continue (le minuteur
    // est annulé) et la réponse qui arrive après qu'on a changé de requête.
    // Sans le second, une réponse lente écraserait une réponse rapide et la
    // liste ne correspondrait plus à ce qui est affiché dans le champ.
    let vivant = true;
    const t = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc('search_tasks', { q });
      if (!vivant) return;
      if (error) {
        // Silencieux à dessein : une recherche qui échoue ne doit pas
        // interrompre le travail en cours. L'absence de résultat le dit assez.
        setResults([]);
      } else {
        setResults((data as Task[] | null) ?? []);
      }
      setBusy(false);
    }, DEBOUNCE_MS);

    return () => {
      vivant = false;
      window.clearTimeout(t);
    };
  }, [query]);

  return { results, busy };
}
