import { useCallback, useEffect, useState } from 'react';
import type { BoardStat } from '@penduline/shared';
import { supabase } from '../lib/supabase';

/**
 * Les faits par matrice que la revue ne peut pas déduire de la mémoire (#47).
 *
 * Côté serveur, et ce n'est pas un choix : depuis #40 le client ne charge que
 * les tâches OUVERTES. Deux des cinq signaux demandent exactement l'inverse —
 * la dernière activité toutes tâches confondues, et l'état d'« Éliminer ».
 * Calculée en mémoire, une matrice dont tout vient d'être terminé passerait pour
 * dormante : l'exact contraire de la vérité.
 *
 * Même raisonnement que `useSearch`, et même forme.
 *
 * `review_boards()` ne prend aucun argument et ne rend que des faits : les
 * seuils sont appliqués par `reviewSignals` dans `packages/shared`, où ils sont
 * testés. Les dupliquer en SQL serait deux vérités à tenir à jour.
 */
export function useReview() {
  const [stats, setStats] = useState<BoardStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** Incrémenté pour redemander. Une valeur, pas un booléen : deux appels de
   *  suite doivent bien produire deux requêtes. */
  const [tick, setTick] = useState(0);

  /**
   * À appeler après une action qui change les faits serveur — déplacer une tâche
   * hors d'« Éliminer », par exemple. Les trois signaux calculés en mémoire se
   * mettent à jour tout seuls avec `store.tasks` ; ces deux-là non.
   */
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let vivant = true;
    setLoading(true);

    void supabase.rpc('review_boards').then(({ data, error }) => {
      // Un écran démonté ne doit pas écrire dans un état disparu.
      if (!vivant) return;
      if (error) {
        // On ne rend pas des faits inventés : `stats` reste vide, et l'écran
        // affiche que ces deux signaux sont indisponibles. Les afficher à zéro
        // dirait « tout va bien » alors qu'on ne sait rien — et un écran de
        // revue qui rassure à tort ne vaut pas mieux qu'un écran absent.
        console.error('[penduline] review_boards', error.message);
        setStats([]);
        setFailed(true);
      } else {
        setStats((data as BoardStat[] | null) ?? []);
        setFailed(false);
      }
      setLoading(false);
    });

    return () => {
      vivant = false;
    };
  }, [tick]);

  return { stats, loading, failed, refresh };
}
