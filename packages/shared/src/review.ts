import { isOpenRow } from './layout';
import type { Board, Task } from './types';

/**
 * La revue périodique : cinq lectures de ce que l'usage quotidien masque (#47).
 *
 * TOUT le calcul vit ici, pur, et `now` est un paramètre. Un calcul de dates qui
 * lit l'horloge lui-même ne se teste pas — on ne peut pas fabriquer « il y a
 * trente jours » sans déplacer le présent. Même convention que `isFreshCapture`.
 *
 * ⚠️ LES CINQ SIGNAUX NE FORMENT PAS UNE PARTITION, et c'est voulu. Une tâche
 * peut apparaître dans deux d'entre eux — typiquement une tâche coincée dans
 * « Faire » depuis quarante jours, qui est à la fois « jamais reclassée » et
 * « une urgence qui n'en était pas une ». Ce sont deux constats différents sur
 * le même objet, pas un doublon à dédupliquer. Ne pas « corriger » ça.
 *
 * La seule exception est documentée sur `neverMoved` ci-dessous.
 */

/** Les seuils, tous réglables. Un jour dans l'interface, aujourd'hui en mémoire. */
export interface ReviewThresholds {
  /** Ancienneté au-delà de laquelle une tâche « À trier » compte comme repoussée. */
  parkingDays: number;
  /** Ancienneté du dernier changement de case au-delà de laquelle le classement dort. */
  neverMovedDays: number;
  /** Durée passée dans « Faire » au-delà de laquelle l'urgence est douteuse. */
  doingDays: number;
  /** Silence d'une matrice au-delà duquel on la signale. */
  dormantDays: number;
  /** En dessous de ce nombre de tâches, un « Éliminer » qui ne se vide pas n'est pas un signal. */
  eliminerMin: number;
  /** Temps sans aucune sortie d'« Éliminer » au-delà duquel la case est dite bouchée. */
  eliminerStaleDays: number;
}

/**
 * Des défauts sensés, pas ronds par hasard :
 * deux semaines pour trier, un mois pour reconsidérer un classement, une semaine
 * pour une urgence (au-delà, ce n'en était pas une), trois semaines de silence
 * pour une matrice.
 */
export const DEFAULT_THRESHOLDS: ReviewThresholds = {
  parkingDays: 14,
  neverMovedDays: 30,
  doingDays: 7,
  dormantDays: 21,
  eliminerMin: 3,
  eliminerStaleDays: 30,
};

/**
 * Les faits par matrice que le client ne peut pas calculer lui-même.
 *
 * Depuis #40 il ne charge que les tâches ouvertes : la dernière activité toutes
 * tâches confondues et l'état d'« Éliminer » demandent les archives. La RPC
 * `review_boards()` les rend, et ne rend QUE des faits — les seuils sont
 * appliqués ici, où ils sont testés.
 *
 * Les noms suivent le SQL (`snake_case`) parce que PostgREST les livre ainsi.
 */
export interface BoardStat {
  board_id: string;
  /** `max(updated_at)` sur toutes les tâches, étapes comprises. `null` = aucune tâche. */
  last_activity: string | null;
  eliminer_open: number;
  /** Dernière sortie d'« Éliminer ». `null` = jamais rien n'en est sorti. */
  eliminer_last_cleared: string | null;
}

export type ReviewSignalKey = 'parking' | 'neverMoved' | 'doing' | 'dormant' | 'eliminer';

interface SignalBase {
  key: ReviewSignalKey;
  /** Ce qu'on affiche en titre. Décrit la MESURE, pas le jugement. */
  label: string;
  /** Ce que le signal révèle, en une phrase. */
  hint: string;
  /** Ce qu'on affiche quand il n'y a rien. Un signal à zéro est une information. */
  empty: string;
  /** Réserve à afficher sous le signal, quand la mesure a une limite connue. */
  note?: string;
}

export interface TaskSignal extends SignalBase {
  kind: 'tasks';
  tasks: Task[];
}

export interface BoardSignal extends SignalBase {
  kind: 'boards';
  boards: Board[];
}

export type ReviewSignal = TaskSignal | BoardSignal;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Âge en jours d'un horodatage ISO.
 *
 * Une date illisible rend `null` plutôt que `NaN` : `NaN >= seuil` est `false`,
 * donc la tâche disparaîtrait silencieusement du signal. Un `null` explicite
 * force l'appelant à décider, et il décide de l'exclure — mais en le disant.
 *
 * Une date dans le futur rend un âge négatif, jamais franchi par un seuil
 * positif. C'est le bon comportement : une horloge remise à l'heure ne doit pas
 * remplir la revue.
 */
export function ageInDays(iso: string | null, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return (now - t) / DAY_MS;
}

/** `true` si l'horodatage est lisible ET plus vieux que `days`. */
function olderThan(iso: string | null, days: number, now: number): boolean {
  const age = ageInDays(iso, now);
  return age !== null && age >= days;
}

/** Du plus ancien au plus récent — ce qui traîne le plus se lit en premier. */
function byOldest(key: (t: Task) => string) {
  return (a: Task, b: Task) => Date.parse(key(a)) - Date.parse(key(b));
}

export function reviewSignals({
  tasks,
  boards,
  stats,
  thresholds = DEFAULT_THRESHOLDS,
  now = Date.now(),
}: {
  tasks: Task[];
  boards: Board[];
  stats: BoardStat[];
  thresholds?: ReviewThresholds;
  now?: number;
}): ReviewSignal[] {
  // `isOpenRow` et non un filtre maison : il exclut déjà les terminées, les
  // supprimées ET les étapes. Une étape n'est pas une ligne de revue — son
  // classement appartient à son parent.
  const open = tasks.filter(isOpenRow);
  const byBoard = new Map(stats.map((s) => [s.board_id, s]));

  const parking = open
    .filter((t) => t.quadrant === 'parking' && olderThan(t.created_at, thresholds.parkingDays, now))
    // `created_at` et non `quadrant_changed_at` : ce qui compte au parking est
    // l'âge de la tâche, pas celui de son non-classement. Une tâche déposée là
    // il y a un mois n'en est pas sortie, quoi qu'il lui soit arrivé d'autre.
    .sort(byOldest((t) => t.created_at));

  const neverMoved = open
    .filter(
      (t) =>
        // « À trier » est exclue, seule dérogation à la non-partition annoncée
        // plus haut : une tâche du parking jamais reclassée est exactement le
        // signal précédent. L'y laisser la ferait compter deux fois pour un seul
        // et même constat, là où les autres recoupements disent deux choses.
        t.quadrant !== 'parking' &&
        olderThan(t.quadrant_changed_at, thresholds.neverMovedDays, now),
    )
    .sort(byOldest((t) => t.quadrant_changed_at));

  const doing = open
    .filter(
      (t) => t.quadrant === 'faire' && olderThan(t.quadrant_changed_at, thresholds.doingDays, now),
    )
    // `quadrant_changed_at` : la question est « depuis quand est-elle dans
    // Faire ? », pas « quand a-t-elle été créée ? ». Une tâche ancienne promue
    // urgente hier n'a rien à faire ici.
    .sort(byOldest((t) => t.quadrant_changed_at));

  // Une matrice SANS AUCUNE TÂCHE n'a pas de ligne dans `stats` (le `group by`
  // ne produit rien) : elle est vide, pas dormante. La signaler enverrait tout
  // utilisateur venant de créer une matrice consulter une revue qui lui reproche
  // de ne pas l'avoir remplie.
  const dormant = boards
    .filter((b) => {
      const s = byBoard.get(b.id);
      return !!s && olderThan(s.last_activity, thresholds.dormantDays, now);
    })
    .sort((a, b) => {
      const sa = byBoard.get(a.id)?.last_activity ?? null;
      const sb = byBoard.get(b.id)?.last_activity ?? null;
      return Date.parse(sa ?? '') - Date.parse(sb ?? '');
    });

  const eliminer = boards
    .filter((b) => {
      const s = byBoard.get(b.id);
      if (!s || s.eliminer_open < thresholds.eliminerMin) return false;
      // Jamais rien sorti d'« Éliminer » compte comme bouché — c'est même le cas
      // le plus net. `null` ne peut donc pas être traité comme « pas de signal ».
      if (s.eliminer_last_cleared === null) return true;
      return olderThan(s.eliminer_last_cleared, thresholds.eliminerStaleDays, now);
    })
    .sort((a, b) => (byBoard.get(b.id)?.eliminer_open ?? 0) - (byBoard.get(a.id)?.eliminer_open ?? 0));

  return [
    {
      kind: 'tasks',
      key: 'parking',
      tasks: parking,
      label: `À trier depuis plus de ${thresholds.parkingDays} jours`,
      hint: 'Le tri est repoussé.',
      empty: 'Rien ne traîne au parking.',
    },
    {
      kind: 'tasks',
      key: 'neverMoved',
      tasks: neverMoved,
      label: `Jamais reclassées depuis ${thresholds.neverMovedDays} jours`,
      hint: 'Un classement posé une fois et jamais remis en cause.',
      empty: 'Tous les classements ont été revus récemment.',
      // La mesure est neuve : avant la migration #47, aucun changement de case
      // n'était enregistré. Le taire ferait passer un signal vide pour un bilan.
      note: 'Mesuré depuis la mise en place du suivi des déplacements de case.',
    },
    {
      kind: 'tasks',
      key: 'doing',
      tasks: doing,
      label: `Dans « Faire » depuis plus de ${thresholds.doingDays} jours`,
      hint: "Une urgence qui n'en était peut-être pas une.",
      empty: 'Rien ne s’éternise dans « Faire ».',
    },
    {
      kind: 'boards',
      key: 'dormant',
      boards: dormant,
      label: `Matrices sans activité depuis ${thresholds.dormantDays} jours`,
      hint: "Un contexte qui n'existe peut-être plus.",
      empty: 'Toutes les matrices ont bougé récemment.',
    },
    {
      kind: 'boards',
      key: 'eliminer',
      boards: eliminer,
      label: '« Éliminer » qui se remplit sans se vider',
      hint: 'Des décisions prises mais pas assumées.',
      empty: '« Éliminer » se vide.',
    },
  ];
}

/** Combien d'éléments un signal porte, sans avoir à ouvrir son union. */
export function signalCount(signal: ReviewSignal): number {
  return signal.kind === 'tasks' ? signal.tasks.length : signal.boards.length;
}
