import { isOpenRow } from './layout';
import type { Task } from './types';

/**
 * Le mode « aujourd'hui » : s'engager sur quelques tâches (#49).
 *
 * Tout le calcul est ici, pur, et le JOUR est un paramètre. C'est ce qui rend
 * testable la seule chose que ce ticket ne peut pas éprouver à la main : le
 * passage de minuit. On ne va pas attendre demain pour savoir si la sélection
 * se vide.
 */

/**
 * Trois, et c'est le sujet du ticket.
 *
 * « Résister à la tentation d'augmenter la limite. La valeur du mode tient à sa
 * contrainte : un focus de quinze tâches n'est plus un focus, c'est la liste
 * qu'on essayait de fuir. »
 */
export const FOCUS_DEFAULT = 3;

/**
 * La borne haute du réglage.
 *
 * Le ticket demande de ne pas encourager au-delà. Une borne technique dit cela
 * mieux qu'un paragraphe d'aide que personne ne lit — et sept laisse la place à
 * un usage légitime (une journée découpée) sans ouvrir la porte à la liste.
 */
export const FOCUS_MAX = 7;

/**
 * Le jour LOCAL, en `YYYY-MM-DD`.
 *
 * ⚠️ Surtout pas `toISOString().slice(0, 10)`, qui donne le jour UTC : à Paris,
 * tout ce qui est fait après 22 h (23 h en hiver) serait attribué au lendemain,
 * et la sélection du soir se viderait sous les doigts de l'utilisateur.
 *
 * `en-CA` rend précisément `YYYY-MM-DD`, ce qui évite d'assembler les morceaux à
 * la main — et donc d'oublier un zéro devant le mois.
 */
export function localDay(now: number = Date.now()): string {
  return new Date(now).toLocaleDateString('en-CA');
}

/** Le jour local d'il y a `n` jours — la fenêtre que `useFocus` charge. */
export function localDayBefore(n: number, now: number = Date.now()): string {
  return localDay(now - n * 24 * 60 * 60 * 1000);
}

/**
 * Les tâches choisies pour `day`, terminées COMPRISES.
 *
 * ⚠️ `isOpenRow` n'est volontairement PAS appliqué ici. Une tâche cochée doit
 * rester dans la liste, marquée faite : la faire disparaître effacerait la preuve
 * de l'avancement, qui est la moitié de l'intérêt de l'écran. La seule exclusion
 * est la suppression — une tâche jetée n'est plus un engagement.
 *
 * Les étapes sont écartées : on s'engage sur une tâche, pas sur une de ses
 * étapes, dont le classement appartient de toute façon au parent (#50).
 */
export function focusToday(tasks: Task[], day: string): Task[] {
  return tasks
    .filter((t) => t.focus_day === day && !t.deleted && !t.parent_id)
    // Ce qui reste à faire d'abord, ce qui est fait ensuite : la liste doit
    // montrer le travail, pas le palmarès.
    .sort((a, b) => Number(a.done) - Number(b.done) || a.title.localeCompare(b.title, 'fr'));
}

/** Combien de places restent libres pour `day`. */
export function focusRemaining(tasks: Task[], day: string, limit: number): number {
  return Math.max(0, limit - focusToday(tasks, day).length);
}

/**
 * Peut-on encore ajouter une tâche à la sélection de `day` ?
 *
 * Rend une RAISON et non un booléen : l'entrée de menu se désactive avec son
 * motif affiché, plutôt que de disparaître. Un blocage muet se lit comme un
 * bug ; un blocage expliqué se lit comme une intention — et l'intention est tout
 * le ticket.
 */
export function focusRefusal(tasks: Task[], day: string, limit: number): string | null {
  if (focusRemaining(tasks, day, limit) > 0) return null;
  return `Déjà ${limit} ${limit > 1 ? 'tâches' : 'tâche'} pour aujourd'hui — c'est la limite que vous vous êtes fixée.`;
}

export interface FocusBilan {
  /** Le jour concerné, en `YYYY-MM-DD`. */
  day: string;
  /** Ce qui a été terminé ce jour-là. */
  done: Task[];
  /** Ce qui est reparti au pot commun — pas « non fait ». */
  returned: Task[];
}

/**
 * Le bilan de la dernière sélection antérieure à `day`.
 *
 * Le jour le plus récent AVANT `day`, et non « hier » : sauter un week-end ne
 * doit pas effacer le bilan du vendredi. Un lundi matin, c'est même le cas le
 * plus fréquent.
 *
 * Rend `null` quand il n'y a rien à raconter — un bilan vide vaut moins que pas
 * de bilan.
 */
export function focusBilan(tasks: Task[], day: string): FocusBilan | null {
  const passees = tasks.filter(
    (t) => !!t.focus_day && t.focus_day < day && !t.deleted && !t.parent_id,
  );
  if (passees.length === 0) return null;

  // Comparaison de chaînes `YYYY-MM-DD` : lexicographique = chronologique, donc
  // aucun `Date.parse` à faire ici.
  const dernier = passees.reduce((max, t) => (t.focus_day! > max ? t.focus_day! : max), '');
  const duJour = passees.filter((t) => t.focus_day === dernier);

  return {
    day: dernier,
    done: duJour.filter((t) => t.done),
    // `isOpenRow` pour « reparti » : ni terminée, ni supprimée, ni une étape.
    returned: duJour.filter((t) => isOpenRow(t)),
  };
}

/** Le libellé français d'un jour `YYYY-MM-DD`, pour le bilan. */
export function focusDayLabel(day: string): string {
  // Midi UTC : assez loin des deux bords pour qu'aucun fuseau ne fasse basculer
  // le jour affiché.
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/* ── Remplir les places libres ──────────────────────────────────────────────── */

/** Ce qui désigne une candidate. Le mot est laissé à l'écran, qui sait dater. */
export type FocusReason = 'overdue' | 'soon' | 'faire' | 'planifier';

export interface FocusCandidate {
  task: Task;
  reason: FocusReason;
}

/** En deçà de quoi une échéance « arrive », en jours. */
const SOON_DAYS = 3;

/**
 * Que proposer pour remplir les places restantes de `day` (#49).
 *
 * L'écran « Aujourd'hui » ne servait qu'à montrer ce qu'on avait déjà choisi :
 * arrivé dessus les mains vides, il n'y avait qu'une phrase pour dire d'aller
 * choisir ailleurs. Proposer n'est pas choisir à la place — la liste est courte,
 * motivée, et rien n'y entre sans un clic.
 *
 * **Seulement « Faire » et « Planifier ».** Proposer une tâche de « Déléguer »
 * serait se la refiler à soi-même, et une d'« Éliminer » contredirait la décision
 * qu'on vient d'y prendre. « À trier » n'a pas encore été jugée : la proposer
 * reviendrait à trancher par la bande.
 *
 * L'ordre dit le motif, du plus contraint au plus libre : ce qui est en retard,
 * ce qui arrive, ce qui est urgent, ce qui est important. À motif égal,
 * l'échéance la plus proche d'abord, puis le classement le plus ancien — la
 * même convention que la revue.
 *
 * `now` est un paramètre, comme partout ici : « dans trois jours » ne se teste
 * pas si la fonction lit l'horloge elle-même.
 */
export function focusCandidates({
  tasks,
  day,
  now = Date.now(),
  limit = 3,
}: {
  tasks: Task[];
  day: string;
  now?: number;
  limit?: number;
}): FocusCandidate[] {
  const soonLimit = now + SOON_DAYS * 24 * 60 * 60 * 1000;

  const reason = (t: Task): FocusReason => {
    const due = t.due_at ? Date.parse(t.due_at) : NaN;
    // Une date illisible ne vaut pas une alerte : la tâche retombe sur sa case.
    if (Number.isFinite(due)) {
      if (due < now) return 'overdue';
      if (due <= soonLimit) return 'soon';
    }
    return t.quadrant === 'faire' ? 'faire' : 'planifier';
  };
  const RANK: Record<FocusReason, number> = { overdue: 0, soon: 1, faire: 2, planifier: 3 };

  return tasks
    .filter(
      (t) =>
        isOpenRow(t) &&
        t.focus_day !== day &&
        (t.quadrant === 'faire' || t.quadrant === 'planifier'),
    )
    .map((task) => ({ task, reason: reason(task) }))
    .sort((a, b) => {
      const r = RANK[a.reason] - RANK[b.reason];
      if (r !== 0) return r;
      // `Infinity` pour une tâche sans échéance : elle passe après toutes celles
      // qui en ont une, au lieu de remonter sur un `NaN` qui ne compare rien.
      const da = a.task.due_at ? Date.parse(a.task.due_at) : Infinity;
      const db = b.task.due_at ? Date.parse(b.task.due_at) : Infinity;
      if (da !== db) return da - db;
      return Date.parse(a.task.quadrant_changed_at) - Date.parse(b.task.quadrant_changed_at);
    })
    .slice(0, limit);
}
