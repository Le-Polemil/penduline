import { useEffect, useRef, useState, type FormEvent } from 'react';
import { endPosition, subtasksOf, type Task } from '@penduline/shared';

/**
 * Les étapes d'une tâche, sous elle.
 *
 * ⚠️ Une sous-tâche fait **beaucoup moins** qu'une tâche, et c'est voulu : elle se
 * coche et se supprime, rien d'autre. Pas de case — son classement
 * urgent/important est celui de son parent —, pas d'appairage, pas d'échéance.
 * Lui donner les mêmes gestes ferait de la matrice un gestionnaire de projet,
 * ce que les garde-fous de #50 refusent explicitement.
 *
 * ⚠️ MAIS ELLE DOIT EN AVOIR L'AIR. Les étapes étaient des lignes de texte nues,
 * qui ne ressemblaient à rien d'autre dans l'application. Elles sont désormais de
 * vraies cartes — mêmes fond, rayon et ombre que les tâches — simplement plus
 * petites : la hiérarchie se lit à la TAILLE et au RETRAIT, pas à un changement
 * de nature. Une étape est une tâche subordonnée, pas un autre objet.
 *
 * Le rattachement est dessiné : un trait descend du parent et se divise vers
 * chaque étape (`.sub__list::before` pour le tronc, `.sub__item::before` pour la
 * branche). Sans lui, le seul retrait laissait deviner l'appartenance.
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
  askAdd,
}: {
  parent: Task;
  tasks: Task[];
  open: boolean;
  onToggleOpen: () => void;
  onAdd: (title: string, position: number) => void;
  onCheck: (t: Task) => void;
  onDelete: (t: Task) => void;
  /**
   * Nonce d'ajout venu de la carte. À chaque incrément, le champ reprend le
   * focus — c'est ce qui fait du bouton `layers-plus` un geste complet plutôt
   * qu'un simple dépliage.
   */
  askAdd: number;
}) {
  const [draft, setDraft] = useState('');
  /**
   * Le champ d'ajout n'existe QUE sur demande.
   *
   * Affiché en permanence sous les étapes, il ajoutait une ligne à chaque tâche
   * dépliée — la même dépense que la pastille « ＋ étape » qu'on venait de
   * retirer, simplement déplacée d'un cran. Il s'ouvre par le bouton de la carte
   * et se referme dès qu'on le quitte.
   */
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const etapes = subtasksOf(tasks, parent.id);
  const faites = etapes.filter((t) => t.done).length;
  const vide = etapes.length === 0;

  // Le bouton de la carte demande l'ajout ; c'est ici qu'on ouvre le champ.
  useEffect(() => {
    if (askAdd > 0) setAdding(true);
  }, [askAdd]);

  // Après peinture : au premier clic, le champ n'existe pas encore au moment où
  // le nonce change — la liste vient tout juste de s'ouvrir.
  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding, askAdd]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    onAdd(title, endPosition(etapes));
    setDraft('');
  }

  /**
   * Une tâche SANS étape n'affiche rien tant qu'on ne demande pas l'ajout.
   *
   * ⚠️ La condition porte sur `adding`, PAS sur `open`. `open` est le dépliage
   * mémorisé par l'écran (et persisté) : il reste vrai après la suppression de
   * la dernière étape, et il reste vrai après le premier clic sur le bouton
   * d'ajout. Dans les deux cas le bloc restait donc dans le DOM, vide, à
   * occuper sa ligne — exactement la dépense qu'on venait de supprimer.
   *
   * Il n'y a de toute façon rien à déplier quand il n'y a pas d'étape.
   */
  if (vide && !adding) return null;

  return (
    <div className={`sub${vide ? '' : ' sub--filled'}`}>
      {/* Le compteur reste : c'est une information sur l'avancement, pas une
          commande — et c'est pourquoi il s'affiche sans survol. */}
      {!vide && (
        <button
          className="sub__toggle"
          aria-expanded={open}
          onClick={onToggleOpen}
          aria-label={`Étapes de « ${parent.title} », ${faites} sur ${etapes.length}`}
        >
          <svg
            className={`sub__chevron${open ? ' sub__chevron--open' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            width="10"
            height="10"
            aria-hidden="true"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          {`${faites}/${etapes.length}`}
        </button>
      )}

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
          {adding && (
            <form className="sub__item sub__item--add" onSubmit={submit}>
              {/* La case à cocher est là, désactivée : le champ prend ainsi la
                  forme exacte de ce qu'il va produire. Une étape en cours de
                  saisie n'est pas encore cochable — la griser le dit mieux que
                  son absence, qui ferait changer la ligne de gabarit au moment
                  de la validation. */}
              <span className="sub__check sub__check--ghost" aria-hidden="true" />
              <input
                ref={inputRef}
                className="sub__input"
                value={draft}
                maxLength={500}
                placeholder="Ajouter une étape…"
                aria-label={`Ajouter une étape à « ${parent.title} »`}
                onChange={(e) => setDraft(e.target.value)}
                // Quitter le champ le referme. Le valider par Entrée ne le ferme
                // PAS : on enchaîne souvent deux ou trois étapes d'affilée.
                onBlur={() => {
                  setAdding(false);
                  setDraft('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setAdding(false);
                }}
              />
            </form>
          )}
        </div>
      )}
    </div>
  );
}
