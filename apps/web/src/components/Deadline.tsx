import { useEffect, useState, type FormEvent } from 'react';
import { fromLocalInput, toLocalInput, type Task } from '@penduline/shared';

/**
 * L'éditeur d'échéance d'une tâche (#19).
 *
 * ⚠️ Une tâche SANS échéance et sans édition en cours n'affiche rien du tout —
 * même règle que les pièces jointes de #78. L'immense majorité des tâches n'aura
 * jamais de date : leur réserver une ligne vide alourdirait toute la matrice
 * pour rien. Le badge, lui, vit dans la carte ; ici on ne montre que la saisie.
 *
 * `datetime-local` plutôt qu'un sélecteur maison : il donne gratuitement le
 * clavier natif du mobile, le format du système et l'accessibilité. Sa valeur
 * est de l'heure LOCALE — la conversion vers l'UTC stocké est faite par
 * `fromLocalInput`, dans `packages/shared`, là où elle est testée.
 */
export function Deadline({
  task,
  editing,
  onCancel,
  onSet,
  onClear,
}: {
  task: Task;
  /** L'éditeur est ouvert (déclenché depuis le menu de la carte). */
  editing: boolean;
  onCancel: () => void;
  onSet: (dueAt: string) => void;
  onClear: () => void;
}) {
  const [draft, setDraft] = useState('');

  /**
   * Le brouillon se recale sur la tâche à CHAQUE ouverture.
   *
   * L'état local ne s'initialise qu'au montage, et le composant reste monté
   * entre deux ouvertures : sans cette resynchronisation, rouvrir l'éditeur
   * après avoir changé la date — ou après un `Ctrl+Z`, ou après une
   * modification arrivée d'un autre onglet — proposerait l'ancienne valeur, et
   * la revalider écraserait la bonne.
   */
  useEffect(() => {
    if (editing) setDraft(task.due_at ? toLocalInput(task.due_at) : '');
  }, [editing, task.due_at]);

  if (!editing) return null;

  function submit(e: FormEvent) {
    e.preventDefault();
    const iso = fromLocalInput(draft);
    // Valider un champ vidé retire l'échéance : c'est le geste attendu, et il
    // évite d'avoir à ressortir du formulaire pour trouver « Retirer ».
    if (iso) onSet(iso);
    else onClear();
    onCancel();
  }

  return (
    <form className="due-edit" onSubmit={submit}>
      <input
        className="due-edit__input"
        type="datetime-local"
        value={draft}
        autoFocus
        aria-label={`Échéance de « ${task.title} »`}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
        }}
      />
      <button className="due-edit__ok" type="submit">
        Enregistrer
      </button>
      {task.due_at && (
        <button
          className="due-edit__del"
          type="button"
          onClick={() => {
            onClear();
            onCancel();
          }}
        >
          Retirer
        </button>
      )}
    </form>
  );
}
