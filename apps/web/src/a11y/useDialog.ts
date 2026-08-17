import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';

/**
 * Le contrat clavier d'une surface modale : prendre le focus, se fermer sur
 * `Échap`, le rendre en partant.
 *
 * Les trois surfaces de l'application — confirmation, corbeille, feuille
 * d'actions — n'en avaient aucun. Ouvrir la corbeille au clavier laissait le
 * focus derrière, quelque part dans la page, et `Échap` ne fermait rien.
 *
 * Rendre le focus n'est pas un détail : sans lui, refermer un dialogue renvoie
 * au début du document, et il faut re-parcourir tout l'écran pour revenir là où
 * l'on était.
 */
export function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const origin = useRef<Element | null>(null);

  useEffect(() => {
    origin.current = document.activeElement;
    ref.current?.focus();
    return () => {
      const back = origin.current;
      // `isConnected` : l'élément d'origine peut avoir disparu avec l'action
      // qu'on vient de confirmer — supprimer une matrice retire son bouton.
      if (back instanceof HTMLElement && back.isConnected) back.focus();
    };
  }, []);

  return {
    ref,
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Sans arrêt, `Échap` remonterait aussi jusqu'à un dialogue parent.
      e.stopPropagation();
      onClose();
    },
    /** À étaler sur le panneau. `tabIndex` permet au panneau lui-même de recevoir le focus. */
    surface: { role: 'dialog', 'aria-modal': true, tabIndex: -1 } as const,
  };
}
