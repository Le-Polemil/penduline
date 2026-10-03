import { useCallback, useEffect, useState } from 'react';
import { HOME, pathToView, viewToPath, type View } from './route';

/** Les consignes d'arrivée d'une matrice : elles voyagent dans l'entrée d'historique, pas dans l'adresse. */
interface Arrival {
  focusTask?: string;
  openBin?: boolean;
}

function read(): View {
  const view = pathToView(window.location.pathname) ?? HOME;
  if (view.kind !== 'board') return view;
  const arrival = window.history.state as Arrival | null;
  return { ...view, focusTask: arrival?.focusTask, openBin: arrival?.openBin };
}

/**
 * La vue courante, tenue par l'adresse et l'historique du navigateur.
 *
 * `setView` ajoute une entrée d'historique (« Retour » revient à l'écran d'avant) ;
 * `replaceView` remplace l'entrée courante, pour les redirections subies : retomber
 * sur l'accueil quand une matrice a disparu ne doit pas laisser un « Retour » qui
 * ramène sur la matrice morte.
 */
export function useRoute(): [View, (view: View) => void, (view: View) => void] {
  const [view, setViewState] = useState<View>(read);

  useEffect(() => {
    const onPop = () => setViewState(read());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Une adresse inconnue affiche l'accueil : on la réécrit pour que l'adresse dise ce qu'on voit.
  useEffect(() => {
    const path = viewToPath(view);
    if (path !== window.location.pathname) window.history.replaceState(window.history.state, '', path);
    // Au montage seulement : les changements ultérieurs écrivent leur adresse eux-mêmes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const write = useCallback((next: View, mode: 'push' | 'replace') => {
    const path = viewToPath(next);
    const arrival: Arrival | null = next.kind === 'board' ? { focusTask: next.focusTask, openBin: next.openBin } : null;
    // Même adresse (un résultat de recherche sur la matrice déjà ouverte) : rien à empiler.
    const same = path === window.location.pathname;
    window.history[mode === 'replace' || same ? 'replaceState' : 'pushState'](arrival, '', path);
    setViewState(next);
  }, []);

  return [view, useCallback((next) => write(next, 'push'), [write]), useCallback((next) => write(next, 'replace'), [write])];
}
