import { useEffect, useState } from 'react';

/**
 * Un intervalle d'une minute suffit : le badge d'échéance ne dit jamais mieux
 * que la minute (« dans 3 h », « demain »). Un tick plus rapide réveillerait
 * l'application pour redessiner exactement la même chose.
 */
const TICK_MS = 60_000;

/**
 * L'heure courante, qui se rafraîchit toute seule (#19).
 *
 * Le statut d'une échéance est DÉRIVÉ de `due_at` et de maintenant. Sans ce
 * crochet, il resterait figé à l'heure du dernier rendu : une matrice ouverte
 * depuis le matin afficherait encore « dans 2 h » à midi passé. C'est le critère
 * « le statut se recalcule sans rechargement ».
 *
 * ⚠️ **Affichage seul. Ce minuteur n'écrit rien.** `useCompletion` ouvre sur une
 * mise en garde de vingt lignes à ce sujet : le délai d'annulation de #75 avait
 * été bâti sur un minuteur qui écrivait en base, et il ne survivait pas au
 * démontage de l'écran — une tâche pouvait rester cochée pour toujours. Ici,
 * rien n'est persisté : on relit l'horloge, la base ne bouge pas.
 *
 * Deux sources de réveil, et les deux sont nécessaires :
 *
 * - l'intervalle, pour l'onglet qu'on regarde ;
 * - `visibilitychange`, pour celui qu'on retrouve. Un onglet en arrière-plan est
 *   bridé par le navigateur, et un portable en veille ne reçoit aucun tick du
 *   tout : sans ce second réveil, revenir sur l'application après une nuit
 *   montrerait l'heure d'hier soir jusqu'au prochain tick.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, TICK_MS);
    // `visibilitychange` plutôt que `focus` : on veut le retour sur l'ONGLET,
    // pas le retour du curseur dans la fenêtre.
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return now;
}
