import type { CSSProperties, DragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  partnerOf,
  QUADS,
  type Board,
  type Quadrant,
  type QuadrantKey,
  type Task,
} from '@penduline/shared';

/** Le déplacement au doigt/à la souris. Absent, la carte n'est pas déplaçable. */
export interface CardDrag {
  /** Cette carte est celle qu'on déplace. */
  dragging: boolean;
  start: () => void;
  end: () => void;
}

/**
 * L'appairage par dépôt sur la carte. Absent, la carte n'est jamais une cible.
 *
 * La vue globale s'en passe : appairer suppose de poser la nouvelle venue juste
 * après sa partenaire, donc un ordre — et il n'en existe pas entre deux matrices.
 */
export interface CardSplit {
  ok: boolean;
  active: boolean;
  over: () => void;
  drop: () => void;
}

/**
 * Le réordonnancement d'un cran. Absent, la fonction n'existe pas — c'est ainsi
 * que la vue globale s'en passe, où aucun ordre transversal n'a de sens (#18).
 *
 * `null` sur un côté = déjà en bout de liste. Porter la borne dans la prop évite
 * que chaque écran redécouvre « suis-je en haut » alors que `planReorder` le sait.
 */
export interface CardReorder {
  up: (() => void) | null;
  down: (() => void) | null;
}

/** Le renommage en place, dont l'état vit chez l'appelant (une seule carte à la fois). */
export interface CardRename {
  /** `null` = titre affiché ; une chaîne = saisie en cours. */
  value: string | null;
  start: () => void;
  change: (value: string) => void;
  cancel: () => void;
  commit: () => void;
}

/**
 * Une carte de tâche et son menu `⋯`.
 *
 * Extraite de l'écran matrice pour que la vue globale ne la recopie pas. La
 * différence entre les deux écrans tient entièrement dans deux props
 * FACULTATIVES — `drag` et `split` : absentes, les gestes correspondants
 * n'existent tout simplement pas. Pas de drapeau `mode`, donc pas de
 * conditionnelle à maintenir à l'intérieur.
 */
export function TaskCard({
  task,
  quad,
  tasks,
  otherBoards,
  pinnedCard,
  menuOpen,
  onMenu,
  rename,
  onCheck,
  onMoveQuad,
  onMoveBoard,
  onTogglePin,
  onUnpair,
  onDelete,
  drag,
  split,
  reorder,
  flash,
}: {
  task: Task;
  quad: Quadrant;
  /** Toutes les tâches — pour savoir si la partenaire existe encore (« Dissocier »). */
  tasks: Task[];
  /** Les matrices proposées par « Vers une autre matrice » (la sienne exclue). */
  otherBoards: Board[];
  pinnedCard: boolean;
  menuOpen: boolean;
  onMenu: (open: boolean) => void;
  rename: CardRename;
  onCheck: () => void;
  onMoveQuad: (key: QuadrantKey) => void;
  onMoveBoard: (board: Board) => void;
  onTogglePin: () => void;
  onUnpair: () => void;
  onDelete: () => void;
  drag?: CardDrag;
  split?: CardSplit;
  /** Absent = ni entrées de menu, ni raccourci. */
  reorder?: CardReorder;
  /** Mise en évidence passagère, à l'arrivée depuis la recherche. */
  flash?: boolean;
}) {
  const renaming = rename.value !== null;
  const splitActive = !!split?.ok && !!split.active;
  const cls = [
    'task',
    pinnedCard ? 'task--pinned' : '',
    drag?.dragging ? 'task--dragging' : '',
    splitActive ? 'task--split' : '',
    task.done ? 'task--done' : '',
    flash ? 'task--flash' : '',
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * `Alt`+↑/↓ — capté sur le CONTENEUR, pas sur la carte.
   *
   * L'événement remonte du contrôle qui a réellement le focus (la case à cocher
   * ou le `⋯`), ce qui donne le raccourci **sans ajouter d'arrêt de tabulation**.
   * Une case compte déjà un arrêt par contrôle de chaque tâche ; en ajouter un par
   * carte doublerait le parcours clavier.
   */
  function onKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    // Pas de raccourci pendant une saisie, ni là où la fonction n'existe pas.
    if (!reorder || !e.altKey || renaming) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    // `Alt`+flèche navigue dans l'historique sur certains navigateurs : le geste
    // nous étant destiné, on le consomme — y compris en bout de liste, où il n'a
    // rien à faire mais ne doit surtout pas quitter la page.
    e.preventDefault();
    e.stopPropagation();
    (e.key === 'ArrowUp' ? reorder.up : reorder.down)?.();
  }

  return (
    <div className="card-wrap" data-task={task.id} onKeyDown={onKeyDown}>
      <div
        className={cls}
        style={{ viewTransitionName: `vt-${task.id}` } as CSSProperties}
        // Pas de déplacement pendant une saisie : le glisser volerait le curseur.
        draggable={!!drag && !task.pinned && !task.done && !renaming}
        onDragStart={(e: DragEvent) => {
          if (!drag) return;
          e.dataTransfer.effectAllowed = 'move';
          window.setTimeout(() => {
            drag.start();
            onMenu(false);
          }, 0);
        }}
        onDragEnd={() => drag?.end()}
        onDragOver={(e: DragEvent) => {
          if (split?.ok) {
            e.preventDefault();
            e.stopPropagation();
            split.over();
          }
        }}
        onDrop={(e: DragEvent) => {
          if (split?.ok) {
            e.preventDefault();
            e.stopPropagation();
            split.drop();
          }
        }}
      >
        {/* Le drapeau PORTE une information — épinglée — là où la poignée n'est
            qu'un rappel décoratif du glisser. D'où le traitement inverse : l'un
            est nommé, l'autre masqué. Sans quoi un lecteur d'écran énonce les
            points braille de « ⠿ » sur chaque carte. */}
        {pinnedCard ? (
          <span className="task__flag" role="img" aria-label="Épinglée">
            ⚑
          </span>
        ) : (
          <span className="task__grip" aria-hidden="true">
            ⠿
          </span>
        )}
        <button
          className={`task__check${task.done ? ' task__check--done' : ''}`}
          onClick={onCheck}
          aria-label={task.done ? 'Rétablir' : 'Terminer'}
        />
        {renaming ? (
          <form
            className="task__rename"
            onSubmit={(e) => {
              e.preventDefault();
              rename.commit();
            }}
          >
            <input
              className="task__rename-input"
              value={rename.value ?? ''}
              autoFocus
              maxLength={500}
              onChange={(e) => rename.change(e.target.value)}
              // Échap annule. Pas de fermeture au blur : elle avalerait la
              // saisie dès qu'on clique ailleurs pour valider.
              onKeyDown={(e) => {
                if (e.key === 'Escape') rename.cancel();
              }}
            />
          </form>
        ) : (
          <span className={`task__title${task.done ? ' task__title--done' : ''}`}>{task.title}</span>
        )}
        {/* Le glyphe seul nommait ce bouton « ⋯ » dans l'arbre d'accessibilité :
            autant de boutons identiques et anonymes qu'il y a de tâches. */}
        <button
          className="task__more"
          aria-label={`Actions pour « ${task.title} »`}
          aria-expanded={menuOpen}
          onClick={() => onMenu(!menuOpen)}
        >
          ⋯
        </button>
      </div>
      {menuOpen && (
        <div className="task-menu">
          <button
            className="task-menu__action"
            onClick={() => {
              rename.start();
              onMenu(false);
            }}
          >
            Renommer
          </button>
          {/* Les deux entrées restent VISIBLES et grisées en bout de liste : un
              menu dont les lignes apparaissent et disparaissent selon la position
              se relit à chaque ouverture.
              Elles portent leur raccourci en clair — c'est ainsi qu'on apprend
              `Alt`+↑ : en lisant le menu. Un raccourci que rien n'annonce
              n'existe pas. */}
          {reorder && (
            <>
              <button
                className="task-menu__action task-menu__action--move"
                disabled={!reorder.up}
                onClick={() => reorder.up?.()}
              >
                ↑ Monter <kbd className="task-menu__key">Alt+↑</kbd>
              </button>
              <button
                className="task-menu__action task-menu__action--move"
                disabled={!reorder.down}
                onClick={() => reorder.down?.()}
              >
                ↓ Descendre <kbd className="task-menu__key">Alt+↓</kbd>
              </button>
            </>
          )}
          <div className="task-menu__label">Déplacer vers</div>
          <div className="task-menu__grid">
            {QUADS.map((b) => (
              <button
                key={b.key}
                className="move-btn"
                style={{ background: b.bg, color: b.dark }}
                disabled={b.key === quad.key}
                onClick={() => onMoveQuad(b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
          {/* Les autres matrices sont listées à plat plutôt qu'en sous-menu :
              un menu déjà flottant qui en ouvrirait un second serait pénible
              à viser, et la liste reste courte dans l'usage réel. */}
          {otherBoards.length > 0 && (
            <>
              <div className="task-menu__label">Vers une autre matrice</div>
              <div className="task-menu__boards">
                {otherBoards.map((b) => (
                  <button key={b.id} className="board-btn" onClick={() => onMoveBoard(b)}>
                    {b.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {quad.key !== 'parking' && (
            <button className="task-menu__action task-menu__action--pin" onClick={onTogglePin}>
              {task.pinned ? 'Désépingler' : '⚑ Épingler en haut'}
            </button>
          )}
          {/* Seule sortie volontaire du lien : sans elle, il ne se déferait
              plus que par suppression ou complétion — soit par accident. */}
          {task.pair_id && partnerOf(tasks, task) && (
            <button className="task-menu__action" onClick={onUnpair}>
              Dissocier
            </button>
          )}
          <button className="task-menu__action task-menu__action--del" onClick={onDelete}>
            Supprimer
          </button>
        </div>
      )}
    </div>
  );
}
