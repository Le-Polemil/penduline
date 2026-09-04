import { useCallback, useEffect, useState } from 'react';
import { localDayBefore, type Task } from '@penduline/shared';
import { supabase } from '../lib/supabase';

/** Colonnes lues ici — le même jeu que le store, `focus_day` compris. */
const TASK_COLS =
  'id, user_id, board_id, title, quadrant, done, pinned, archived, deleted, position, pair_id, parent_id, created_at, updated_at, focus_day';

/**
 * La fenêtre chargée : aujourd'hui, plus de quoi bâtir le bilan de la dernière
 * sélection. Huit jours couvrent un week-end sauté et même un pont.
 */
const WINDOW_DAYS = 7;

/**
 * Les tâches d'une sélection récente, TERMINÉES COMPRISES (#49).
 *
 * ⚠️ POURQUOI UN CHARGEMENT À PART, ET NON `store.tasks`.
 *
 * Une tâche cochée sort de `store.tasks` — c'est `inWorkingSet` et #40. L'écran
 * afficherait alors « 2 tâches » au lieu de « 3 choisies, 1 faite », et perdrait
 * exactement le sentiment d'avancement qui le justifie.
 *
 * Et pourquoi pas une FUSION dans `store.tasks`, à la manière de `loadBin` : y
 * injecter des tâches terminées sans armer `binBoards` ferait cohabiter deux
 * sources pour le compteur de corbeille, qui additionnerait alors la mémoire et
 * le compte serveur — le défaut que `useBinCount` documente avoir déjà eu. Le
 * risque ne valait pas l'économie d'une requête.
 *
 * Volume borné par construction : huit jours fois la limite, soit une poignée de
 * lignes. Un simple filtre PostgREST suffit — pas de fonction, contrairement à
 * #45, #47 et #48.
 */
export function useFocus() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** Une valeur et non un booléen : deux appels de suite doivent produire deux requêtes. */
  const [tick, setTick] = useState(0);

  /**
   * À appeler après toute action qui touche la sélection ou l'état des tâches
   * choisies. Les autres écrans se mettent à jour par `store.tasks` ; celui-ci a
   * sa propre source, il faut donc la redemander.
   */
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    let vivant = true;
    setLoading(true);

    void supabase
      .from('tasks')
      .select(TASK_COLS)
      // Borne basse seulement : une `focus_day` dans le futur n'existe pas, le
      // client n'écrivant jamais que le jour courant.
      .gte('focus_day', localDayBefore(WINDOW_DAYS))
      .order('focus_day', { ascending: false })
      .then(({ data, error }) => {
        // Un écran démonté ne doit pas écrire dans un état disparu.
        if (!vivant) return;
        if (error) {
          console.error('[penduline] focus', error.message);
          setTasks([]);
          setFailed(true);
        } else {
          setTasks((data as Task[] | null) ?? []);
          setFailed(false);
        }
        setLoading(false);
      });

    return () => {
      vivant = false;
    };
  }, [tick]);

  return { tasks, loading, failed, refresh };
}
