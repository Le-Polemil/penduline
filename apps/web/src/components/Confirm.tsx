/**
 * Confirmation d'une action. Partagée par l'accueil et la matrice.
 *
 * `tone` existe parce que toutes les confirmations ne sont pas destructives :
 * déplacer une paire d'une matrice à l'autre demande un avertissement, pas une
 * mise en garde — l'afficher en rouge ferait craindre une perte.
 */
export function Confirm({
  title,
  body,
  confirmLabel = 'Supprimer',
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: 'danger' | 'neutral';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="bin-backdrop" onClick={onCancel}>
      <div className="confirm-panel" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-title">{title}</p>
        <p className="confirm-body">{body}</p>
        <div className="confirm-actions">
          <button className="confirm-cancel" onClick={onCancel}>
            Annuler
          </button>
          <button className={tone === 'danger' ? 'confirm-danger' : 'confirm-go'} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
