import { useEffect, useState } from 'react';

const TICK_MS = 60_000;

/**
 * L'heure courante, rafraîchie toute seule (#19).
 *
 * Copie DÉLIBÉRÉE de `apps/web/src/data/useNow.ts`, et non une mise en commun :
 * `packages/shared` ne dépend pas de React, et l'y faire entrer pour douze
 * lignes ferait payer une dépendance à tout ce qui l'importe. C'est la même
 * position que pour `usePersist`, dont le commentaire d'en-tête explique que les
 * deux hôtes ne partagent que `classifyWriteFailure`.
 *
 * Le popup est bref, mais il n'est pas éphémère : on peut le laisser ouvert le
 * temps de ranger trois tâches, et une échéance qui tombe pendant ce temps doit
 * virer au rouge.
 *
 * ⚠️ Affichage seul. Ce minuteur n'écrit rien.
 */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, TICK_MS);
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
