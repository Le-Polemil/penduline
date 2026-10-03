import { isOpenRow } from './layout';
import type { QuadrantKey } from './quadrants';
import { ageInDays, type ReviewSignal, type ReviewSignalKey } from './review';
import type { BoardRange, Task } from './types';

/**
 * Ce que l'en-tête de l'accueil dit du jour : la date, une phrase, et le
 * compte de chaque case.
 *
 * Tout est pur et `now` est un paramètre, comme dans `review.ts` : un titre qui
 * dépend de l'heure ne se teste pas s'il lit l'horloge lui-même.
 *
 * ⚠️ La phrase est un GABARIT, pas une génération. Elle ne nomme aucune tâche :
 * glisser un titre libre dans une phrase demande des accords (« la fuite », « le
 * dossier ») qu'un gabarit ne sait pas faire. Elle ne dit que ce qu'elle sait
 * compter.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const NOMBRES = ['Rien', 'Une chose', 'Deux choses', 'Trois choses', 'Quatre choses', 'Cinq choses',
  'Six choses', 'Sept choses', 'Huit choses', 'Neuf choses', 'Dix choses'];

/** Les tâches ouvertes de chaque case, toutes matrices confondues. Les étapes ne comptent pas. */
export function quadrantTotals(tasks: Task[]): Record<QuadrantKey, number> {
  const out: Record<QuadrantKey, number> = { faire: 0, planifier: 0, deleguer: 0, eliminer: 0, parking: 0 };
  for (const t of tasks) if (isOpenRow(t)) out[t.quadrant] += 1;
  return out;
}

/**
 * La phrase du jour, tirée du seul compte de « Faire ».
 *
 * « Faire » et non « Aujourd'hui » : l'engagement du jour est une lentille à
 * part, et un compte vide un matin où rien n'a encore été choisi ferait croire
 * qu'il n'y a rien d'urgent.
 */
export function dayHeadline(tasks: Task[]): string {
  const n = quadrantTotals(tasks).faire;
  if (n === 0) return 'Rien d’urgent. Le reste peut attendre.';
  const nombre = n < NOMBRES.length ? NOMBRES[n] : `${n} choses`;
  return `${nombre} à faire. Le reste peut attendre.`;
}

/** « Vendredi 2 octobre » — la date telle qu'on la dit, majuscule comprise. */
export function dayLabel(now: number): string {
  const s = new Date(now).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ── Les suggestions de l'accueil (« Ça stagne ») ────────────────────────────── */

/**
 * Une suggestion est UN élément d'UN signal de la revue, rendu actionnable.
 *
 * Aucun seuil n'est redéfini ici : les signaux arrivent de `reviewSignals`, déjà
 * filtrés et triés du plus ancien au plus récent. L'accueil n'en montre qu'une
 * poignée — la revue reste l'endroit où tout se voit.
 */
export type Suggestion =
  | { key: string; kind: 'parking' | 'neverMoved' | 'doing'; task: Task; days: number | null }
  | { key: string; kind: 'dormant' | 'eliminer'; board: BoardRange; days: number | null };

/**
 * L'ordre de lecture : ce qui demande un geste immédiat d'abord. Une urgence qui
 * dure et une tâche jamais triée se règlent en un clic ; une matrice endormie
 * demande d'y entrer.
 */
const ORDER: ReviewSignalKey[] = ['doing', 'parking', 'neverMoved', 'eliminer', 'dormant'];

/** La clé de mise en sommeil — par signal ET par objet : se taire sur l'un ne tait pas l'autre. */
export function suggestionKey(kind: ReviewSignalKey, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Choisit au plus `limit` suggestions, en alternant les signaux.
 *
 * L'alternance plutôt que l'ordre brut : un signal très rempli (trente tâches
 * jamais reclassées au lendemain d'une migration) masquerait sinon tous les
 * autres, et l'accueil ne parlerait plus que de ça.
 *
 * `snoozed` associe une clé à la date (ISO) jusqu'à laquelle on se tait.
 */
export function homeSuggestions({
  signals,
  snoozed = {},
  limit = 4,
  now = Date.now(),
  boardDays = {},
}: {
  signals: ReviewSignal[];
  snoozed?: Record<string, string>;
  limit?: number;
  now?: number;
  /** Ancienneté (en jours) à afficher pour les signaux de matrice, que la revue calcule côté serveur. */
  boardDays?: Record<string, number | null>;
}): Suggestion[] {
  const asleep = (key: string) => {
    const until = snoozed[key];
    if (!until) return false;
    const t = Date.parse(until);
    return Number.isFinite(t) && t > now;
  };

  const queues: Suggestion[][] = ORDER.map((kind) => {
    const signal = signals.find((s) => s.key === kind);
    if (!signal) return [];
    if (signal.kind === 'tasks') {
      const stamp = (t: Task) => (kind === 'parking' ? t.created_at : t.quadrant_changed_at);
      return signal.tasks
        .map((task) => ({
          key: suggestionKey(kind, task.id),
          kind: kind as 'parking' | 'neverMoved' | 'doing',
          task,
          days: wholeDays(ageInDays(stamp(task), now)),
        }))
        .filter((s) => !asleep(s.key));
    }
    return signal.boards
      .map((board) => ({
        key: suggestionKey(kind, board.id),
        kind: kind as 'dormant' | 'eliminer',
        board,
        days: boardDays[board.id] ?? null,
      }))
      .filter((s) => !asleep(s.key));
  });

  // Une même tâche peut figurer dans deux signaux (cf. `review.ts`) : à l'accueil,
  // une seule ligne par objet suffit — la première, la plus actionnable.
  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (let round = 0; out.length < limit; round++) {
    let any = false;
    for (const q of queues) {
      const s = q[round];
      if (!s) continue;
      any = true;
      const id = 'task' in s ? s.task.id : s.board.id;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(s);
      if (out.length >= limit) break;
    }
    if (!any) break;
  }
  return out;
}

function wholeDays(days: number | null): number | null {
  return days === null ? null : Math.floor(days);
}

/** « 3 semaines », « 16 jours », « hier » — l'ancienneté telle qu'on la dit. */
export function sinceLabel(days: number | null): string {
  if (days === null) return '';
  if (days <= 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  if (days < 14) return `${days} jours`;
  if (days < 60) return `${Math.floor(days / 7)} semaines`;
  return `${Math.floor(days / 30)} mois`;
}

/** Date ISO, `days` jours après `now` — l'échéance d'une mise en sommeil. */
export function snoozeUntil(now: number, days = 30): string {
  return new Date(now + days * DAY_MS).toISOString();
}
