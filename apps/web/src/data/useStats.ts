import { useEffect, useState } from 'react';
import {
  parseCompletionStats,
  periodStart,
  type CompletionStats,
  type StatsPeriod,
} from '@penduline/shared';
import { supabase } from '../lib/supabase';

/**
 * Le fuseau de l'utilisateur, pour que les semaines soient les siennes.
 *
 * ⚠️ Ce n'est pas un raffinement. `date_trunc('week', …)` travaille dans le
 * fuseau de la session Postgres, qui est UTC : une tâche terminée le lundi à
 * 1 h du matin à Paris tombait dans la semaine PRÉCÉDENTE. Mesuré, pas supposé
 * (voir le commentaire de `completion_stats`).
 *
 * `Intl` rend toujours un identifiant IANA valide ; la fonction SQL retombe de
 * toute façon sur UTC si elle ne le connaît pas.
 */
function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Les statistiques rétrospectives d'une période (#48).
 *
 * Entièrement côté serveur, et ce n'est pas un choix : depuis #40 le client ne
 * charge que les tâches OUVERTES, or ce ticket ne parle que de tâches terminées.
 * Il n'y a rien à calculer en mémoire.
 *
 * `failed` est distingué de « zéro », comme `useReview` l'a établi en #47 :
 * afficher des statistiques à zéro quand la requête a échoué dirait « vous
 * n'avez rien terminé », ce qui est un mensonge, là où « indisponible » est une
 * information.
 */
export function useStats(period: StatsPeriod) {
  const [stats, setStats] = useState<CompletionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let vivant = true;
    setLoading(true);

    void supabase
      .rpc('completion_stats', { since: periodStart(period), tz: timeZone() })
      .then(({ data, error }) => {
        // Un écran démonté ne doit pas écrire dans un état disparu. Couvre aussi
        // la réponse lente d'une période qu'on a déjà quittée : sans ce garde,
        // elle écraserait celle de la période affichée.
        if (!vivant) return;
        if (error) {
          console.error('[penduline] completion_stats', error.message);
          setStats(null);
          setFailed(true);
        } else {
          // La forme du `jsonb` n'est pas garantie par le typage : `parse` la
          // valide champ par champ plutôt que de faire confiance à un cast.
          setStats(parseCompletionStats(data));
          setFailed(false);
        }
        setLoading(false);
      });

    return () => {
      vivant = false;
    };
  }, [period]);

  return { stats, loading, failed };
}
