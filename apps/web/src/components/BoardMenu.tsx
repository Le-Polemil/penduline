import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Board, Universe } from '@penduline/shared';
import { IconPenLine, IconTrash } from './Icons';

/**
 * Le menu `⋯` d'une matrice.
 *
 * Il remplace DEUX choses à la fois : les quatre boutons qui se dépliaient dans
 * la ligne au survol, et la feuille modale plein écran de l'appui long. Les
 * deux portaient le même jeu d'actions sous deux présentations — donc deux
 * rendus à tenir d'accord, et une modale pour choisir « Renommer ».
 *
 * Il reprend délibérément le vocabulaire du menu des tâches (`.task-menu`) :
 * même gabarit, mêmes séparateurs, même alignement à gauche. Deux menus qui font
 * la même chose doivent se ressembler.
 */
export function BoardMenu({
  board,
  boards,
  universes,
  grouped,
  onMove,
  onMoveUniverse,
  onRename,
  onDelete,
  onClose,
}: {
  board: Board;
  /** Les matrices du MÊME groupe : c'est parmi elles que l'ordre se joue. */
  boards: Board[];
  universes: Universe[];
  /** Sans aucun univers, la section « ranger » n'a rien à proposer. */
  grouped: boolean;
  onMove: (dir: -1 | 1) => void;
  onMoveUniverse: (universeId: string | null) => void;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /**
   * Le menu s'ouvre vers le HAUT quand il déborderait par le bas.
   *
   * Les dernières lignes de l'accueil n'ont plus la hauteur nécessaire sous
   * elles : le menu sortait de l'écran, et il fallait faire défiler pour
   * atteindre « Supprimer ». Mesuré à l'ouverture plutôt que deviné — la
   * hauteur du menu dépend du nombre d'univers.
   */
  const [versLeHaut, setVersLeHaut] = useState(false);

  // `useLayoutEffect` : la mesure doit précéder la peinture, sinon le menu
  // s'affiche une image en bas avant de sauter en haut.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const deborde = r.bottom > window.innerHeight - 8;
    // On ne remonte que s'il y a VRAIMENT la place au-dessus : sinon on
    // remplacerait un débordement par le bas par un débordement par le haut.
    const ligne = el.closest('.board-row')?.getBoundingClientRect();
    setVersLeHaut(deborde && !!ligne && ligne.top > r.height + 8);
  }, []);

  /**
   * Fermer au clic à côté et à Échap.
   *
   * `pointerdown` et non `click`, pour qu'il disparaisse dès l'appui — attendre
   * le relâchement le laisse visible pendant tout un glisser, or cette ligne est
   * précisément déplaçable.
   */
  useEffect(() => {
    function dehors(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) onClose();
    }
    function echap(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', dehors);
    document.addEventListener('keydown', echap);
    return () => {
      document.removeEventListener('pointerdown', dehors);
      document.removeEventListener('keydown', echap);
    };
  }, [onClose]);

  const premier = boards[0]?.id === board.id;
  const dernier = boards[boards.length - 1]?.id === board.id;

  return (
    <div
      className={`task-menu board-row-menu${versLeHaut ? ' board-row-menu--up' : ''}`}
      ref={ref}
      role="menu"
      aria-label={`Actions pour « ${board.name} »`}
    >
      {/* MÊME ORDRE QUE LE MENU D'UNE TÂCHE : ranger d'abord, puis ordonner,
          puis les gestes rares. Deux menus qui font la même chose doivent se
          lire de la même façon. */}
      {grouped && (
        <>
          <div className="task-menu__label">Ranger dans</div>
          {universes.map((u) => (
            <button
              key={u.id}
              className="task-menu__action"
              disabled={board.universe_id === u.id}
              onClick={() => onMoveUniverse(u.id)}
            >
              {u.name}
            </button>
          ))}
          {/* « Sans univers » plutôt que « Autre » : c'est le mot que l'accueil
              emploie déjà pour ce groupe, et le menu des tâches aussi. */}
          <button
            className="task-menu__action"
            disabled={board.universe_id === null}
            onClick={() => onMoveUniverse(null)}
          >
            Sans univers
          </button>
          {/* Le séparateur n'existe QUE s'il y a quelque chose au-dessus : sans
              univers, il ouvrirait le menu sur un trait. */}
          <div className="task-menu__sep" role="separator" />
        </>
      )}

      {/* Le glisser-déposer HTML5 ne marche pas au doigt : sans ces entrées,
          réordonner serait impossible sur mobile — et au clavier. */}
      <button
        className="task-menu__action task-menu__action--move"
        disabled={premier}
        onClick={() => onMove(-1)}
      >
        ↑ Monter
      </button>
      <button
        className="task-menu__action task-menu__action--move"
        disabled={dernier}
        onClick={() => onMove(1)}
      >
        ↓ Descendre
      </button>

      <div className="task-menu__sep" role="separator" />
      <button className="task-menu__action" onClick={onRename}>
        <IconPenLine size={13} />
        Renommer
      </button>
      <button className="task-menu__action task-menu__action--del" onClick={onDelete}>
        <IconTrash size={13} />
        Supprimer
      </button>
    </div>
  );
}
