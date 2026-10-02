import { dayHeadline, dayLabel, quadrantTotals, QUADS, type Task } from '@penduline/shared';

/**
 * Le héros de l'accueil : la date, une phrase, et le compte de chaque case.
 *
 * Il prolonge la barre du haut (même bandeau d'encre) et ne vit que sur
 * l'accueil. Les compteurs ouvrent la vue globale : c'est elle qui montre toutes
 * les tâches d'une case, toutes matrices confondues.
 *
 * Le nid est un décor, en filigrane : la branche reste fixe et seul le nid se
 * balance, autour du nœud qui l'attache. Il n'existe pas pour les lecteurs
 * d'écran, et ne bouge plus sous `prefers-reduced-motion`.
 */
export function HomeHero({ tasks, onGlobal }: { tasks: Task[]; onGlobal: () => void }) {
  const totals = quadrantTotals(tasks);
  const now = Date.now();

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero__inner">
        <p className="hero__date">{dayLabel(now)}</p>
        <h1 className="hero__title" id="hero-title">{dayHeadline(tasks)}</h1>
        <div className="hero__counts">
          {QUADS.map((q) => (
            <button
              key={q.key}
              className={`hero__count hero__count--${q.key}`}
              onClick={onGlobal}
              aria-label={`${q.label} : ${totals[q.key]} ${totals[q.key] > 1 ? 'tâches' : 'tâche'} — voir la vue globale`}
            >
              <span className="hero__count-n" aria-hidden="true">{totals[q.key]}</span>
              <span aria-hidden="true">{q.label}</span>
            </button>
          ))}
          {totals.parking > 0 && (
            <button className="hero__count hero__count--parking" onClick={onGlobal}>
              {totals.parking} à trier ›
            </button>
          )}
        </div>
      </div>
      <span className="hero__nest" aria-hidden="true">
        <span className="hero__branch" />
        <span className="hero__swing">
          <span className="hero__nid" />
        </span>
      </span>
      <svg className="hero__wave" viewBox="0 0 1280 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40 L0 22 C120 6 220 36 360 22 C500 8 600 34 760 20 C900 8 1020 32 1140 18 C1200 12 1240 16 1280 20 L1280 40 Z" />
      </svg>
    </section>
  );
}
