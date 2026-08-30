import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { quadrant, type Board, type Task } from '@penduline/shared';
import { useDialog } from '../a11y/useDialog';
import { useSearch } from '../data/useSearch';

/** Où mène un résultat : sa matrice, et la corbeille si la tâche n'est plus dans la grille. */
export interface SearchHit {
  boardId: string;
  taskId: string;
  /** La tâche est terminée ou supprimée : elle ne s'affiche que dans la corbeille. */
  inBin: boolean;
}

interface Groupe {
  board: Board;
  tasks: Task[];
}

/** Regroupe par matrice, dans l'ordre où les tâches sont arrivées du serveur. */
function grouper(tasks: Task[], boards: Board[]): Groupe[] {
  const parId = new Map(boards.map((b) => [b.id, b]));
  const ordre: string[] = [];
  const paquets = new Map<string, Task[]>();
  for (const t of tasks) {
    if (!parId.has(t.board_id)) continue;
    if (!paquets.has(t.board_id)) {
      paquets.set(t.board_id, []);
      ordre.push(t.board_id);
    }
    paquets.get(t.board_id)!.push(t);
  }
  return ordre.map((id) => ({ board: parId.get(id)!, tasks: paquets.get(id)! }));
}

/**
 * La recherche, en dialogue.
 *
 * Ouverte depuis la barre du haut : elle est donc atteignable depuis les trois
 * écrans sans qu'aucun n'ait à la porter.
 *
 * Deux sections, et c'est une demande du ticket : ce qui reste à faire ne se
 * confond pas avec ce qui est terminé ou jeté. À l'intérieur, un groupe par
 * matrice — sans quoi une liste plate de titres ne dit pas d'où ils viennent,
 * exactement le problème que la recherche est censée résoudre.
 */
export function Search({
  boards,
  tasks,
  onClose,
  onPick,
}: {
  boards: Board[];
  /** Les tâches en mémoire — pour savoir où mène une étape trouvée (#50). */
  tasks: Task[];
  onClose: () => void;
  onPick: (hit: SearchHit) => void;
}) {
  const dialog = useDialog(onClose);
  const [query, setQuery] = useState('');
  const [curseur, setCurseur] = useState(0);
  const { results, busy } = useSearch(query);
  const champ = useRef<HTMLInputElement>(null);

  // `useDialog` donne le focus au PANNEAU — c'est ce qu'il faut pour une
  // corbeille ou une confirmation, dont on parcourt les boutons. Ici on ouvre
  // pour taper : sans cette reprise, la recherche s'ouvre et n'accepte rien.
  // Après l'effet de `useDialog`, donc il gagne.
  useEffect(() => {
    champ.current?.focus();
  }, []);

  /**
   * Où mène un résultat.
   *
   * Une étape n'est pas une carte : elle s'affiche SOUS son parent, jamais
   * seule — on ouvre donc le parent (#50).
   *
   * `inBin` se déduit de la présence du parent en mémoire, pas de l'état de
   * l'étape : depuis #40 seules les tâches ouvertes sont chargées, et depuis #50
   * les étapes cochées le sont aussi. Parent absent = parent terminé ou
   * supprimé, donc dans la corbeille — qui, elle, charge à l'ouverture et l'y
   * trouvera. Se fier à l'état de l'étape rangerait une étape cochée sous un
   * parent bien vivant dans la section « Corbeille ».
   */
  const cible = useMemo(() => {
    const parId = new Map(tasks.map((t) => [t.id, t]));
    return (t: Task): SearchHit => {
      if (!t.parent_id) return { boardId: t.board_id, taskId: t.id, inBin: t.done || t.deleted };
      const parent = parId.get(t.parent_id);
      return { boardId: t.board_id, taskId: t.parent_id, inBin: !parent || parent.done || parent.deleted };
    };
  }, [tasks]);

  // Le partage suit la DESTINATION, pas l'état du résultat : une étape cochée
  // sous un parent vivant se retrouve encore sur la grille, pas à la corbeille.
  const ouvertes = useMemo(() => results.filter((t) => !cible(t).inBin), [results, cible]);
  const corbeille = useMemo(() => results.filter((t) => cible(t).inBin), [results, cible]);

  /**
   * La liste à plat des résultats, dans l'ordre affiché.
   *
   * C'est elle qui donne son sens au curseur : les flèches parcourent ce que
   * l'œil parcourt, groupes traversés sans qu'on ait à y penser.
   */
  const plat = useMemo(() => [...ouvertes, ...corbeille], [ouvertes, corbeille]);
  const actif = plat[Math.min(curseur, plat.length - 1)];

  function onKeyDown(e: ReactKeyboardEvent) {
    if (e.key === 'Escape') return dialog.onKeyDown(e);
    if (plat.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCurseur((c) => Math.min(c + 1, plat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCurseur((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && actif) {
      e.preventDefault();
      onPick(cible(actif));
    }
  }

  function ligne(t: Task) {
    const q = quadrant(t.quadrant);
    return (
      <button
        key={t.id}
        className={`sr-hit${actif?.id === t.id ? ' sr-hit--active' : ''}`}
        // Le curseur suit la souris : deux surbrillances concurrentes seraient
        // illisibles, et `Entrée` doit ouvrir ce que l'œil désigne.
        onMouseEnter={() => setCurseur(plat.findIndex((x) => x.id === t.id))}
        onClick={() => onPick(cible(t))}
      >
        <span className="sr-hit__dot" style={{ background: q.ink }} aria-hidden="true" />
        <span className="sr-hit__title">{t.title}</span>
        {/* Sans cette mention, on clique sur « Acheter des cartons » et on
            atterrit sur « Préparer le déménagement » sans comprendre pourquoi. */}
        {t.parent_id && <span className="sr-hit__sub">étape</span>}
        <span className="sr-hit__quad" style={{ color: q.dark }}>
          {q.label}
        </span>
      </button>
    );
  }

  function section(titre: string, tasks: Task[], cls: string) {
    if (tasks.length === 0) return null;
    return (
      <>
        <p className={`sr-section ${cls}`}>{titre}</p>
        {grouper(tasks, boards).map((g) => (
          <div className="sr-group" key={g.board.id} role="group" aria-label={`Matrice ${g.board.name}`}>
            <p className="sr-group__name">{g.board.name}</p>
            {g.tasks.map(ligne)}
          </div>
        ))}
      </>
    );
  }

  const vide = query.trim().length > 0 && !busy && results.length === 0;

  return (
    <div className="bin-backdrop" onClick={onClose}>
      <div
        className="sr-panel"
        {...dialog.surface}
        aria-label="Rechercher une tâche"
        ref={dialog.ref}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={champ}
          className="sr-input"
          type="search"
          placeholder="Rechercher dans toutes les matrices…"
          value={query}
          aria-label="Rechercher une tâche"
          onChange={(e) => {
            setQuery(e.target.value);
            setCurseur(0);
          }}
        />

        <div className="sr-results">
          {section('Résultats', ouvertes, 'sr-section--open')}
          {section('Corbeille', corbeille, 'sr-section--bin')}
          {vide && <p className="sr-empty">Aucune tâche ne correspond.</p>}
          {query.trim().length === 0 && (
            <p className="sr-empty">
              Tapez pour chercher. <kbd className="sr-key">↑</kbd> <kbd className="sr-key">↓</kbd> pour
              parcourir, <kbd className="sr-key">Entrée</kbd> pour ouvrir.
            </p>
          )}
        </div>

        {/* Le nombre de résultats doit s'entendre, pas seulement se voir. */}
        <p className="sr-only" role="status" aria-live="polite">
          {busy ? 'Recherche en cours' : `${results.length} résultat${results.length > 1 ? 's' : ''}`}
        </p>
      </div>
    </div>
  );
}
