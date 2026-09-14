import { flushSync } from 'react-dom';

/**
 * Anime un changement structurel via l'API View Transitions (dégradation gracieuse).
 *
 * ⚠️ **`fn` n'est PAS appelée tout de suite.** `startViewTransition` prend d'abord
 * l'instantané de l'état d'avant, et n'exécute la mise à jour qu'ensuite. Un
 * appelant qui pose un drapeau avant l'appel et le retire après le verrait donc
 * déjà retiré quand `fn` s'exécute : ce qui doit encadrer la mise à jour va
 * DANS `fn`, pas autour de `withVT`.
 *
 * `flushSync` parce que l'API a besoin que le DOM d'après soit en place au retour
 * de la fonction : laissé à la planification normale de React, l'instantané
 * « après » serait pris sur le DOM d'avant, et rien ne bougerait.
 */
export function withVT(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (doc.startViewTransition) doc.startViewTransition(() => flushSync(fn));
  else fn();
}
