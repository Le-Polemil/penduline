import type { BoardRole, Origin } from '@penduline/shared';

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

/**
 * « partagée » — cette matrice ne vous appartient pas, on vous y a donné accès (#53).
 *
 * Exactement le même patron qu'`OriginBadge` ci-dessus, et pour les deux mêmes
 * raisons : la pastille PORTE SON TEXTE (la couleur seule n'informe pas un
 * daltonien), et rien ne s'affiche dans le cas ordinaire — décorer 99 % des
 * lignes pour signaler le 1 % restant est l'erreur qu'on a déjà refusée une fois.
 */
export function SharedBadge({ role }: { role: BoardRole | null }) {
  if (role === null) return null;
  return (
    <span
      className="agent-badge"
      title={
        role === 'ecriture'
          ? 'Partagée avec vous — vous pouvez y écrire'
          : 'Partagée avec vous — en lecture seule'
      }
    >
      {role === 'ecriture' ? 'partagée' : 'lecture'}
    </span>
  );
}
