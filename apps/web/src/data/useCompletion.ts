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
 * La tâche dont l'annulation est encore offerte, et **de quoi la défaire**.
 *
 * Ce n'est pas qu'un identifiant : l'écriture ayant déjà eu lieu, l'annulation
 * doit savoir quoi réécrire. En particulier le `pair_id`, rompu des deux côtés
 * au moment de cocher (cf. `complete`).
 */
interface Pending {
  id: string;
  /** La partenaire dont le lien a été rompu, s'il y en avait une. */
  mateId: string | null;
  /** Le lien à rétablir. `null` si la tâche n'était pas appairée. */
  pairId: string | null;
}

/**
 * Le cycle cocher → annuler → archiver.
 *
 * Cocher ne fait plus qu'**une seule écriture**, à l'état final : `done` et
 * `archived` ensemble. Les quatre secondes d'annulation restent, mais elles
 * vivent désormais **en mémoire** — l'écran continue d'afficher la tâche parce
 * qu'il la sait en attente (`pending`, passé aux filtres de rendu), plus parce
 * que la base la déclarerait non archivée.
 *
 * ⚠️ C'est le correctif de #75, et il est de nature, pas de degré. Auparavant,
 * `archived` s'écrivait quatre secondes après `done`, et un `setTimeout` portait
 * cette seconde écriture — détruit au démontage de l'écran. Quitter la matrice
 * dans le délai laissait donc en base un état intermédiaire que la règle
 * d'affichage montrait **pour toujours**.
 *
 * On ne cherche pas à faire survivre le minuteur (persistance de l'échéance,
 * rejeu au chargement : autant de réponses au mauvais problème). On lui **retire
 * sa responsabilité**. Il ne fait plus qu'oublier un état local — mourir
 * n'importe quand est désormais sans conséquence, ce qui est tout l'objet du
 * correctif.
 *
 * Sorti de l'écran matrice pour que la vue globale coche exactement pareil. Deux
 * copies de ce minuteur auraient dérivé, comme la règle d'appairage avant elles.
 */
export function useCompletion(
  tasks: Task[],
  patchTask: (id: string, patch: TaskPatch) => Promise<boolean>,
) {
  const [pending, setPending] = useState<Pending | null>(null);
  const timer = useRef<number>();
  const { show, dismiss } = useToast();

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /**
   * Clore l'attente. **N'écrit rien** : la base est déjà à l'état final depuis le
   * clic. C'est précisément ce qui rend le démontage inoffensif.
   */
  function settle(id: string) {
    setPending((cur) => (cur && cur.id === id ? null : cur));
    dismiss(TOAST_KEY);
  }

  /**
   * L'annulation — un vrai retour en arrière, appairage compris.
   *
   * ⚠️ `pair_id` n'est pas décoratif ici. Cocher dissocie la paire (l'archivage
   * étant devenu immédiat, la dissociation l'est aussi) : un `undo` qui ne
   * réécrirait que `done` et `archived` laisserait les deux liens à `null`. Les
   * deux cartes seraient toujours là, mais la paire serait cassée **en silence**
   * — l'invariant que #51 et #60 ont coûté cher à établir, et le genre de
   * rupture qu'aucun test d'affichage n'attrape.
   */
  function undo(p: Pending) {
    window.clearTimeout(timer.current);
    void patchTask(p.id, { done: false, archived: false, pair_id: p.pairId });
    if (p.mateId) void patchTask(p.mateId, { pair_id: p.pairId });
    settle(p.id);
  }

  function complete(task: Task) {
    // Cocher une deuxième tâche pendant le délai : la première est déjà écrite à
    // son état final, il n'y a plus qu'à clore son attente. Un seul toast à la
    // fois, et pas d'annulation qui traîne sans cible visible.
    if (pending) {
      window.clearTimeout(timer.current);
      settle(pending.id);
    }

    // Une seule écriture, état final compris. `planPairDetach` emmène la
    // partenaire : une tâche qui part ne doit pas laisser de `pair_id` orphelin.
    const writes = planPairDetach(tasks, task, { done: true, archived: true, pinned: false });
    const entry: Pending = { id: task.id, mateId: writes[1]?.id ?? null, pairId: task.pair_id };

    setPending(entry);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => settle(task.id), UNDO_MS);

    // Si l'écriture ne passe pas, le store a rétabli l'état : la tâche s'affiche
    // décochée, et il n'y a plus rien à attendre. Sans cette clôture, le toast
    // proposerait d'annuler un geste qui n'a pas eu lieu.
    void Promise.all(writes.map((w) => patchTask(w.id, w.patch))).then(([ok]) => {
      if (!ok) settle(task.id);
    });

    // `durationMs` ne fait que refléter le minuteur ci-dessus.
    show({
      key: TOAST_KEY,
      message: `« ${task.title} » terminée`,
      action: { label: 'Annuler', onClick: () => undo(entry) },
      durationMs: UNDO_MS,
    });
  }

  function onCheck(task: Task) {
    if (!task.done) return complete(task);
    // Une tâche cochée n'est visible que le temps de son délai : la décocher,
    // c'est annuler — avec tout ce que cela implique, `pair_id` compris.
    if (pending && pending.id === task.id) return undo(pending);
    // Filet pour une tâche cochée atteinte par un autre chemin (donnée héritée
    // du temps où l'état intermédiaire était persisté).
    window.clearTimeout(timer.current);
    void patchTask(task.id, { done: false, archived: false });
    settle(task.id);
  }

  /** `pending` ne sort que pour le RENDU : les filtres de position l'ignorent. */
  return { onCheck, pending: pending?.id ?? null };
}
