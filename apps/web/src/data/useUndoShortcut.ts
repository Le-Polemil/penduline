import { useEffect } from 'react';
import { useToast } from '../components/Toast';
import type { Store } from './store';

/**
 * `Ctrl+Z` / `Cmd+Z` pour annuler, avec `Maj` pour rétablir.
 *
 * ⚠️ **Inerte dans un champ de saisie.** `Ctrl+Z` y appartient au navigateur : le
 * détourner ferait perdre une frappe au lieu de défaire un geste — et c'est
 * exactement le moment où l'on s'y attend le moins.
 *
 * Le toast n'est pas décoratif : `Ctrl+Z` agit ailleurs que sous les yeux, et
 * sans lui l'annulation passerait inaperçue pour qui ne regardait pas la bonne
 * case.
 */
export function useUndoShortcut(store: Store) {
  const { show } = useToast();
  const { undo, redo, undoLabel, redoLabel } = store;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;

      const cible = e.target as HTMLElement | null;
      const saisie =
        cible?.tagName === 'INPUT' || cible?.tagName === 'TEXTAREA' || cible?.isContentEditable;
      if (saisie) return;

      e.preventDefault();
      if (e.shiftKey) {
        if (!redoLabel) return;
        redo();
        show({ key: 'undo', message: `Rétabli : ${redoLabel}`, durationMs: 2500 });
      } else {
        if (!undoLabel) return;
        undo();
        show({ key: 'undo', message: `Annulé : ${undoLabel}`, durationMs: 2500 });
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo, undoLabel, redoLabel, show]);
}
