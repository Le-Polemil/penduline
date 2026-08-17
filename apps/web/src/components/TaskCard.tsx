import type { CSSProperties, DragEvent } from 'react';
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
}) {
  const renaming = rename.value !== null;
  const splitActive = !!split?.ok && !!split.active;
  const cls = [
    'task',
    pinnedCard ? 'task--pinned' : '',
    drag?.dragging ? 'task--dragging' : '',
    splitActive ? 'task--split' : '',
    task.done ? 'task--done' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="card-wrap">
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
        {pinnedCard ? <span className="task__flag">⚑</span> : <span className="task__grip">⠿</span>}
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
        <button className="task__more" onClick={() => onMenu(!menuOpen)}>
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
