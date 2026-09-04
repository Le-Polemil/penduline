import { useMemo, useState, type CSSProperties } from 'react';
import {
  PERIODS,
  quadrant,
  statsReadings,
  statsSentence,
  type StatsPeriod,
  type StatsReadings,
  type WeekPoint,
} from '@penduline/shared';
import type { Store } from '../data/store';
import { useStats } from '../data/useStats';

/**
 * Les statistiques rétrospectives (#48).
 *
 * L'écran ne calcule rien : tout vient de `statsReadings`, pur et testé. Il rend.
 *
 * ⚠️ POURQUOI AUCUN GRAPHIQUE N'EMPILE LES CASES.
 *
 * La palette des quadrants a été passée au validateur de la méthode dataviz, et
 * elle échoue en tant que série catégorielle :
 *
 *   Faire #5c6b45 ↔ Planifier #38607f   ΔE 11,4 en vision NORMALE (plancher : 15)
 *   Éliminer #a63d2a ↔ Déléguer #8f6a14 ΔE 4,4 en deutéranopie   (plancher : 8)
 *
 * Ce n'est pas un défaut de `quadrants.ts` : ces teintes colorent de grands
 * panneaux titrés, côte à côte, où l'on n'a jamais à comparer deux couleurs pour
 * savoir laquelle est laquelle. Elles ne tiennent pas le rôle qu'un empilement
 * leur donnerait — distinguer des segments fins par la couleur SEULE.
 *
 * On change donc de FORME plutôt que de couleurs : la tendance est en petits
 * multiples, un panneau par case, à échelle commune. L'identité vient du titre
 * du panneau, jamais d'une comparaison de teintes ; la couleur ne fait que
 * rappeler la case. Garder la palette de l'application valait mieux qu'inventer
 * une seconde langue de couleurs pour les mêmes quatre concepts.
 */
export function StatsScreen({ store }: { store: Store }) {
  const [period, setPeriod] = useState<StatsPeriod>('30j');
  const { stats, loading, failed } = useStats(period);

  const readings = useMemo(
    () => (stats ? statsReadings({ stats, boards: store.boards }) : null),
    [stats, store.boards],
  );
  const sentence = readings ? statsSentence(readings) : null;

  return (
    <div className="stats">
      <div className="stats-head">
        <h1 className="stats-title">Rétrospective</h1>
        <p className="stats-sub">
          Ce que vous avez terminé, et depuis quelle case. Les tâches supprimées définitivement
          n'y figurent pas.
        </p>
        {/* Un groupe à état, pas des liens : on choisit une vue, on ne navigue pas. */}
        <div className="stats-periods" role="group" aria-label="Période observée">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              className={`stats-period${period === p.key ? ' stats-period--on' : ''}`}
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {failed ? (
        <p className="stats-empty">
          Les statistiques n'ont pas pu être chargées. Elles se calculent sur le serveur, qui
          n'a pas répondu.
        </p>
      ) : loading || !readings ? (
        <p className="stats-empty">Calcul en cours…</p>
      ) : readings.total === 0 ? (
        // Un compte neuf mérite une phrase, pas des axes vides.
        <p className="stats-empty">
          Rien de terminé sur cette période. Les statistiques se remplissent à mesure que vous
          cochez — revenez quand la matrice aura vécu.
        </p>
      ) : (
        <>
          {sentence && <p className="stats-sentence">{sentence}</p>}
          <Repartition readings={readings} />
          <Tendance readings={readings} />
          <Delais readings={readings} />
          <ParMatrice readings={readings} />
        </>
      )}
    </div>
  );
}

/** Nombre en français, une décimale au plus. */
function fr(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
}

/** « 2026-08-31 » → « 31 août ». */
function weekLabel(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/**
 * Le cadre commun : un titre, le graphique, et un tableau pour qui ne le voit pas.
 *
 * Un SVG ou une pile de `div` colorées ne s'énonce pas. Le tableau n'est pas une
 * politesse : c'est la seule lecture disponible au lecteur d'écran.
 */
function Figure({
  title,
  hint,
  children,
  table,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  table: React.ReactNode;
}) {
  return (
    <figure className="stats-fig">
      <figcaption className="stats-fig__head">
        <span className="stats-fig__title">{title}</span>
        {hint && <span className="stats-fig__hint">{hint}</span>}
      </figcaption>
      {children}
      <div className="sr-only">{table}</div>
    </figure>
  );
}

/** Répartition des tâches terminées par case. */
function Repartition({ readings }: { readings: StatsReadings }) {
  const rows = readings.byQuadrant.filter((q) => q.completed > 0);
  const max = Math.max(...rows.map((q) => q.completed), 1);

  return (
    <Figure
      title="Par case"
      hint={`${readings.total} ${readings.total > 1 ? 'tâches terminées' : 'tâche terminée'}`}
      table={
        <table>
          <caption>Tâches terminées par case</caption>
          <thead>
            <tr>
              <th>Case</th>
              <th>Terminées</th>
              <th>Part</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.quadrant}>
                <td>{q.label}</td>
                <td>{q.completed}</td>
                <td>{q.share} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="bars" aria-hidden="true">
        {rows.map((q) => (
          <div className="bar" key={q.quadrant}>
            <span className="bar__label">{q.label}</span>
            <span className="bar__track">
              <span
                className="bar__fill"
                style={{ width: `${(q.completed / max) * 100}%`, background: q.ink } as CSSProperties}
              />
            </span>
            {/* Étiquette directe : la valeur ne dépend jamais de la couleur. */}
            <span className="bar__value">
              {q.completed} <span className="bar__share">{q.share} %</span>
            </span>
          </div>
        ))}
      </div>
    </Figure>
  );
}

/**
 * La tendance, en petits multiples — un panneau par case, à ÉCHELLE COMMUNE.
 *
 * L'échelle partagée est ce qui rend les panneaux comparables : à échelles
 * propres, une case à 2 tâches et une case à 40 dessineraient la même colline, et
 * le graphique dirait le contraire de la vérité.
 */
function Tendance({ readings }: { readings: StatsReadings }) {
  const { weeks } = readings;
  const actives = readings.byQuadrant.filter((q) => q.completed > 0);
  const max = Math.max(
    1,
    ...weeks.flatMap((w) => actives.map((q) => w.byQuadrant[q.quadrant])),
  );

  if (weeks.length === 0) return null;

  return (
    <Figure
      title="Semaine après semaine"
      hint={`${weeks.length} semaines · échelle commune, maximum ${max}`}
      table={
        <table>
          <caption>Tâches terminées par semaine et par case</caption>
          <thead>
            <tr>
              <th>Semaine du</th>
              {actives.map((q) => (
                <th key={q.quadrant}>{q.label}</th>
              ))}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}>
                <td>{weekLabel(w.week)}</td>
                {actives.map((q) => (
                  <td key={q.quadrant}>{w.byQuadrant[q.quadrant]}</td>
                ))}
                <td>{w.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="spark-set" aria-hidden="true">
        {actives.map((q) => (
          <div className="spark" key={q.quadrant}>
            <span className="spark__name" style={{ color: quadrant(q.quadrant).dark }}>
              {q.label}
            </span>
            <span className="spark__plot">
              {weeks.map((w) => (
                <Colonne key={w.week} week={w} value={w.byQuadrant[q.quadrant]} max={max} ink={q.ink} label={q.label} />
              ))}
            </span>
          </div>
        ))}
        {/* L'axe des semaines une seule fois, sous la dernière rangée : le
            répéter cinq fois n'apporterait rien et volerait la hauteur. */}
        <div className="spark-axis">
          <span>{weekLabel(weeks[0].week)}</span>
          <span>{weekLabel(weeks[weeks.length - 1].week)}</span>
        </div>
      </div>
    </Figure>
  );
}

function Colonne({
  week,
  value,
  max,
  ink,
  label,
}: {
  week: WeekPoint;
  value: number;
  max: number;
  ink: string;
  label: string;
}) {
  return (
    <span
      className="spark__col"
      // Le survol ne remplace pas le tableau, il l'accompagne — et une semaine
      // creuse doit pouvoir se lire comme telle, pas comme un trou.
      title={`Semaine du ${weekLabel(week.week)} — ${label} : ${value}`}
    >
      <span
        className="spark__bar"
        style={{ height: `${(value / max) * 100}%`, background: ink } as CSSProperties}
      />
    </span>
  );
}

/** Délai moyen entre création et complétion, par case. */
function Delais({ readings }: { readings: StatsReadings }) {
  const rows = readings.byQuadrant.filter((q) => q.avgDays !== null);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((q) => q.avgDays ?? 0), 0.1);

  return (
    <Figure
      title="Délai moyen avant complétion"
      hint={readings.avgDays !== null ? `${fr(readings.avgDays)} jours toutes cases confondues` : undefined}
      table={
        <table>
          <caption>Délai moyen entre création et complétion, par case</caption>
          <thead>
            <tr>
              <th>Case</th>
              <th>Délai moyen (jours)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((q) => (
              <tr key={q.quadrant}>
                <td>{q.label}</td>
                <td>{fr(q.avgDays ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="bars" aria-hidden="true">
        {rows.map((q) => (
          <div className="bar" key={q.quadrant}>
            <span className="bar__label">{q.label}</span>
            <span className="bar__track">
              <span
                className="bar__fill"
                style={{ width: `${((q.avgDays ?? 0) / max) * 100}%`, background: q.ink } as CSSProperties}
              />
            </span>
            <span className="bar__value">{fr(q.avgDays ?? 0)} j</span>
          </div>
        ))}
      </div>
      {/* Dit une fois, sous le graphique : sans ça, « Planifier : 18 j » se lit
          comme un retard alors que c'est le fonctionnement de la méthode. */}
      <p className="stats-note">
        Un délai long dans « Planifier » est le rythme attendu de cette case, pas un retard.
      </p>
    </Figure>
  );
}

/** Comparaison entre matrices. */
function ParMatrice({ readings }: { readings: StatsReadings }) {
  const rows = readings.boards.filter((b) => b.completed > 0);
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((b) => b.completed), 1);

  return (
    <Figure
      title="Par matrice"
      hint="quel contexte a réellement consommé le temps"
      table={
        <table>
          <caption>Tâches terminées par matrice</caption>
          <thead>
            <tr>
              <th>Matrice</th>
              <th>Terminées</th>
              <th>Délai moyen (jours)</th>
              <th>Case dominante</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.boardId}>
                <td>{b.name}</td>
                <td>{b.completed}</td>
                <td>{b.avgDays === null ? '—' : fr(b.avgDays)}</td>
                <td>{b.dominant ? quadrant(b.dominant).label : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <div className="bars" aria-hidden="true">
        {rows.map((b) => (
          <div className="bar" key={b.boardId}>
            <span className="bar__label">{b.name}</span>
            <span className="bar__track">
              <span
                className="bar__fill"
                // Les matrices n'ont pas d'identité de couleur : une teinte
                // neutre, et la pastille de la case dominante porte le sens.
                style={{ width: `${(b.completed / max) * 100}%` } as CSSProperties}
              />
            </span>
            <span className="bar__value">
              {b.completed}
              {b.dominant && (
                <span
                  className="bar__dot"
                  style={{ background: quadrant(b.dominant).ink } as CSSProperties}
                />
              )}
              <span className="bar__share">
                {b.dominant ? quadrant(b.dominant).label : ''}
              </span>
            </span>
          </div>
        ))}
      </div>
    </Figure>
  );
}
