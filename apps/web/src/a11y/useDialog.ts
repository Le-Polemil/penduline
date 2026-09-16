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
 *
 * ⚠️ `Tab` EST CONFINÉ AU PANNEAU (#92). Il ne l'était pas : corbeille ouverte,
 * **cent éléments focusables restaient atteignables derrière elle**, et le fond ne
 * portait ni `inert` ni `aria-hidden`. Concrètement, on tabulait jusqu'au dernier
 * bouton du panneau, on appuyait encore, et l'anneau de focus DISPARAISSAIT — il
 * n'était pas perdu, il était sur une carte, sous une surface opaque. `Entrée` y
 * agissait à l'aveugle.
 *
 * Le pire cas était le lecteur d'écran : `aria-modal="true"` lui promettait un
 * contenu clos pendant que `Tab` l'en faisait sortir. La promesse et le
 * comportement se contredisaient.
 *
 * Le confinement vit ICI plutôt que dans chaque surface parce que ce hook est leur
 * point de passage unique : une implémentation couvre les trois, et toute modale
 * future hérite du contrat complet sans avoir à le savoir.
 */
/**
 * Ce qui peut recevoir le focus au clavier, dans l'ordre du document.
 *
 * `offsetParent` écarte ce qui est masqué (`display: none`), qu'un sélecteur seul
 * ne distingue pas — un bouton caché resterait sinon dans la boucle, et `Tab` y
 * ferait un arrêt invisible.
 */
function focusables(racine: HTMLElement): HTMLElement[] {
  const sel =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...racine.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetParent !== null);
}

/** Boucle du dernier au premier, et l'inverse avec `Maj`. */
function confiner(e: ReactKeyboardEvent, panneau: HTMLElement | null) {
  if (!panneau) return;
  const liste = focusables(panneau);
  // Panneau sans aucun focusable : on garde le focus sur le panneau lui-même
  // (il porte `tabIndex: -1`) plutôt que de laisser `Tab` partir derrière.
  if (liste.length === 0) return e.preventDefault();
  const premier = liste[0];
  const dernier = liste[liste.length - 1];
  const actif = document.activeElement;
  if (e.shiftKey && (actif === premier || actif === panneau)) {
    e.preventDefault();
    dernier.focus();
  } else if (!e.shiftKey && actif === dernier) {
    e.preventDefault();
    premier.focus();
  }
}

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
      if (e.key === 'Escape') {
        // Sans arrêt, `Échap` remonterait aussi jusqu'à un dialogue parent.
        e.stopPropagation();
        return onClose();
      }
      if (e.key === 'Tab') return confiner(e, ref.current);
    },
    /** À étaler sur le panneau. `tabIndex` permet au panneau lui-même de recevoir le focus. */
    surface: { role: 'dialog', 'aria-modal': true, tabIndex: -1 } as const,
  };
}
