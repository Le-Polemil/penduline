/**
 * Confirmation d'une action destructive. Partagée par l'accueil et la matrice,
 * qui proposent tous deux la suppression d'une matrice.
 */
export function Confirm({
  title,
  body,
  confirmLabel = 'Supprimer',
  onConfirm,
  onCancel,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
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
          <button className="confirm-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
