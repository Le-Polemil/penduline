import { useEffect, useState } from 'react';
import { periodDays, periodStart, type GoalFact, type StatsPeriod } from '@penduline/shared';
import { supabase } from '../lib/supabase';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Les faits par tâche finie dont « Objectifs » tire son barème (RPC `goal_stats`).
 *
 * Entièrement côté serveur, pour la même raison que la rétrospective : depuis #40
 * le client ne charge que les tâches OUVERTES, et le barème parle presque
 * entièrement de tâches finies. Les pénalités, elles, se calculent en mémoire —
 * ce sont justement les tâches ouvertes, et elles y sont toutes.
 *
 * **Deux fenêtres, deux appels.** La période affichée, et celle qui la précède
 * immédiatement, pour dire l'écart. Un seul appel qui rendrait les deux
 * demanderait à la fonction SQL de connaître la notion de « période
 * précédente » : c'est une décision d'écran, pas de base.
 *
 * `failed` est distingué de « zéro », comme `useReview` et `useStats` l'ont
 * établi : afficher un score nul quand la requête a échoué dirait « vous
 * utilisez mal la méthode », ce qui est un mensonge, là où « indisponible » est
 * une information.
 */
export function useGoals(period: StatsPeriod) {
  const [facts, setFacts] = useState<GoalFact[] | null>(null);
  /** `null` tant qu'on ne sait pas, et un tableau vide quand il n'y avait rien. */
  const [previous, setPrevious] = useState<GoalFact[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let vivant = true;
    setLoading(true);

    const now = Date.now();
    const debut = periodStart(period, now);
    const duree = periodDays(period) * DAY_MS;
    const debutPrecedent = new Date(Date.parse(debut) - duree).toISOString();

    void Promise.all([
      supabase.rpc('goal_stats', { since: debut }),
      supabase.rpc('goal_stats', { since: debutPrecedent, until: debut }),
    ]).then(([courant, precedent]) => {
      // Un écran démonté ne doit pas écrire dans un état disparu. Couvre aussi
      // la réponse lente d'une période qu'on a déjà quittée : sans ce garde,
      // elle écraserait celle de la période affichée.
      if (!vivant) return;
      if (courant.error) {
        console.error('[penduline] goal_stats', courant.error.message);
        setFacts(null);
        setFailed(true);
      } else {
        setFacts((courant.data as GoalFact[] | null) ?? []);
        setFailed(false);
      }
      // La période précédente n'est qu'une comparaison : son échec ne rend pas
      // l'écran indisponible, il retire la ligne de tendance.
      setPrevious(precedent.error ? null : ((precedent.data as GoalFact[] | null) ?? []));
      setLoading(false);
    });

    return () => {
      vivant = false;
    };
  }, [period]);

  return { facts, previous, loading, failed };
}
