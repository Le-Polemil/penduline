import { isOpenRow } from './layout';
import { QUADS, type QuadrantKey } from './quadrants';
import type { Task } from './types';

/**
 * « Objectifs » : est-ce que chaque case sert à ce qu'elle promet ?
 *
 * ⚠️ CE N'EST PAS UN COMPTEUR DE PRODUCTIVITÉ, et la nuance porte tout l'écran.
 * La rétrospective dit COMBIEN on a terminé ; ici on ne mesure que la MANIÈRE.
 * Une tâche de « Planifier » cochée sans avoir jamais eu d'échéance a bien été
 * faite — elle ne rapporte rien, parce que la case n'a servi à rien. Une tâche
 * d'« Éliminer » cochée coûte des points alors qu'elle a été accomplie : on a
 * dépensé du temps sur ce qu'on venait de juger sans valeur.
 *
 * Chaque case a donc UN usage optimal, qui vaut plein tarif, et des usages
 * dégradés qui valent moins. L'échelle suit l'effort que la case demande CONTRE
 * l'instinct : déléguer et planifier sont les deux gestes que personne ne fait
 * spontanément, ils rapportent le plus.
 *
 * Tout est pur et `now` est un paramètre, comme dans `review.ts` et `focus.ts` :
 * un barème qui lit l'horloge lui-même ne se teste pas.
 */

/* ── Les seuils ─────────────────────────────────────────────────────────────── */

/**
 * ⚠️ ILS VIVENT ICI ET NULLE PART AILLEURS. `goal_stats` rend des faits — une
 * durée en secondes, un booléen — et n'applique aucun seuil. La règle vient de
 * `review_boards` : les dupliquer en SQL serait deux vérités à tenir à jour, et
 * celle des deux qui dérive est toujours celle qu'on ne relit pas.
 */
export const GOAL_THRESHOLDS = {
  /** Au-delà, une tâche de « Faire » n'était pas une urgence. */
  faireDays: 7,
  /** Une passation prend des minutes : au-delà, on l'a gardée. */
  deleguerDays: 3,
  /** Une tâche de « Déléguer » encore ouverte après ça n'a été passée à personne. */
  deleguerStaleDays: 14,
  /** Le parking est une salle d'attente, pas une case : au-delà, elle est squattée. */
  parkingDays: 14,
};

/* ── Ce que le serveur rend ─────────────────────────────────────────────────── */

/**
 * Une tâche finie, telle que `goal_stats` la décrit. Les noms suivent le SQL
 * (`snake_case`) parce que PostgREST les livre ainsi.
 */
export interface GoalFact {
  quadrant: QuadrantKey;
  /** `true` = elle a disparu ; `false` = elle a été cochée. */
  deleted: boolean;
  /** Temps passé dans la case avant d'en sortir. `null` = non mesurable (#47). */
  in_quadrant_seconds: number | null;
  /** `null` = pas d'échéance du tout, ce qui n'est pas « en retard ». */
  on_time: boolean | null;
  /** Quelqu'un d'autre l'a cochée — la seule délégation constatée. */
  by_other: boolean;
}

/* ── Le barème ──────────────────────────────────────────────────────────────── */

/** Ce qui a été observé, et ce que ça vaut. */
export interface GoalLine {
  /** La clé du cas, pour les tests et les libellés. */
  key: string;
  /** Ce que la ligne dit, en toutes lettres. */
  label: string;
  /** Combien de fois ce cas s'est produit. */
  n: number;
  /** Points de CE cas, une fois. */
  each: number;
  /** `n × each`. */
  points: number;
  /**
   * La ligne est un INSTANTANÉ, pas un résultat de la période.
   *
   * ⚠️ La distinction porte la comparaison d'une période à l'autre. Les points
   * gagnés viennent de tâches FINIES pendant la fenêtre ; les pénalités, elles,
   * viennent de tâches encore ouvertes AUJOURD'HUI — elles ne se rattachent à
   * aucune période, et les mêmes seraient recomptées à chaque fenêtre qu'on
   * compare. L'écran les affiche donc à part, et la tendance ne porte que sur
   * ce qui est daté.
   */
  snapshot: boolean;
}

export interface GoalQuadrant {
  quadrant: QuadrantKey;
  label: string;
  /** L'usage que la case demande, dit en une phrase. */
  intent: string;
  lines: GoalLine[];
  /** Points de la période — les lignes datées, celles qui se comparent. */
  points: number;
  /** Pénalités de l'instant — les lignes d'instantané. */
  snapshot: number;
}

export interface GoalScore {
  quadrants: GoalQuadrant[];
  /** Points de la période. C'est LUI qui se compare à la période précédente. */
  points: number;
  /** Pénalités de l'instant, toutes cases confondues. */
  snapshot: number;
  /** `points + snapshot` — ce qu'on affiche en grand. */
  total: number;
  /** Combien de tâches finies ont nourri le calcul — pour dire quand il est maigre. */
  counted: number;
  /**
   * Des durées manquaient (`quadrant_changed_at` absent, cf. #47). Ces tâches
   * n'ont pas été notées sur la durée : l'écran doit le dire plutôt que de
   * laisser croire à un mauvais score.
   */
  unmeasured: number;
}

const DAY_S = 24 * 60 * 60;
const DAY_MS = DAY_S * 1000;

/** Ce que chaque case promet — le texte s'affiche au-dessus de ses lignes. */
const INTENT: Record<QuadrantKey, string> = {
  faire: 'la traiter vite, soi-même',
  planifier: 'lui donner une date, puis la tenir',
  deleguer: 'qu’elle parte chez quelqu’un d’autre',
  eliminer: 'qu’elle disparaisse',
  parking: 'qu’elle n’y reste pas',
};

/**
 * Note une période.
 *
 * `facts` vient de `goal_stats` (les tâches finies), `open` de la mémoire du
 * client (les tâches encore ouvertes). Le découpage n'est pas arbitraire : ce
 * qui est fini n'est plus en mémoire depuis #40, et ce qui est ouvert y est tout
 * entier — chaque moitié du barème se lit donc là où elle est disponible, sans
 * requête de plus.
 */
export function goalScore({
  facts,
  open = [],
  now = Date.now(),
}: {
  facts: GoalFact[];
  /** Les tâches ouvertes du compte. Elles portent les pénalités, jamais les points. */
  open?: Task[];
  now?: number;
}): GoalScore {
  const jours = (s: number | null) => (s === null ? null : s / DAY_S);
  const ouvertes = open.filter(isOpenRow);
  const ageJours = (t: Task) => (now - Date.parse(t.quadrant_changed_at)) / DAY_MS;
  /** Une date illisible ne doit pas compter comme un retard : elle ne compte pas. */
  const enRetard = (t: Task) => {
    if (!t.due_at) return false;
    const d = Date.parse(t.due_at);
    return Number.isFinite(d) && d < now;
  };
  const vieille = (t: Task, seuil: number) => {
    const a = ageJours(t);
    return Number.isFinite(a) && a >= seuil;
  };

  const dans = (q: QuadrantKey) => facts.filter((f) => f.quadrant === q);
  const ouvertesDe = (q: QuadrantKey) => ouvertes.filter((t) => t.quadrant === q);

  /** Une ligne, écartée du rendu quand elle n'a rien à dire. */
  const ligne = (key: string, label: string, n: number, each: number): GoalLine => ({
    key,
    label,
    n,
    each,
    points: n * each,
    snapshot: false,
  });
  /** Une ligne tirée des tâches ENCORE OUVERTES : elle date d'aujourd'hui. */
  const instant = (key: string, label: string, n: number, each: number): GoalLine => ({
    ...ligne(key, label, n, each),
    snapshot: true,
  });

  // ── Faire : vite, ou ce n'était pas urgent ────────────────────────────────
  const faire = dans('faire').filter((f) => !f.deleted);
  const faireVite = faire.filter((f) => {
    const j = jours(f.in_quadrant_seconds);
    return j !== null && j <= GOAL_THRESHOLDS.faireDays;
  }).length;
  const faireLent = faire.filter((f) => {
    const j = jours(f.in_quadrant_seconds);
    return j !== null && j > GOAL_THRESHOLDS.faireDays;
  }).length;
  const faireRetard = ouvertesDe('faire').filter(enRetard).length;

  // ── Planifier : datée, puis tenue ─────────────────────────────────────────
  const plan = dans('planifier').filter((f) => !f.deleted);
  const planTenue = plan.filter((f) => f.on_time === true).length;
  const planRatee = plan.filter((f) => f.on_time === false).length;
  const planSansDate = plan.filter((f) => f.on_time === null).length;

  // ── Déléguer : la passation, pas le travail ───────────────────────────────
  //
  // ⚠️ `by_other` est EXCLUSIF des deux cas de durée, et ce n'est pas un détail
  // de calcul. Une tâche cochée par quelqu'un d'autre est une délégation
  // CONSTATÉE : la noter aussi sur sa durée reviendrait à lui reprocher d'avoir
  // mis du temps chez son destinataire, alors que c'est précisément ce qu'on
  // voulait — que le travail se fasse ailleurs.
  const deleg = dans('deleguer').filter((f) => !f.deleted);
  const delegAutre = deleg.filter((f) => f.by_other).length;
  const delegSoi = deleg.filter((f) => !f.by_other);
  const delegVite = delegSoi.filter((f) => {
    const j = jours(f.in_quadrant_seconds);
    return j !== null && j <= GOAL_THRESHOLDS.deleguerDays;
  }).length;
  const delegLent = delegSoi.filter((f) => {
    const j = jours(f.in_quadrant_seconds);
    return j !== null && j > GOAL_THRESHOLDS.deleguerDays;
  }).length;
  const delegDort = ouvertesDe('deleguer').filter((t) =>
    vieille(t, GOAL_THRESHOLDS.deleguerStaleDays),
  ).length;

  // ── Éliminer : qu'elle disparaisse ────────────────────────────────────────
  const elim = dans('eliminer');
  const elimPartie = elim.filter((f) => f.deleted).length;
  const elimFaite = elim.filter((f) => !f.deleted).length;

  // ── À trier : rien à gagner, seulement à perdre ───────────────────────────
  //
  // Et c'est le constat, pas un oubli. Une tâche bien triée QUITTE le parking :
  // elle est alors notée dans sa nouvelle case, et le parking n'en garde aucune
  // trace. Il ne reste donc à mesurer que ce qui y est resté.
  const parkVieilles = ouvertesDe('parking').filter((t) =>
    vieille(t, GOAL_THRESHOLDS.parkingDays),
  ).length;

  // Typé AVANT le `map` : sans ça TypeScript infère `quadrant: string` sur le
  // littéral, et la clé de case se perd au premier indexage.
  const brut: { quadrant: QuadrantKey; lines: GoalLine[] }[] = [
    {
      quadrant: 'faire',
      lines: [
        ligne('fast', `Traitée en moins de ${GOAL_THRESHOLDS.faireDays} jours`, faireVite, 2),
        ligne('slow', 'Traitée plus tard — ce n’était pas une urgence', faireLent, 1),
        instant('overdue', 'Encore ouverte, et l’échéance est passée', faireRetard, -1),
      ],
    },
    {
      quadrant: 'planifier',
      lines: [
        ligne('on_time', 'Datée, et tenue', planTenue, 4),
        ligne('late', 'Datée, mais en retard', planRatee, 1),
        ligne('no_due', 'Faite sans jamais de date — la case n’a pas servi', planSansDate, 0),
      ],
    },
    {
      quadrant: 'deleguer',
      lines: [
        ligne('by_other', 'Cochée par quelqu’un d’autre — délégation constatée', delegAutre, 5),
        ligne('fast', `Passée en moins de ${GOAL_THRESHOLDS.deleguerDays} jours`, delegVite, 3),
        ligne('slow', 'Gardée plus longtemps', delegLent, 1),
        instant('stale', `Ouverte depuis plus de ${GOAL_THRESHOLDS.deleguerStaleDays} jours`, delegDort, -1),
      ],
    },
    {
      quadrant: 'eliminer',
      lines: [
        ligne('dropped', 'Supprimée — elle a disparu', elimPartie, 2),
        ligne('done', 'Cochée — du temps passé sur ce qu’on jugeait sans valeur', elimFaite, -2),
      ],
    },
    {
      quadrant: 'parking',
      lines: [
        instant('stale', `Au parking depuis plus de ${GOAL_THRESHOLDS.parkingDays} jours`, parkVieilles, -1),
      ],
    },
  ];

  const quadrants: GoalQuadrant[] = brut.map((q) => ({
    ...q,
    label: QUADS.find((x) => x.key === q.quadrant)?.label ?? 'À trier',
    intent: INTENT[q.quadrant],
    points: q.lines.filter((l) => !l.snapshot).reduce((n, l) => n + l.points, 0),
    snapshot: q.lines.filter((l) => l.snapshot).reduce((n, l) => n + l.points, 0),
  }));

  const points = quadrants.reduce((n, q) => n + q.points, 0);
  const snapshot = quadrants.reduce((n, q) => n + q.snapshot, 0);

  return {
    quadrants,
    points,
    snapshot,
    total: points + snapshot,
    counted: facts.length,
    // Seules les cases notées SUR LA DURÉE sont concernées : « Planifier » se
    // juge à l'échéance et « Éliminer » à la disparition, ni l'une ni l'autre
    // n'a besoin de `quadrant_changed_at`.
    unmeasured: facts.filter(
      (f) =>
        !f.deleted &&
        f.in_quadrant_seconds === null &&
        (f.quadrant === 'faire' || (f.quadrant === 'deleguer' && !f.by_other)),
    ).length,
  };
}

/** L'écart avec la période précédente, tel qu'on l'affiche. `null` = rien à comparer. */
export function goalTrend(total: number, previous: number | null): string | null {
  if (previous === null) return null;
  const d = total - previous;
  if (d === 0) return 'autant que la période précédente';
  return `${d > 0 ? '+' : '−'}${Math.abs(d)} par rapport à la période précédente`;
}
