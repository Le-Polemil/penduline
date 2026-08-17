import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

/**
 * Annonces au lecteur d'écran.
 *
 * Un déplacement au clavier est **muet** : rien à l'écran ne change de place pour
 * qui ne voit pas la liste. Sans annonce, la fonction existe sans être utilisable.
 *
 * Une seule région pour toute l'application. Plusieurs régions `aria-live`
 * concurrentes sont mal gérées par les lecteurs d'écran — celle-ci vit donc à la
 * racine et tout le monde y écrit.
 */
const AnnounceContext = createContext<(message: string) => void>(() => {});

/** Fournit la région d'annonce, et la rend à la fin du document. */
export function AnnounceProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');

  const announce = useCallback((next: string) => {
    // Un lecteur d'écran ne relit pas un texte inchangé : deux déplacements
    // aboutissant au même message resteraient silencieux le second coup. On casse
    // l'égalité par une espace sans largeur, invisible et non prononcée.
    setMessage((prev) => (prev === next ? `${next}​` : next));
  }, []);

  return (
    <AnnounceContext.Provider value={announce}>
      {children}
      {/* `polite` : une annonce n'interrompt pas la lecture en cours.
          `atomic` : la phrase est relue en entier, pas seulement le mot qui a changé. */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {message}
      </div>
    </AnnounceContext.Provider>
  );
}

export function useAnnounce() {
  return useContext(AnnounceContext);
}

/** « 1ʳᵉ », « 2ᵉ », « 3ᵉ »… — l'abréviation change au premier rang. */
export function ordinal(n: number): string {
  return n === 1 ? '1ʳᵉ' : `${n}ᵉ`;
}
