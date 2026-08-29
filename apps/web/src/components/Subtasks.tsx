import { useState, type FormEvent } from 'react';
import { endPosition, subtasksOf, type Task } from '@penduline/shared';

/**
 * Les étapes d'une tâche, sous elle.
 *
 * ⚠️ Une sous-tâche fait **beaucoup moins** qu'une tâche, et c'est voulu : elle se
 * coche et se supprime, rien d'autre. Pas de case — son classement
 * urgent/important est celui de son parent —, pas d'épinglage, pas d'appairage.
 * Lui donner les mêmes gestes ferait de la matrice un gestionnaire de projet,
 * ce que les garde-fous de #50 refusent explicitement.
 *
 * Le repli est **local et par tâche** : c'est un état de lecture, pas une donnée.
 */
export function Subtasks({
  parent,
  tasks,
  open,
  onToggleOpen,
  onAdd,
  onCheck,
  onDelete,
}: {
  parent: Task;
  tasks: Task[];
  open: boolean;
  onToggleOpen: () => void;
  onAdd: (title: string, position: number) => void;
  onCheck: (t: Task) => void;
  onDelete: (t: Task) => void;
}) {
  const [draft, setDraft] = useState('');
  const etapes = subtasksOf(tasks, parent.id);
  const faites = etapes.filter((t) => t.done).length;
  // Rien à montrer, et rien à replier : le bloc s'efface, et l'entrée d'ajout ne
  // paraît qu'au survol (cf. `.sub__toggle` dans la feuille de style).
  const vide = etapes.length === 0;

  function submit(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    onAdd(title, endPosition(etapes));
    setDraft('');
  }

  return (
    <div className={`sub${vide ? '' : ' sub--filled'}`}>
      <button
        className="sub__toggle"
        aria-expanded={open}
        onClick={onToggleOpen}
        aria-label={vide ? `Ajouter une étape à « ${parent.title} »` : `Étapes de « ${parent.title} », ${faites} sur ${etapes.length}`}
      >
        <svg className={`sub__chevron${open ? ' sub__chevron--open' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" width="10" height="10" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
        {vide ? '＋ étape' : `${faites}/${etapes.length}`}
      </button>

      {open && (
        <div className="sub__list">
          {etapes.map((t) => (
            <div className={`sub__item${t.done ? ' sub__item--done' : ''}`} key={t.id}>
              <button
                className={`sub__check${t.done ? ' sub__check--done' : ''}`}
                onClick={() => onCheck(t)}
                aria-label={t.done ? `Rétablir « ${t.title} »` : `Terminer « ${t.title} »`}
              />
              <span className="sub__title">{t.title}</span>
              <button
                className="sub__del"
                onClick={() => onDelete(t)}
                aria-label={`Supprimer « ${t.title} »`}
              >
                ✕
              </button>
            </div>
          ))}
          <form className="sub__add" onSubmit={submit}>
            <input
              className="sub__input"
              value={draft}
              maxLength={500}
              placeholder="Ajouter une étape…"
              aria-label={`Ajouter une étape à « ${parent.title} »`}
              onChange={(e) => setDraft(e.target.value)}
              // Échap referme la liste plutôt que d'avaler la saisie ailleurs.
              onKeyDown={(e) => {
                if (e.key === 'Escape') onToggleOpen();
              }}
            />
          </form>
        </div>
      )}
    </div>
  );
}
