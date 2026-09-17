import { useState } from 'react';
import { useDialog } from '../a11y/useDialog';
import { useAutorisations, type Autorisation } from '../data/useAutorisations';
import { Confirm } from './Confirm';

/**
 * « Applications connectées » — ce à quoi l'utilisateur a dit oui, et comment
 * le reprendre (#23).
 *
 * Bâtie sur `useDialog` et `.bin-backdrop`, comme la corbeille : aucune
 * chirurgie sur la navigation (`View`, `readView`, `sessionStorage` intacts),
 * et le contrat clavier complet — focus pris, `Échap`, `Tab` confiné, focus
 * rendu — vient avec le hook sans avoir à y penser.
 */

/** « il y a 3 jours », pour des dates qu'on lit sans vouloir les calculer. */
function depuis(iso: string | null): string {
  if (!iso) return 'jamais';
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return 'hier';
  if (jours < 31) return `il y a ${jours} jours`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

export function ConnectedApps({ onClose }: { onClose: () => void }) {
  const dialog = useDialog(onClose);
  const { liste, erreur, revoquer } = useAutorisations();
  const [aRevoquer, setARevoquer] = useState<Autorisation | null>(null);

  return (
    <div className="bin-backdrop" onClick={onClose}>
      <div
        className="bin-panel"
        {...dialog.surface}
        aria-label="Applications connectées"
        ref={dialog.ref}
        onKeyDown={dialog.onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bin-head">
          <span className="bin-title">Applications connectées</span>
          <button className="bin-close" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </div>

        {erreur && <p className="error">{erreur}</p>}

        {liste === null ? (
          <div className="bin-empty">Chargement…</div>
        ) : liste.length === 0 ? (
          <div className="bin-empty">
            Aucune application n’a accès à vos matrices. Elles se connectent par le protocole MCP,
            et vous les autorisez une par une.
          </div>
        ) : (
          <div className="bin-list">
            {liste.map((a) => (
              <div className="app-row" key={a.id}>
                <span className="app-row__nom">{a.client_name}</span>
                <span className="app-row__meta">
                  autorisée le {new Date(a.created_at).toLocaleDateString('fr-FR')} · dernier accès{' '}
                  {depuis(a.last_used_at)}
                </span>
                <button className="app-row__revoke" onClick={() => setARevoquer(a)}>
                  Révoquer
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {aRevoquer && (
        <Confirm
          title={`Révoquer ${aRevoquer.client_name} ?`}
          body="Elle perdra l’accès immédiatement, sans attendre l’expiration de son jeton. Les tâches qu’elle a créées restent en place."
          confirmLabel="Révoquer"
          onConfirm={() => {
            void revoquer(aRevoquer.id);
            setARevoquer(null);
          }}
          onCancel={() => setARevoquer(null)}
        />
      )}
    </div>
  );
}
