import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Les messages du popup — en pratique : les échecs d'écriture.
 *
 * Même API que l'hôte du web (`apps/web/src/components/Toast.tsx`), en un seul
 * emplacement : le popup n'a pas de toast concurrent (cocher y archive tout de
 * suite, sans délai d'annulation), donc rien à empiler. Un nouveau message
 * remplace le précédent, ce qui déduplique au passage les deux écritures d'un
 * geste sur une paire.
 *
 * Non partagé avec le web : `@penduline/shared` ne dépend pas de React, et lui
 * imposer cette dépendance pour vingt lignes de JSX serait cher payé. Ce qui
 * devait être commun — la classification des échecs — l'est déjà.
 */

export interface ToastInput {
  message: string;
  tone?: 'neutral' | 'error';
  action?: { label: string; onClick: () => void };
  /** Absent = le message reste jusqu'à ce que l'utilisateur le referme. */
  durationMs?: number;
}

interface ToastApi {
  show: (input: ToastInput) => void;
  dismiss: () => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {}, dismiss: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [item, setItem] = useState<ToastInput | null>(null);
  const timer = useRef<number>();

  const dismiss = useCallback(() => {
    window.clearTimeout(timer.current);
    setItem(null);
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      window.clearTimeout(timer.current);
      setItem(input);
      if (input.durationMs !== undefined) {
        timer.current = window.setTimeout(() => setItem(null), input.durationMs);
      }
    },
    [],
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {item && (
        <div
          className={item.tone === 'error' ? 'toast toast--error' : 'toast'}
          role={item.tone === 'error' ? 'alert' : 'status'}
        >
          <span>{item.message}</span>
          {item.action && (
            <button
              className="toast__act"
              onClick={() => {
                // Refermer avant d'agir : « Réessayer » peut republier un toast.
                dismiss();
                item.action?.onClick();
              }}
            >
              {item.action.label}
            </button>
          )}
          {/* Un message qui ne part pas seul doit pouvoir être refermé : un refus
              de policy n'offre pas de « Réessayer ». */}
          {item.durationMs === undefined && (
            <button className="toast__close" aria-label="Fermer" onClick={dismiss}>
              ✕
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
