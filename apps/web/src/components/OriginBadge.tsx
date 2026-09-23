import type { Origin } from '@penduline/shared';

/**
 * « agent » — cette ligne a été créée par une application connectée (#23).
 *
 * Sur le patron de `.due` : une pastille discrète, qui PORTE SON TEXTE. La
 * couleur seule n'informerait pas un daltonien, et c'est déjà la règle posée
 * pour les échéances (`styles.css`).
 *
 * Rien pour `'user'` : marquer ce qui vient de l'utilisateur reviendrait à
 * décorer 99 % des lignes pour signaler le 1 % restant.
 */
export function OriginBadge({ origin }: { origin: Origin }) {
  if (origin !== 'agent') return null;
  return (
    <span className="agent-badge" title="Créé par une application connectée">
      agent
    </span>
  );
}
