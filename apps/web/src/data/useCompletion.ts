import { useEffect, useRef, useState } from 'react';
import { planPairDetach, type Task, type TaskPatch } from '@penduline/shared';
import { useToast } from '../components/Toast';

/** Délai d'annulation avant que la tâche cochée ne parte à la corbeille. */
const UNDO_MS = 4000;

/**
 * Clé du toast d'annulation. Fixe : cocher une deuxième tâche doit *remplacer*
 * le message, pas en empiler un second — il n'y a qu'une annulation en vol.
 */
const TOAST_KEY = 'completion';

/**
 * Le cycle cocher → annuler → archiver.
 *
 * Cocher ne range pas tout de suite : la tâche reste visible, barrée, le temps
 * qu'un toast propose d'annuler. Ce n'est qu'après ce délai qu'elle rejoint la
 * corbeille — et c'est à ce moment-là, pas avant, que la paire est défaite : la
 * partenaire se retrouverait sinon avec un `pair_id` sans vis-à-vis, alors qu'une
 * annulation dans les quatre secondes doit tout remettre en place.
 *
 * Sorti de l'écran matrice pour que la vue globale coche exactement pareil. Deux
 * copies de ce minuteur auraient dérivé, comme la règle d'appairage avant elles.
 *
 * Le toast n'est plus *rendu* par l'appelant mais *publié* dans l'hôte commun :
 * un échec d'écriture doit pouvoir s'afficher en même temps, et deux toasts
 * ancrés au même point en bas de l'écran se recouvraient.
 */
export function useCompletion(
  tasks: Task[],
  patchTask: (id: string, patch: TaskPatch) => Promise<boolean>,
) {
  /** La tâche cochée dont l'annulation est encore offerte. */
  const [pending, setPending] = useState<{ id: string; label: string } | null>(null);
  const timer = useRef<number>();
  const { show, dismiss } = useToast();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function archive(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      for (const w of planPairDetach(tasks, task, { archived: true, pinned: false })) {
        void patchTask(w.id, w.patch);
      }
    }
    setPending((cur) => (cur && cur.id === id ? null : cur));
    dismiss(TOAST_KEY);
  }

  /**
   * L'annulation. Elle reçoit son `id` en argument plutôt que de lire `pending` :
   * la fermeture est capturée par le toast au moment du `show`, c'est-à-dire
   * avant que `setPending` n'ait pris effet — elle y lirait la tâche précédente.
   */
  function undo(id: string) {
    window.clearTimeout(timer.current);
    void patchTask(id, { done: false, archived: false });
    setPending((cur) => (cur && cur.id === id ? null : cur));
    dismiss(TOAST_KEY);
  }

  function complete(task: Task) {
    // Cocher une deuxième tâche pendant le délai archive la première sur-le-champ :
    // un seul toast à la fois, et pas d'annulation qui traîne sans cible visible.
    if (pending) {
      window.clearTimeout(timer.current);
      archive(pending.id);
    }
    setPending({ id: task.id, label: task.title });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => archive(task.id), UNDO_MS);
    // Si le cochage ne s'est pas persisté, le store a rétabli l'état : la tâche
    // s'affiche décochée, et il n'y a plus rien à archiver. Sans cette annulation
    // le minuteur partirait quand même — pour annoncer l'échec d'un geste que
    // l'utilisateur n'a pas fait, ou pire, pour RÉUSSIR si le réseau est revenu
    // entre-temps, envoyant à la corbeille une tâche affichée comme ouverte.
    void patchTask(task.id, { done: true }).then((ok) => {
      if (ok) return;
      window.clearTimeout(timer.current);
      setPending((cur) => (cur && cur.id === task.id ? null : cur));
      dismiss(TOAST_KEY);
    });
    // `durationMs` ne fait que refléter le minuteur ci-dessus : c'est lui, et
    // non le toast, qui décide de l'archivage.
    show({
      key: TOAST_KEY,
      message: `« ${task.title} » terminée`,
      action: { label: 'Annuler', onClick: () => undo(task.id) },
      durationMs: UNDO_MS,
    });
  }

  function onCheck(task: Task) {
    if (task.done) {
      window.clearTimeout(timer.current);
      void patchTask(task.id, { done: false, archived: false });
      setPending((cur) => (cur && cur.id === task.id ? null : cur));
      dismiss(TOAST_KEY);
    } else {
      complete(task);
    }
  }

  return { onCheck };
}
