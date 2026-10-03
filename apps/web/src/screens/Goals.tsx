import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import {
  GOAL_THRESHOLDS,
  PERIODS,
  goalScore,
  goalTrend,
  type StatsPeriod,
} from '@penduline/shared';
import { quadrant } from '../lib/quads';
import type { Store } from '../data/store';
import { ScreenHero } from '../components/ScreenHero';
import { useGoals } from '../data/useGoals';
import { useNow } from '../data/useNow';

/**
 * « Objectifs » : est-ce que chaque case sert à ce qu'elle promet ?
 *
 * ⚠️ CE N'EST PAS UN COMPTEUR DE PRODUCTIVITÉ, et tout l'écran tient à cette
 * nuance. La rétrospective, l'onglet d'à côté, dit COMBIEN on a terminé. Ici on
 * ne mesure que la MANIÈRE : une tâche de « Planifier » cochée sans avoir jamais
 * eu de date a bien été faite, elle ne rapporte rien — la case n'a servi à rien.
 * Une tâche d'« Éliminer » cochée coûte des points alors qu'elle a été
 * accomplie : on a dépensé du temps sur ce qu'on venait de juger sans valeur.
 *
 * L'écran ne calcule rien : tout vient de `goalScore` (`packages/shared`), pur et
 * testé. Il rend, et il explique — un score est un nombre, et un nombre sans sa
 * règle se lit comme un jugement.
 *
 * ⚠️ Les pénalités sont affichées À PART du total de la période, et ce n'est pas
 * une coquetterie de mise en page : elles viennent de tâches encore ouvertes
 * AUJOURD'HUI, qui ne se rattachent à aucune fenêtre. Les mêmes seraient
 * recomptées à chaque période comparée, et la tendance deviendrait fausse.
 */
export function GoalsScreen({ store, tabs }: { store: Store; tabs?: ReactNode }) {
  const [period, setPeriod] = useState<StatsPeriod>('30j');
  const { facts, previous, loading, failed } = useGoals(period);
  const now = useNow();

  const score = useMemo(
    () => (facts ? goalScore({ facts, open: store.tasks, now }) : null),
    [facts, store.tasks, now],
  );
  /** La période précédente ne porte que ses faits : l'instant n'a pas de passé. */
  const avant = useMemo(
    () => (previous ? goalScore({ facts: previous, now }).points : null),
    [previous, now],
  );
  const tendance = score ? goalTrend(score.points, avant) : null;
  const periode = PERIODS.find((p) => p.key === period);

  return (
    <>
      <ScreenHero tabs={tabs}>
        <div className="shero__row">
          <div className="shero__lead">
            <p className="shero__eyebrow">Objectifs · {periode?.label}</p>
            <h1 className="shero__title retro-title">Chaque case sert-elle à ce qu’elle promet&#8239;?</h1>
            <p className="retro-lede">
              Pas ce que vous avez abattu — la rétrospective le dit déjà. Ce que vous avez fait de
              la méthode : une case bien utilisée rapporte, une case détournée rapporte moins.
            </p>
            <div className="retro-controls">
              <div className="retro-periods" role="group" aria-label="Période observée">
                {PERIODS.map((p) => (
                  <button
                    key={p.key}
                    className={`shero__ghost${period === p.key ? ' shero__ghost--on' : ''}`}
                    aria-pressed={period === p.key}
                    onClick={() => setPeriod(p.key)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {score && (
            <div className="shero__side go-total">
              <span className="go-total__n" aria-hidden="true">
                {score.total > 0 ? `+${score.total}` : score.total}
              </span>
              <span className="go-total__text">
                <span className="sr-only">Score de discipline : </span>
                {score.total > 1 || score.total < -1 ? 'points' : 'point'}
                {tendance && <span className="go-total__trend">{tendance}</span>}
              </span>
            </div>
          )}
        </div>
      </ScreenHero>

      <div className="stats">
        {failed ? (
          <p className="stats-empty">
            Les objectifs n'ont pas pu être chargés. Ils se calculent sur le serveur, qui n'a pas
            répondu.
          </p>
        ) : loading || !score ? (
          <p className="stats-empty">Calcul en cours…</p>
        ) : score.counted === 0 && score.snapshot === 0 ? (
          <p className="stats-empty">
            Rien de fini sur cette période, et rien qui traîne. Le barème se remplit à mesure que
            vous cochez, datez et supprimez — revenez quand la matrice aura vécu.
          </p>
        ) : (
          <>
            <div className="go-cases">
              {score.quadrants.map((q) => {
                const lignes = q.lines.filter((l) => l.n > 0);
                return (
                  <section
                    className="go-case"
                    key={q.quadrant}
                    style={{ '--q-ink': quadrant(q.quadrant).ink, '--q-dark': quadrant(q.quadrant).dark } as CSSProperties}
                    aria-labelledby={`go-${q.quadrant}`}
                  >
                    <div className="go-case__head">
                      <h2 className="go-case__title" id={`go-${q.quadrant}`}>{q.label}</h2>
                      <span className="go-case__intent">{q.intent}</span>
                      <span className="go-case__n">
                        {q.points + q.snapshot > 0 ? '+' : ''}
                        {q.points + q.snapshot}
                      </span>
                    </div>
                    {lignes.length === 0 ? (
                      <p className="go-case__empty">Rien à mesurer sur cette période.</p>
                    ) : (
                      <ul className="go-lines">
                        {lignes.map((l) => (
                          <li className={`go-line${l.each < 0 ? ' go-line--cost' : ''}`} key={l.key}>
                            <span className="go-line__n">{l.n}</span>
                            <span className="go-line__label">
                              {l.label}
                              {/* Dire d'où vient la ligne : sans ça, une
                                  pénalité se lit comme un résultat de la période
                                  alors qu'elle décrit l'état d'aujourd'hui. */}
                              {l.snapshot && <span className="go-line__when"> — en ce moment</span>}
                            </span>
                            <span className="go-line__points">
                              {l.each > 0 ? `+${l.each}` : l.each === 0 ? '0' : l.each}
                              <span className="sr-only"> point chacune, soit {l.points}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>

            <section className="go-recap" aria-label="Décompte">
              <p className="go-recap__line">
                <span>Sur la période</span>
                <strong>{score.points > 0 ? `+${score.points}` : score.points}</strong>
              </p>
              <p className="go-recap__line">
                <span>Ce qui traîne en ce moment</span>
                <strong>{score.snapshot > 0 ? `+${score.snapshot}` : score.snapshot}</strong>
              </p>
              <p className="go-recap__line go-recap__line--total">
                <span>Total</span>
                <strong>{score.total > 0 ? `+${score.total}` : score.total}</strong>
              </p>
            </section>

            {/* Les deux trous de mesure, dits plutôt que tus. Un score qu'on ne
                peut pas expliquer se lit comme un reproche. */}
            <div className="go-notes">
              {score.unmeasured > 0 && (
                <p className="stats-note">
                  {score.unmeasured} {score.unmeasured > 1 ? 'tâches n’ont pas pu être notées' : 'tâche n’a pas pu être notée'} sur
                  la durée : le suivi des changements de case est arrivé avec la revue périodique,
                  et rien d'avant n'est mesurable. Elles ne coûtent rien.
                </p>
              )}
              <p className="stats-note">
                Une tâche vidée définitivement de la corbeille disparaît pour de bon : le point
                gagné en supprimant depuis « Éliminer » s'efface avec elle, au bout de trente
                jours.
              </p>
              <p className="stats-note">
                Seuils : {GOAL_THRESHOLDS.faireDays} jours pour « Faire », {GOAL_THRESHOLDS.deleguerDays} pour
                une passation, {GOAL_THRESHOLDS.parkingDays} au parking.
              </p>
            </div>
          </>
        )}
      </div>
    </>
  );
}
