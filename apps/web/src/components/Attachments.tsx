import { useState, type FormEvent } from 'react';
import { attachmentsOf, hostLabel, type Attachment, type Task } from '@penduline/shared';

/**
 * Les liens d'une tâche, sous elle (#78).
 *
 * ⚠️ Une tâche SANS lien n'affiche rien du tout — pas une pastille vide, pas un
 * bouton. Le ticket le demande explicitement, et c'est la seule façon de ne pas
 * alourdir une matrice où l'immense majorité des tâches n'aura jamais de lien.
 * L'entrée d'ajout vit dans le menu `⋯`, là où on la cherche.
 *
 * `rel="noopener noreferrer"` sur chaque lien : sans `noopener`, la page ouverte
 * garde une poignée sur la nôtre par `window.opener`.
 */
export function Attachments({
  task,
  attachments,
  adding,
  onCancelAdd,
  onAdd,
  onRemove,
}: {
  task: Task;
  attachments: Attachment[];
  /** Le champ d'ajout est ouvert (déclenché depuis le menu de la carte). */
  adding: boolean;
  onCancelAdd: () => void;
  onAdd: (url: string) => Promise<boolean>;
  onRemove: (a: Attachment) => void;
}) {
  const [draft, setDraft] = useState('');
  const [refuse, setRefuse] = useState(false);
  const liens = attachmentsOf(attachments, task.id);

  if (liens.length === 0 && !adding) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const url = draft.trim();
    if (!url) return onCancelAdd();
    if (await onAdd(url)) {
      setDraft('');
      setRefuse(false);
      onCancelAdd();
    } else {
      // La saisie est CONSERVÉE : refuser une URL et l'effacer au passage
      // obligerait à la retaper pour corriger une lettre.
      setRefuse(true);
    }
  }

  return (
    <div className="att">
      {liens.map((a) => (
        <span className="att__chip" key={a.id}>
          <a className="att__link" href={a.url} target="_blank" rel="noopener noreferrer" title={a.url}>
            ↗ {hostLabel(a)}
          </a>
          <button
            className="att__del"
            onClick={() => onRemove(a)}
            aria-label={`Détacher « ${hostLabel(a)} » de « ${task.title} »`}
          >
            ✕
          </button>
        </span>
      ))}
      {adding && (
        <form className="att__add" onSubmit={submit}>
          <input
            className={`att__input${refuse ? ' att__input--bad' : ''}`}
            value={draft}
            autoFocus
            maxLength={2048}
            placeholder="https://…"
            aria-label={`Ajouter un lien à « ${task.title} »`}
            aria-invalid={refuse}
            onChange={(e) => {
              setDraft(e.target.value);
              setRefuse(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancelAdd();
            }}
          />
          {refuse && (
            <span className="att__error" role="alert">
              Un lien commence par http:// ou https://
            </span>
          )}
        </form>
      )}
    </div>
  );
}
