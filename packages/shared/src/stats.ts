import { QUADS, type QuadrantKey } from './quadrants';
import type { Board } from './types';

/**
 * Les statistiques rétrospectives : ce que la matrice promet de révéler (#48).
 *
 * La RPC `completion_stats` rend des FAITS — des sommes et des comptes. Tout ce
 * qui s'en déduit vit ici, pur et testé : les parts, les tendances, les délais
 * moyens, et la phrase qui les résume.
 *
 * ⚠️ LA RÈGLE QUI PROTÈGE LA JUSTESSE DE TOUT CE FICHIER : on ne moyenne jamais
 * des moyennes. Chaque agrégat porte sa somme ET son compte, et la division
 * n'arrive qu'au dernier moment, sur les totaux. Moyenner des moyennes de
 * tailles inégales donne un résultat faux — et faux d'une manière que personne
 * ne remarque jamais, parce que l'ordre de grandeur reste plausible.
 */

/** Les trois périodes offertes. Pas de sélecteur libre : personne ne compare le 3 au 17 mars. */
export type StatsPeriod = '30j' | '3m' | '12m';

export const PERIODS: { key: StatsPeriod; label: string; days: number }[] = [
  { key: '30j', label: '30 jours', days: 30 },
  { key: '3m', label: '3 mois', days: 91 },
  { key: '12m', label: '12 mois', days: 365 },
];

export function periodDays(period: StatsPeriod): number {
  return PERIODS.find((p) => p.key === period)?.days ?? 30;
}

/** Le début de la fenêtre, en ISO — ce que la RPC attend pour `since`. */
export function periodStart(period: StatsPeriod, now: number = Date.now()): string {
  return new Date(now - periodDays(period) * 24 * 60 * 60 * 1000).toISOString();
}

// ── Ce que la RPC rend ──────────────────────────────────────────────────────

export interface QuadrantStat {
  quadrant: QuadrantKey;
  completed: number;
  /** Somme des durées création → complétion. JAMAIS une moyenne (voir l'en-tête). */
  age_seconds_total: number;
}

export interface WeekStat {
  /** Lundi de la semaine, en `YYYY-MM-DD`, tronqué dans le fuseau de l'utilisateur. */
  week: string;
  quadrant: QuadrantKey;
  completed: number;
}

/**
 * ⚠️ `BoardCompletionStat` et non `BoardStat`, contrairement à ses voisines
 * `QuadrantStat` et `WeekStat`.
 *
 * `review.ts` exporte déjà un `BoardStat` — les faits par matrice de la revue
 * périodique (dernière activité, état d'« Éliminer »), qui n'ont rien à voir
 * avec une ligne de complétion. Deux `export *` dans `index.ts` ne peuvent pas
 * porter le même nom : l'ambiguïté ne casse pas seulement ce type, elle fait
 * sauter le re-export du module ENTIER, et tout `@penduline/shared` cesse
 * d'exposer les symboles de statistiques. Le lot compilait pourtant en local —
 * il a été écrit avant que la revue n'atterrisse.
 */
export interface BoardCompletionStat {
  board_id: string;
  quadrant: QuadrantKey;
  completed: number;
  age_seconds_total: number;
}

export interface CompletionStats {
  by_quadrant: QuadrantStat[];
  by_week: WeekStat[];
  by_board: BoardCompletionStat[];
}

const EMPTY_STATS: CompletionStats = { by_quadrant: [], by_week: [], by_board: [] };

const QUAD_KEYS = new Set<string>([...QUADS.map((q) => q.key), 'parking']);

function isQuadrantKey(v: unknown): v is QuadrantKey {
  return typeof v === 'string' && QUAD_KEYS.has(v);
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lit ce que la RPC a rendu, sans faire confiance à sa forme.
 *
 * Le `jsonb` n'a AUCUN typage à la frontière : PostgREST le livre en `unknown`,
 * et une évolution du SQL — une clé renommée, un agrégat qui devient `null` —
 * ne casserait ni la compilation ni le build. Elle casserait l'écran, à
 * l'exécution, chez l'utilisateur.
 *
 * D'où une lecture défensive champ par champ : ce qui n'est pas de la forme
 * attendue est ignoré, et une section absente devient un tableau vide. L'écran
 * affiche alors « rien sur cette période », ce qui est faux mais lisible —
 * plutôt qu'une page blanche, qui ne dit rien du tout.
 */
export function parseCompletionStats(raw: unknown): CompletionStats {
  if (!raw || typeof raw !== 'object') return EMPTY_STATS;
  const o = raw as Record<string, unknown>;

  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

  return {
    by_quadrant: arr(o.by_quadrant)
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .filter((e) => isQuadrantKey(e.quadrant))
      .map((e) => ({
        quadrant: e.quadrant as QuadrantKey,
        completed: num(e.completed),
        age_seconds_total: num(e.age_seconds_total),
      })),
    by_week: arr(o.by_week)
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .filter((e) => isQuadrantKey(e.quadrant) && typeof e.week === 'string')
      .map((e) => ({
        week: e.week as string,
        quadrant: e.quadrant as QuadrantKey,
        completed: num(e.completed),
      })),
    by_board: arr(o.by_board)
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .filter((e) => isQuadrantKey(e.quadrant) && typeof e.board_id === 'string')
      .map((e) => ({
        board_id: e.board_id as string,
        quadrant: e.quadrant as QuadrantKey,
        completed: num(e.completed),
        age_seconds_total: num(e.age_seconds_total),
      })),
  };
}

// ── Les quatre lectures ─────────────────────────────────────────────────────

export interface QuadrantShare {
  quadrant: QuadrantKey;
  label: string;
  ink: string;
  completed: number;
  /** Part du total terminé, en pourcentage entier. */
  share: number;
  /** Délai moyen création → complétion, en jours. `null` si rien de terminé. */
  avgDays: number | null;
}

export interface WeekPoint {
  week: string;
  /** Compte par case, TOUTES les cases présentes — zéro compris. */
  byQuadrant: Record<QuadrantKey, number>;
  total: number;
}

export interface BoardShare {
  boardId: string;
  name: string;
  completed: number;
  avgDays: number | null;
  /** La case dont cette matrice a le plus terminé — ce qui la caractérise. */
  dominant: QuadrantKey | null;
}

export interface StatsReadings {
  /** Toutes les cases, dans l'ordre d'affichage, y compris celles à zéro. */
  byQuadrant: QuadrantShare[];
  weeks: WeekPoint[];
  boards: BoardShare[];
  total: number;
  /** Délai moyen toutes cases confondues. Calculé sur les TOTAUX, jamais moyenné. */
  avgDays: number | null;
}

const SECONDS_PER_DAY = 24 * 60 * 60;

/** Arrondi à un chiffre après la virgule — au-delà, on donne une fausse précision. */
function toDays(totalSeconds: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round((totalSeconds / count / SECONDS_PER_DAY) * 10) / 10;
}

/** Toutes les cases à zéro — la base sur laquelle on accumule. */
function zeroByQuadrant(): Record<QuadrantKey, number> {
  return { faire: 0, planifier: 0, deleguer: 0, eliminer: 0, parking: 0 };
}

/**
 * Toutes les semaines de la fenêtre, du lundi le plus ancien au plus récent.
 *
 * ⚠️ Les semaines SANS complétion doivent exister, à zéro. La RPC ne les rend
 * pas — un `group by` ne produit rien pour un groupe vide — et une courbe qui
 * saute les semaines creuses ment : deux points éloignés d'un mois s'affichent
 * côte à côte, et une période d'inactivité devient invisible. C'est exactement
 * ce qu'un écran rétrospectif doit montrer.
 */
function weekKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return keys;
  for (let t = start; t <= end; t += 7 * 24 * 60 * 60 * 1000) {
    keys.push(new Date(t).toISOString().slice(0, 10));
  }
  return keys;
}

export function statsReadings({
  stats,
  boards,
}: {
  stats: CompletionStats;
  boards: Board[];
}): StatsReadings {
  const total = stats.by_quadrant.reduce((n, q) => n + q.completed, 0);
  const ageTotal = stats.by_quadrant.reduce((n, q) => n + q.age_seconds_total, 0);

  const statByQuad = new Map(stats.by_quadrant.map((q) => [q.quadrant, q]));

  // Toutes les cases, y compris à zéro : une case absente de la liste se lirait
  // comme une case qu'on a oublié d'afficher, pas comme une case vide.
  const byQuadrant: QuadrantShare[] = QUADS.map((q) => {
    const s = statByQuad.get(q.key);
    const completed = s?.completed ?? 0;
    return {
      quadrant: q.key,
      label: q.label,
      ink: q.ink,
      completed,
      share: total > 0 ? Math.round((completed / total) * 100) : 0,
      avgDays: toDays(s?.age_seconds_total ?? 0, completed),
    };
  });

  // ── Semaines, trous comblés ───────────────────────────────────────────────
  const weekMap = new Map<string, WeekPoint>();
  for (const w of stats.by_week) {
    let point = weekMap.get(w.week);
    if (!point) {
      point = { week: w.week, byQuadrant: zeroByQuadrant(), total: 0 };
      weekMap.set(w.week, point);
    }
    point.byQuadrant[w.quadrant] += w.completed;
    point.total += w.completed;
  }
  const present = [...weekMap.keys()].sort();
  const weeks: WeekPoint[] =
    present.length === 0
      ? []
      : weekKeys(present[0], present[present.length - 1]).map(
          (k) => weekMap.get(k) ?? { week: k, byQuadrant: zeroByQuadrant(), total: 0 },
        );

  // ── Matrices ──────────────────────────────────────────────────────────────
  const perBoard = new Map<string, { completed: number; age: number; quads: Map<QuadrantKey, number> }>();
  for (const b of stats.by_board) {
    let agg = perBoard.get(b.board_id);
    if (!agg) {
      agg = { completed: 0, age: 0, quads: new Map() };
      perBoard.set(b.board_id, agg);
    }
    agg.completed += b.completed;
    agg.age += b.age_seconds_total;
    agg.quads.set(b.quadrant, (agg.quads.get(b.quadrant) ?? 0) + b.completed);
  }

  const boardName = new Map(boards.map((b) => [b.id, b.name]));
  const boardShares: BoardShare[] = [...perBoard.entries()]
    // Une matrice supprimée depuis un autre appareil garde des complétions en
    // base mais n'a plus de nom : on la tait plutôt que d'afficher un UUID.
    .filter(([id]) => boardName.has(id))
    .map(([id, agg]) => {
      let dominant: QuadrantKey | null = null;
      let best = 0;
      for (const [key, n] of agg.quads) {
        if (n > best) {
          best = n;
          dominant = key;
        }
      }
      return {
        boardId: id,
        name: boardName.get(id) ?? '',
        completed: agg.completed,
        // Division sur les totaux de LA matrice — pas une moyenne des moyennes
        // de ses cases, qui donnerait un autre chiffre, et un faux.
        avgDays: toDays(agg.age, agg.completed),
        dominant,
      };
    })
    .sort((a, b) => b.completed - a.completed);

  return {
    byQuadrant,
    weeks,
    boards: boardShares,
    total,
    avgDays: toDays(ageTotal, total),
  };
}

// ── Le constat en clair ─────────────────────────────────────────────────────

/** En dessous, on se taît : généraliser sur trois tâches n'est pas une statistique. */
export const SENTENCE_MIN = 5;

/**
 * Ce que les chiffres disent, en une phrase.
 *
 * ⚠️ TON. Le ticket exige « factuel », « pas vocation à noter son utilisateur »,
 * et donne pourtant en exemple « tu éteins des incendies » — qui juge. Arbitrage
 * retenu : on énonce d'abord le FAIT mesuré, puis on propose une lecture, et on
 * ne qualifie jamais la personne. « Beaucoup de choses vous arrivent avant
 * d'être planifiées » décrit une situation ; « tu éteins des incendies » décrit
 * quelqu'un.
 *
 * Rend `null` quand la matière est trop mince, plutôt qu'une phrase prudente :
 * une phrase creuse abîme la confiance dans toutes les autres.
 */
export function statsSentence(readings: StatsReadings): string | null {
  if (readings.total < SENTENCE_MIN) return null;

  const ranked = [...readings.byQuadrant].sort((a, b) => b.completed - a.completed);
  const top = ranked[0];
  if (!top || top.completed === 0) return null;

  const part = `${top.share} % de ce que vous avez terminé venait de « ${top.label} ».`;

  const lecture: Record<QuadrantKey, string> = {
    faire:
      "C'est la case de l'urgence — beaucoup de choses vous arrivent avant d'avoir pu être planifiées.",
    planifier:
      "C'est la case de l'important sans urgence : le travail y arrive avant d'y devenir pressant.",
    deleguer:
      "C'est la case de l'urgent sans importance — du temps pris par ce qui pressait quelqu'un d'autre.",
    eliminer:
      'Cette case sert à écarter, pas à faire : y terminer beaucoup de tâches signifie souvent quʼelles y ont été classées après coup.',
    parking: "Ces tâches ont été terminées sans passer par un classement.",
  };

  // Le délai moyen n'est ajouté que s'il éclaire quelque chose — et « Planifier »
  // lent est le fonctionnement NORMAL de la méthode, pas un retard. On le dit,
  // sinon le chiffre se lit comme un reproche.
  const delai =
    top.avgDays === null
      ? ''
      : top.quadrant === 'planifier'
        ? ` Ces tâches ont attendu ${fr(top.avgDays)} jours en moyenne, ce qui est le rythme attendu de cette case.`
        : ` Ces tâches ont attendu ${fr(top.avgDays)} jours en moyenne.`;

  return `${part} ${lecture[top.quadrant]}${delai}`;
}

/** Une décimale, virgule française. */
function fr(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}
