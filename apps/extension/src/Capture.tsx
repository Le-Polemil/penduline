import { useEffect, useState, type FormEvent } from 'react';
import { endPosition, isSafeUrl, normalizeUrl, type Board, type Task } from '@penduline/shared';
import { clearPending, type PendingCapture } from './pending-capture';

/**
 * Le formulaire de capture (#78).
 *
 * La capture de #52 écrivait **en aveugle** : un clic, une pastille, la tâche
 * était en base. On ne voyait pas ce qui avait été retenu et on ne pouvait rien
 * corriger. Ici on relit avant d'écrire.
 *
 * ⚠️ **L'écriture à chaque frappe n'a plus lieu d'être, et elle a été retirée.**
 * Elle compensait la fermeture au blur du popup d'action : cliquer dans la page pour
 * relire un titre suffisait à le faire disparaître, et la saisie était perdue
 * exactement au moment où l'utilisateur allait la chercher. Le panneau latéral
 * ne se ferme plus — le geste qu'elle protégeait est devenu sans danger.
 *
 * Reste une écriture **au départ du formulaire** (validation ou annulation), qui
 * n'est pas de la sauvegarde mais du nettoyage : `clearPending` retire la
 * capture du stockage pour qu'elle ne rouvre pas le formulaire à la prochaine
 * ouverture. `pending-capture.ts` reste donc le canal entre le service worker et
 * le panneau ; seule sa cadence d'écriture s'allège.
 */
export function Capture({
  pending,
  boards,
  tasks,
  onDone,
  onCancel,
  onWrite,
}: {
  pending: PendingCapture;
  boards: Board[];
  tasks: Task[];
  onDone: () => void;
  onCancel: () => void;
  /** Écrit la tâche et son lien. `false` = rien n'a été écrit. */
  onWrite: (boardId: string, title: string, position: number, url: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState(pending.title);
  const [url, setUrl] = useState(pending.url);
  const [boardId, setBoardId] = useState(pending.boardId ?? boards[0]?.id ?? '');
  const [busy, setBusy] = useState(false);

  // La destination du menu peut ne plus exister (matrice supprimée entre-temps).
  useEffect(() => {
    if (!boards.some((b) => b.id === boardId) && boards[0]) setBoardId(boards[0].id);
  }, [boards, boardId]);

  const urlValide = !url.trim() || isSafeUrl(normalizeUrl(url));
  const pret = title.trim().length > 0 && boardId !== '' && urlValide && !busy;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!pret) return;
    setBusy(true);
    // La position se lit en fin de case « À trier » de la matrice visée : ce qui
    // arrive par un canal automatique n'a par définition pas été classé.
    const position = endPosition(
      tasks.filter((t) => t.board_id === boardId && t.quadrant === 'parking' && !t.done && !t.deleted),
    );
    const ok = await onWrite(boardId, title.trim().slice(0, 500), position, url.trim());
    if (!ok) return setBusy(false);
    await clearPending();
    onDone();
  }

  return (
    <form className="cap" onSubmit={submit}>
      <p className="cap__title">Capturer</p>

      <label className="cap__label" htmlFor="cap-title">
        Titre
      </label>
      <textarea
        id="cap-title"
        className="cap__area"
        value={title}
        autoFocus
        rows={2}
        maxLength={500}
        onChange={(e) => setTitle(e.target.value)}
      />

      <label className="cap__label" htmlFor="cap-url">
        Lien
      </label>
      <input
        id="cap-url"
        className={`cap__input${urlValide ? '' : ' cap__input--bad'}`}
        value={url}
        maxLength={2048}
        placeholder="https://…"
        aria-invalid={!urlValide}
        onChange={(e) => setUrl(e.target.value)}
      />
      {!urlValide && (
        <span className="cap__error" role="alert">
          Un lien commence par http:// ou https://
        </span>
      )}

      <label className="cap__label" htmlFor="cap-board">
        Matrice
      </label>
      {/* La destination vient du menu, mais reste modifiable : on découvre
          souvent en relisant qu'on visait la mauvaise. */}
      <select
        id="cap-board"
        className="cap__input"
        value={boardId}
        onChange={(e) => setBoardId(e.target.value)}
      >
        {boards.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
      <p className="cap__hint">Arrivée dans « À trier ».</p>

      <div className="cap__actions">
        <button
          type="button"
          className="cap__btn"
          onClick={() => {
            void clearPending();
            onCancel();
          }}
        >
          Annuler
        </button>
        <button type="submit" className="cap__btn cap__btn--go" disabled={!pret}>
          {busy ? '…' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}
