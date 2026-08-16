import { useState, type CSSProperties } from 'react';
import { quadrant, type Task } from '@penduline/shared';

/**
 * La corbeille — terminées et supprimées, restauration et purge définitive.
 *
 * Extraite de l'écran matrice pour que la vue globale l'ouvre sur SA portée.
 * D'où `scope` plutôt que le nom d'une matrice : ce qu'elle montre n'est plus
 * forcément l'histoire d'une seule.
 */
export function BinModal({
  scope,
  doneList,
  delList,
  onClose,
  onRestore,
  onPurge,
}: {
  /** Ce que la corbeille recouvre : un nom de matrice, un univers, « toutes les matrices ». */
  scope: string;
  doneList: Task[];
  delList: Task[];
  onClose: () => void;
  onRestore: (id: string) => void;
  onPurge: (ids: string[]) => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmAll, setConfirmAll] = useState(false);
  /** Dernier item cliqué sans Maj : point d'ancrage des sélections par plage. */
  const [anchor, setAnchor] = useState<number | null>(null);

  // La plage Maj+clic court sur l'ordre visuel COMPLET, les deux sections
  // confondues : c'est ce qu'on attend en voyant la liste à l'écran.
  const all = [...doneList, ...delList];

  function select(index: number, shift: boolean) {
    setPicked((p) => {
      const n = new Set(p);
      // L'ancre peut désigner un index disparu après une purge : on la borne et
      // on saute les trous plutôt que d'insérer des `undefined` dans la sélection.
      if (shift && anchor !== null && anchor < all.length) {
        const [a, b] = anchor <= index ? [anchor, index] : [index, anchor];
        for (let k = a; k <= b; k++) if (all[k]) n.add(all[k].id);
        return n;
      }
      const id = all[index].id;
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    // L'ancre ne bouge pas sur Maj+clic : on peut étendre la plage plusieurs fois.
    if (!shift) setAnchor(index);
  }

  function section(title: string, cls: string, list: Task[], offset: number, empty: string, doneStyle: boolean) {
    return (
      <>
        <div className={`bin-section ${cls}`}>{title}</div>
        {list.length === 0 ? (
          <div className="bin-empty">{empty}</div>
        ) : (
          <div className="bin-list">
            {list.map((t, i) => {
              const q = quadrant(t.quadrant);
              // « À trier » n'a pas de fond propre (transparent) : on retombe sur
              // un neutre, sinon l'item n'aurait aucune couleur.
              const tint = q.bg === 'transparent' ? 'var(--color-neutral-200)' : q.bg;
              return (
              <div
                className={`bin-item${picked.has(t.id) ? ' bin-item--picked' : ''}`}
                key={t.id}
                style={{ background: tint }}
              >
                <input
                  type="checkbox"
                  className="bin-check"
                  checked={picked.has(t.id)}
                  onChange={() => {}}
                  onClick={(e) => select(offset + i, e.shiftKey)}
                  aria-label={`Sélectionner « ${t.title} »`}
                />
                <span className={`bin-item__title${doneStyle ? ' bin-item__title--done' : ''}`}>{t.title}</span>
                <button className="bin-restore" onClick={() => onRestore(t.id)}>
                  {doneStyle ? 'Rétablir' : 'Restaurer'}
                </button>
              </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="bin-backdrop" onClick={onClose}>
      <div className="bin-panel" style={{ viewTransitionName: 'bin' } as CSSProperties} onClick={(e) => e.stopPropagation()}>
        <div className="bin-head">
          <span className="bin-title">Corbeille ({scope})</span>
          <button className="bin-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {section('Terminées', 'bin-section--done', doneList, 0, "Rien de terminé pour l'instant.", true)}
        {section('Supprimées', 'bin-section--del', delList, doneList.length, 'Rien de supprimé.', false)}

        {all.length > 0 && (
          <div className="bin-foot">
            {picked.size > 0 ? (
              <>
                <button className="bin-purge" onClick={() => { onPurge([...picked]); setPicked(new Set()); setAnchor(null); }}>
                  Supprimer définitivement ({picked.size})
                </button>
                <button className="bin-foot__link" onClick={() => setPicked(new Set())}>
                  Tout désélectionner
                </button>
              </>
            ) : confirmAll ? (
              <>
                <span className="bin-foot__ask">Vider toute la corbeille ? C'est définitif.</span>
                <button className="bin-purge" onClick={() => { onPurge(all.map((t) => t.id)); setConfirmAll(false); setPicked(new Set()); setAnchor(null); }}>
                  Confirmer
                </button>
                <button className="bin-foot__link" onClick={() => setConfirmAll(false)}>
                  Annuler
                </button>
              </>
            ) : (
              <button className="bin-foot__link" onClick={() => setConfirmAll(true)}>
                Vider la corbeille ({all.length})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
