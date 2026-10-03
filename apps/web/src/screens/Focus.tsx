import { useMemo, useState, type CSSProperties } from 'react';
import {
  FOCUS_MAX,
  focusBilan,
  focusCandidates,
  focusDayLabel,
  focusToday,
  formatDeadline,
  deadlineStatus,
  localDay,
  subtasksOf,
  type FocusReason,
  type QuadrantKey,
  type Task,
} from '@penduline/shared';
import { quadrant } from '../lib/quads';
import type { Store } from '../data/store';
import { ScreenHero } from '../components/ScreenHero';
import { Icon } from '../components/Icons';
import { useCompletion } from '../data/useCompletion';
import { useFocus } from '../data/useFocus';
import { useNow } from '../data/useNow';
import { useAnnounce } from '../a11y/announce';
import { envoyerAuNid } from '../lib/transitions';
import { readFocusLimit, writeFocusLimit } from '../data/focusPrefs';

/**
 * Le mode « aujourd'hui » : une chose à la fois (#49).
 *
 * L'écran ne liste plus, il MONTRE. La tâche en cours occupe le bandeau en
 * entier, les autres attendent en file dessous, et tout le reste — ce qui est
 * fait, ce qui pourrait entrer — passe sous la vague. Le dépouillement n'est pas
 * une économie de travail, c'est la fonctionnalité : une liste de trois lignes
 * se relit en boucle, une tâche en grand se fait.
 *
 * La liste vient de `useFocus` et non de `store.tasks`, parce qu'une tâche cochée
 * sort du second (#40) : l'écran afficherait « 2 tâches » au lieu de « 3
 * choisies, 1 faite », et perdrait le sentiment d'avancement qui le justifie.
 *
 * ⚠️ Aucune annulation locale, contrairement à la maquette. Cocher passe par
 * `useCompletion`, qui affiche DÉJÀ son toast « Annuler » pendant quatre
 * secondes ; les autres gestes passent par `store.group`, donc par `Ctrl+Z` et
 * son propre toast. Un troisième mécanisme d'annulation sur le même écran
 * n'aurait pas ajouté une sécurité, il aurait ajouté une question : lequel des
 * deux « Annuler » défait quoi.
 */
/**
 * L'encre d'une case, posée en variable de style.
 *
 * `CSSProperties` ne connaît pas les propriétés personnalisées : sans la
 * coercition, TypeScript refuse chaque `--egg`. Une fonction plutôt que huit
 * `as CSSProperties` dispersés.
 */
function encre(q: QuadrantKey): CSSProperties {
  return { '--egg': `var(--q-${q}-ink)` } as CSSProperties;
}

export function FocusScreen({
  store,
  onHome,
  onOpenBoard,
}: {
  store: Store;
  onHome: () => void;
  onOpenBoard: (boardId: string) => void;
}) {
  const { tasks: focusTasks, loading, failed, refresh } = useFocus();
  const [limit, setLimit] = useState(readFocusLimit);
  const [tuning, setTuning] = useState(false);
  /**
   * L'ordre de passage, et il est LOCAL.
   *
   * « Passer devant » et « plus tard dans la journée » ne changent rien à la
   * tâche : ils changent l'ordre dans lequel on veut la voir arriver, aujourd'hui,
   * sur cet appareil. Le persister demanderait une colonne — donc une migration —
   * pour un état qui ne survit pas à la journée. Les identifiants inconnus de
   * cette liste (une tâche ajoutée depuis) passent derrière, dans l'ordre que
   * `focusToday` leur donne.
   */
  const [ordre, setOrdre] = useState<string[]>([]);

  // `store.tasks` pour cocher : c'est lui qui porte l'état optimiste, et
  // `useCompletion` a besoin de la liste complète pour dénouer les paires.
  const { onCheck } = useCompletion(store.tasks, store.patchTask);
  const now = useNow();
  const announce = useAnnounce();

  const day = localDay();

  /**
   * La liste du serveur, RECOUVERTE par l'état optimiste du store.
   *
   * ⚠️ Sans cette superposition, cocher une tâche ne se voyait pas : `refresh()`
   * part avant que l'écriture n'ait abouti, et la relecture ramenait donc l'état
   * d'avant. Temporiser aurait été un pansement — et faux, puisqu'aucun délai
   * n'est garanti.
   *
   * Les deux sources se complètent exactement : `store.tasks` porte l'état
   * optimiste des tâches encore en mémoire (donc la coche, immédiatement), et la
   * copie serveur couvre celles que `inWorkingSet` a évacuées depuis (#40). Ce
   * qui existe dans les deux vient du store, qui est toujours au moins aussi
   * frais.
   */
  const merged = useMemo(() => {
    const live = new Map(store.tasks.map((t) => [t.id, t]));
    return focusTasks.map((t) => live.get(t.id) ?? t);
  }, [focusTasks, store.tasks]);

  const today = useMemo(() => focusToday(merged, day), [merged, day]);
  const bilan = useMemo(() => focusBilan(merged, day), [merged, day]);

  const faites = useMemo(() => today.filter((t) => t.done), [today]);
  /** Ce qui reste, dans l'ordre de passage choisi ici. */
  const restantes = useMemo(() => {
    const ouvertes = today.filter((t) => !t.done);
    const rang = (t: Task) => {
      const i = ordre.indexOf(t.id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...ouvertes].sort((a, b) => rang(a) - rang(b));
  }, [today, ordre]);

  const courante = restantes[0] ?? null;
  const suite = restantes.slice(1);
  const libres = Math.max(0, limit - today.length);

  /**
   * Que proposer pour les places libres. Calculé sur `store.tasks` : les
   * candidates sont, par définition, des tâches ouvertes — elles y sont toutes.
   */
  const candidates = useMemo(
    () => focusCandidates({ tasks: store.tasks, day, now, limit: Math.max(libres, 3) }),
    [store.tasks, day, now, libres],
  );

  function setLimite(n: number) {
    const borne = Math.min(FOCUS_MAX, Math.max(1, n));
    setLimit(borne);
    writeFocusLimit(borne);
  }

  /** Le chemin complet d'une tâche : « Maison › Cuisine ». */
  function lieu(t: Task): string {
    const board = store.boards.find((b) => b.id === t.board_id);
    if (!board) return '—';
    const uni = board.universe_id
      ? store.universes.find((u) => u.id === board.universe_id)
      : null;
    return uni ? `${uni.name} › ${board.name}` : board.name;
  }

  // ── Les gestes ─────────────────────────────────────────────────────────────
  function terminer(t: Task) {
    // Avant l'écriture : le titre est encore à l'écran, et c'est de lui que
    // part le fantôme.
    envoyerAuNid(document.querySelector('.fx-title'));
    onCheck(t);
    refresh();
  }

  function rouvrir(t: Task) {
    onCheck(t);
    refresh();
    announce(`« ${t.title} » est rouverte.`);
  }

  /** Sortir une tâche de la sélection, depuis l'écran lui-même. */
  function retirer(t: Task) {
    store.group("Retirée d'aujourd'hui", () => void store.patchTask(t.id, { focus_day: null }));
    refresh();
    announce(`« ${t.title} » est retournée dans ${quadrant(t.quadrant).label}.`);
  }

  function ajouter(t: Task) {
    store.group("Ajoutée à aujourd'hui", () => void store.patchTask(t.id, { focus_day: day }));
    refresh();
    announce(`« ${t.title} » est ajoutée à aujourd'hui.`);
  }

  /** Remettre la tâche en cours en fin de file — sans la sortir de la journée. */
  function plusTard(t: Task) {
    setOrdre([...restantes.filter((x) => x.id !== t.id), t].map((x) => x.id));
    announce(`« ${t.title} » passe en dernier.`);
  }

  function passerDevant(t: Task) {
    setOrdre([t, ...restantes.filter((x) => x.id !== t.id)].map((x) => x.id));
    announce(`« ${t.title} » passe devant.`);
  }

  /** Cocher l'étape suivante. Même écriture que la matrice, même groupe. */
  function etapeFaite(step: Task) {
    store.group('Étape terminée', () => void store.patchTask(step.id, { done: true, archived: true }));
    announce(`Étape cochée : ${step.title}.`);
  }

  // ── Le bandeau ─────────────────────────────────────────────────────────────
  /**
   * Les œufs du nid : un par place de la journée.
   *
   * Plein = fait, cerclé d'accent = en cours, contour simple = à venir,
   * pointillé = place libre. Décoratif — le même compte est dit en toutes
   * lettres juste dessous, et par un `sr-only` pour les lecteurs d'écran.
   */
  const oeufs = [
    ...faites.map((t) => ({ key: t.id, mod: 'done', quad: t.quadrant })),
    ...(courante ? [{ key: courante.id, mod: 'now', quad: courante.quadrant }] : []),
    ...suite.map((t) => ({ key: t.id, mod: 'next', quad: t.quadrant })),
    ...Array.from({ length: libres }, (_, i) => ({ key: `libre-${i}`, mod: 'free', quad: null })),
  ];

  const etapes = courante ? subtasksOf(store.tasks, courante.id) : [];
  const prochaine = etapes.find((s) => !s.done) ?? null;
  const etapesFaites = etapes.filter((s) => s.done).length;

  const vide = today.length === 0;
  const toutFait = today.length > 0 && restantes.length === 0;

  /**
   * La ligne de date et d'avancement.
   *
   * « 0 sur 3 faite » ne se dit pas : à zéro, on nomme l'état plutôt que de
   * compter. Au-delà, l'accord suit le nombre de tâches faites.
   */
  const avancement =
    faites.length === 0
      ? 'rien de fait pour l’instant'
      : `${faites.length} ${faites.length > 1 ? 'faites' : 'faite'} sur ${today.length}`;
  const eyebrow = vide
    ? `${focusDayLabel(day)} · ${libres > 1 ? `${libres} places libres` : 'une place libre'}`
    : `${focusDayLabel(day)} · ${avancement}`;

  /** Ce qui désigne une candidate, mis en mots. La règle, elle, vit dans `shared`. */
  function motif(t: Task, reason: FocusReason): string {
    if (reason === 'overdue') return 'échéance dépassée';
    if (reason === 'soon') return `échéance ${formatDeadline(t.due_at!, now)}`;
    return `dans « ${quadrant(t.quadrant).label} »`;
  }

  function badgeEcheance(t: Task) {
    const statut = deadlineStatus(t.due_at, now);
    if (!statut || !t.due_at) return null;
    return (
      <span className={`fx-chip fx-chip--${statut}`}>
        <Icon size={13}>
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l2.5 2" />
        </Icon>
        {formatDeadline(t.due_at, now)}
      </span>
    );
  }

  return (
    <>
      <ScreenHero variant="focus">
        <div className="fx-stage">
          <div className="fx-count">
            <ol className="fx-eggs" aria-hidden="true">
              {oeufs.map((o) => (
                <li
                  key={o.key}
                  className={`fx-egg fx-egg--${o.mod}`}
                  style={o.quad ? encre(o.quad) : undefined}
                />
              ))}
            </ol>
            <p className="shero__eyebrow fx-eyebrow">{eyebrow}</p>
          </div>

          {loading ? (
            <p className="fx-lead">Lecture…</p>
          ) : failed ? (
            <p className="fx-lead">
              La sélection du jour n'a pas pu être chargée. Elle se lit sur le serveur, qui n'a pas
              répondu.
            </p>
          ) : courante ? (
            <div className="fx-now" key={courante.id}>
              <div className="fx-tags">
                <span
                  className="fx-chip fx-chip--quad"
                  style={encre(courante.quadrant)}
                >
                  {quadrant(courante.quadrant).label}
                </span>
                <button className="fx-place" onClick={() => onOpenBoard(courante.board_id)}>
                  {lieu(courante)}
                </button>
                {badgeEcheance(courante)}
              </div>

              <h1 className="fx-title">{courante.title}</h1>

              {prochaine && (
                <div className="fx-step">
                  <span className="fx-step__text">
                    <span className="fx-step__eyebrow">
                      Étape {etapesFaites + 1} sur {etapes.length}
                    </span>
                    <span className="fx-step__title">{prochaine.title}</span>
                  </span>
                  <span
                    className="fx-step__bars"
                    role="img"
                    aria-label={`${etapesFaites} étapes faites sur ${etapes.length}`}
                    style={encre(courante.quadrant)}
                  >
                    {etapes.map((s) => (
                      <span key={s.id} className={`fx-bar${s.done ? ' fx-bar--on' : ''}`} />
                    ))}
                  </span>
                  <button
                    className="fx-step__go"
                    style={encre(courante.quadrant)}
                    onClick={() => etapeFaite(prochaine)}
                  >
                    Étape faite
                  </button>
                </div>
              )}

              <div className="fx-acts">
                <button className="fx-go" onClick={() => terminer(courante)}>
                  <Icon size={24}>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </Icon>
                  C'est fait
                </button>
                <div className="fx-minors">
                  {restantes.length > 1 && (
                    <button className="shero__ghost" onClick={() => plusTard(courante)}>
                      Plus tard dans la journée
                    </button>
                  )}
                  <button
                    className="shero__ghost"
                    aria-label={`Retirer « ${courante.title} » d'aujourd'hui`}
                    onClick={() => retirer(courante)}
                  >
                    Retirer d'aujourd'hui
                  </button>
                </div>
              </div>
            </div>
          ) : toutFait ? (
            <div className="fx-now">
              <h1 className="fx-title">Journée faite.</h1>
              <p className="fx-lead">
                {today.length >= limit
                  ? 'Tout ce que vous aviez choisi est fait. Le reste attendra demain, chacun dans sa case.'
                  : 'Tout ce que vous aviez choisi est fait. Inutile de remplir pour remplir.'}
              </p>
              <button className="fx-link" onClick={onHome}>
                Revenir à mes matrices
              </button>
            </div>
          ) : (
            <div className="fx-now">
              <h1 className="fx-title">Par quoi commencer&#8239;?</h1>
              <p className="fx-lead">
                Rien n'est choisi pour aujourd'hui. Prenez une tâche et elle occupera tout l'écran
                jusqu'à ce qu'elle soit faite. {limit > 1 ? `${limit} au plus.` : 'Une seule.'}
              </p>
              {candidates.length > 0 ? (
                <ul className="fx-starters">
                  {candidates.map(({ task, reason }) => (
                    <li key={task.id} className="fx-starter">
                      <span className="fx-starter__text">
                        <span className="fx-starter__title">{task.title}</span>
                        <span className="fx-starter__why">
                          <span
                            className="fx-chip fx-chip--quad"
                            style={encre(task.quadrant)}
                          >
                            {quadrant(task.quadrant).label}
                          </span>
                          {motif(task, reason)}
                        </span>
                      </span>
                      <button className="shero__ghost" onClick={() => ajouter(task)}>
                        Commencer par celle-ci
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="fx-lead">
                  Rien à proposer : ni « Faire » ni « Planifier » n'ont de tâche ouverte. Ouvrez une
                  matrice et désignez-en une par le menu <span className="focus-kbd">⋯</span> d'une
                  carte.
                </p>
              )}
            </div>
          )}

          {courante && (suite.length > 0 || libres > 0) && (
            <section className="fx-queue" aria-labelledby="fx-ensuite">
              <h2 className="shero__eyebrow" id="fx-ensuite">Ensuite</h2>
              <ol className="fx-queue__list">
                {suite.map((t) => (
                  <li key={t.id} className="fx-queue__item">
                    <span
                      className="fx-egg fx-egg--next"
                      aria-hidden="true"
                      style={encre(t.quadrant)}
                    />
                    <span className="fx-queue__title">{t.title}</span>
                    <button
                      className="shero__ghost shero__ghost--small"
                      aria-label={`Passer « ${t.title} » devant`}
                      onClick={() => passerDevant(t)}
                    >
                      Passer devant
                    </button>
                  </li>
                ))}
                {Array.from({ length: libres }, (_, i) => (
                  <li key={`libre-${i}`} className="fx-queue__item fx-queue__item--free">
                    <span className="fx-egg fx-egg--free" aria-hidden="true" />
                    <span className="fx-queue__title">Place libre</span>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </ScreenHero>

      <div className="focus">
        <section className="fx-panel" aria-labelledby="fx-fait">
          <h2 className="fx-panel__title" id="fx-fait">Déjà fait</h2>
          {faites.length === 0 ? (
            <p className="fx-panel__empty">Rien encore. Le premier œuf est le plus dur.</p>
          ) : (
            faites.map((t) => (
              <div className="fx-row" key={t.id}>
                <span
                  className="fx-egg fx-egg--done"
                  aria-hidden="true"
                  style={encre(t.quadrant)}
                />
                <span className="fx-row__text">
                  <span className="fx-row__title fx-row__title--done">{t.title}</span>
                  <span className="fx-row__meta">{lieu(t)}</span>
                </span>
                <button
                  className="fx-row__act"
                  aria-label={`Rouvrir « ${t.title} »`}
                  onClick={() => rouvrir(t)}
                >
                  Rouvrir
                </button>
              </div>
            ))
          )}
        </section>

        {/* Les places libres ne s'affichent que s'il en reste ET qu'il y a déjà
            quelqu'un : à zéro tâche, les candidates sont déjà dans le bandeau. */}
        {!vide && (
          <section className="fx-panel" aria-labelledby="fx-places">
            <h2 className="fx-panel__title" id="fx-places">
              {libres === 0 ? `${today.length} places prises` : 'Places libres'}
            </h2>
            <p className="fx-panel__empty">
              {libres === 0
                ? "Pour faire entrer autre chose, retirez d'abord une tâche. C'est voulu."
                : candidates.length === 0
                  ? "Plus rien d'urgent à proposer. Profitez-en."
                  : `${libres > 1 ? `${libres} places restent` : 'Une place reste'} pour aujourd'hui. Quelques candidates de « Faire » et « Planifier » :`}
            </p>
            {libres > 0 &&
              candidates.map(({ task, reason }) => (
                <div className="fx-row" key={task.id}>
                  <span className="fx-row__text">
                    <span className="fx-row__title">{task.title}</span>
                    <span className="fx-row__meta">
                      <span
                        className="fx-chip fx-chip--quad fx-chip--ink"
                        style={encre(task.quadrant)}
                      >
                        {quadrant(task.quadrant).label}
                      </span>
                      {motif(task, reason)}
                    </span>
                  </span>
                  <button
                    className="fx-row__act"
                    aria-label={`Ajouter « ${task.title} » à aujourd'hui`}
                    onClick={() => ajouter(task)}
                  >
                    Ajouter
                  </button>
                </div>
              ))}
          </section>
        )}

        <aside className="fx-aside">
          <div className="focus-limit">
            {tuning ? (
              <label className="focus-limit__field">
                Tâches par jour
                <input
                  type="number"
                  min={1}
                  max={FOCUS_MAX}
                  value={limit}
                  autoFocus
                  onChange={(e) => setLimite(Number(e.target.value))}
                  onBlur={() => setTuning(false)}
                />
              </label>
            ) : (
              <button className="focus-limit__btn" onClick={() => setTuning(true)}>
                Limite : {limit} par jour
              </button>
            )}
            {/* Dit une fois, et sans détour : le ticket demande de ne pas
                encourager plus, autant l'assumer à l'écran. */}
            <span className="focus-limit__why">
              Trois est un choix, pas une contrainte technique : une liste de quinze n'est plus un
              focus. Ici, une seule tâche à l'écran ; les autres attendent leur tour.
            </span>
          </div>

          {bilan && (bilan.done.length > 0 || bilan.returned.length > 0) && (
            <section className="focus-bilan" aria-label="Bilan de la dernière journée">
              <h2 className="focus-bilan__title">{focusDayLabel(bilan.day)}</h2>
              {bilan.done.length > 0 && (
                <div className="focus-bilan__group">
                  <span className="focus-bilan__label">Fait</span>
                  <ul className="focus-bilan__ul">
                    {bilan.done.map((t) => (
                      <li key={t.id}>{t.title}</li>
                    ))}
                  </ul>
                </div>
              )}
              {bilan.returned.length > 0 && (
                <div className="focus-bilan__group">
                  {/* « Reparti », jamais « non fait » : ces tâches ne sont pas un
                      échec, elles ont retrouvé leur case et attendent un autre
                      jour. Le ticket écrit « sans reproche ». */}
                  <span className="focus-bilan__label">Reparti au pot commun</span>
                  <ul className="focus-bilan__ul">
                    {bilan.returned.map((t) => (
                      <li key={t.id}>{t.title}</li>
                    ))}
                  </ul>
                  <p className="focus-bilan__note">Ces tâches ont retrouvé leur case.</p>
                </div>
              )}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
