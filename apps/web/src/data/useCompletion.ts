import { useEffect, useRef, useState } from 'react';
import { planPairDetach, type Task, type TaskPatch } from '@penduline/shared';

/** Délai d'annulation avant que la tâche cochée ne parte à la corbeille. */
const UNDO_MS = 4000;

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
 */
export function useCompletion(tasks: Task[], patchTask: (id: string, patch: TaskPatch) => void) {
  /** La tâche cochée dont l'annulation est encore offerte, et son libellé pour le toast. */
  const [pending, setPending] = useState<{ id: string; label: string } | null>(null);
  const timer = useRef<number>();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function archive(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) {
      for (const w of planPairDetach(tasks, task, { archived: true, pinned: false })) {
        patchTask(w.id, w.patch);
      }
    }
    setPending((cur) => (cur && cur.id === id ? null : cur));
  }

  function complete(task: Task) {
    // Cocher une deuxième tâche pendant le délai archive la première sur-le-champ :
    // un seul toast à la fois, et pas d'annulation qui traîne sans cible visible.
    if (pending) {
      window.clearTimeout(timer.current);
      archive(pending.id);
    }
    patchTask(task.id, { done: true });
    setPending({ id: task.id, label: task.title });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => archive(task.id), UNDO_MS);
  }

  function onCheck(task: Task) {
    if (task.done) {
      window.clearTimeout(timer.current);
      patchTask(task.id, { done: false, archived: false });
      setPending((cur) => (cur && cur.id === task.id ? null : cur));
    } else {
      complete(task);
    }
  }

  function undo() {
    if (!pending) return;
    window.clearTimeout(timer.current);
    patchTask(pending.id, { done: false, archived: false });
    setPending(null);
  }

  return { pending, onCheck, undo };
}
