import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Les messages éphémères de l'application, dans un hôte unique.
 *
 * Avant, `Matrix` et `Global` rendaient chacun leur `<div className="toast">`
 * pour l'annulation d'une tâche cochée. Deux copies du même markup, et surtout
 * une place unique en bas de l'écran : le jour où un échec d'écriture doit être
 * signalé, il se superpose au toast d'annulation — or cocher une tâche
 * hors-ligne déclenche exactement les deux en même temps.
 *
 * D'où cet hôte, sur le modèle d'`AnnounceProvider` : il empile, et il
 * déduplique par clé.
 */

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  message: string;
  /** `error` colore et fait annoncer le message de façon assertive. */
  tone?: 'neutral' | 'error';
  action?: ToastAction;
  /** Absent = le toast reste jusqu'à ce que l'utilisateur le referme. */
  durationMs?: number;
  /**
   * Identité du toast. Un `show` sous une clé déjà présente **remplace** —
   * c'est ce qui évite deux messages identiques quand un geste sur une paire
   * produit deux écritures qui échouent ensemble, et ce qui permet à
   * `useCompletion` de republier son toast à chaque nouvelle tâche cochée.
   * Défaut : le message lui-même.
   */
  key?: string;
}

interface Toast extends ToastInput {
  key: string;
}

interface ToastApi {
  show: (input: ToastInput) => void;
  dismiss: (key: string) => void;
}

const NOOP: ToastApi = { show: () => {}, dismiss: () => {} };

const ToastContext = createContext<ToastApi>(NOOP);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  /** Les minuteurs d'auto-effacement, par clé. Hors du state : ils ne se rendent pas. */
  const timers = useRef(new Map<string, number>());

  const dismiss = useCallback((key: string) => {
    window.clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    setItems((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const key = input.key ?? input.message;
      // Retirer puis rajouter, et non remplacer en place : le toast republié
      // repart en bas de la pile, là où l'œil vient de le voir apparaître.
      setItems((prev) => [...prev.filter((t) => t.key !== key), { ...input, key }]);
      window.clearTimeout(timers.current.get(key));
      timers.current.delete(key);
      if (input.durationMs !== undefined) {
        timers.current.set(key, window.setTimeout(() => dismiss(key), input.durationMs));
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending.values()) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ show, dismiss }}>
      {children}
      {/* Le conteneur est monté en permanence, même vide : un lecteur d'écran
          restitue plus fiablement une insertion dans un nœud qui préexiste. */}
      <div className="toast-stack">
        {items.map((t) => (
          <div
            key={t.key}
            className={t.tone === 'error' ? 'toast toast--error' : 'toast'}
            // `alert` interrompt la lecture en cours : c'est voulu pour un échec,
            // qui vient de faire disparaître le geste de l'utilisateur.
            role={t.tone === 'error' ? 'alert' : 'status'}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                className="toast__undo"
                onClick={() => {
                  // Refermer avant d'agir : « Réessayer » peut réafficher un
                  // toast sous la même clé, et l'ordre inverse l'effacerait.
                  dismiss(t.key);
                  t.action?.onClick();
                }}
              >
                {t.action.label}
              </button>
            )}
            {/* Un toast qui ne part pas de lui-même doit pouvoir être refermé :
                un refus de policy n'offre pas de « Réessayer », il resterait
                sinon à l'écran indéfiniment. */}
            {t.durationMs === undefined && (
              <button className="toast__close" aria-label="Fermer" onClick={() => dismiss(t.key)}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  return useContext(ToastContext);
}
