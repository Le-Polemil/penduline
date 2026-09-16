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
  if (!doc.startViewTransition || mouvementReduit()) return fn();
  doc.startViewTransition(() => flushSync(fn));
}

/**
 * « Réduire les animations » est-il demandé ? (#91)
 *
 * ⚠️ POURQUOI CETTE GARDE VIT ICI ET PAS DANS LA FEUILLE DE STYLES. Le plancher
 * global posé en fin de `styles.css` couvre tout ce qui a une durée **dans le DOM
 * de l'application**. Une transition de vue, elle, s'anime sur des
 * pseudo-éléments `::view-transition-*` que le navigateur monte dans une couche à
 * part : le sélecteur universel de la feuille ne les atteint pas, et l'animation
 * de l'API se jouerait quand même. La même frontière doit donc être exprimée deux
 * fois — comme `useTelephone` et `usePointeurFin` le font déjà pour la largeur et
 * le pointeur.
 *
 * Relu à CHAQUE appel plutôt que mémorisé : la préférence peut changer en cours de
 * session, et il n'y a rien à économiser sur un `matchMedia` ponctuel.
 */
function mouvementReduit(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}
