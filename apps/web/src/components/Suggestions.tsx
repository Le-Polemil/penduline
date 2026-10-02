import { useMemo, useState } from 'react';
import {
  ageInDays,
  endPosition,
  homeSuggestions,
  orderedBoards,
  planPairMove,
  reviewSignals,
  sinceLabel,
  snoozeUntil,
  visibleTasks,
  type QuadrantKey,
  type Suggestion,
  type Task,
  type TaskWrite,
} from '@penduline/shared';
import { quadrant } from '../lib/quads';
import type { Store } from '../data/store';
import { useReview } from '../data/useReview';
import { readLastReview, readThresholds } from '../data/reviewPrefs';
import { readSnoozed, writeSnoozed } from '../data/suggestionPrefs';
import { withVT } from '../lib/viewTransition';
import { Deadline } from './Deadline';

/** Le libellé court de chaque sorte de suggestion — le nom du constat, pas un jugement. */
const KIND_LABEL: Record<Suggestion['kind'], string> = {
  parking: 'À trier',
  doing: 'Urgence qui dure',
  neverMoved: 'Jamais reclassée',
  dormant: 'Matrice endormie',
  eliminer: 'Éliminer déborde',
};

/**
 * Le repère « dernière revue », repris de l'ancienne lentille de l'accueil :
 * un repère passif, pas une relance (#47). Arrondi au jour plein.
 */
function lastReviewLabel(): string {
  const last = readLastReview();
  const days = last ? ageInDays(last, Date.now()) : null;
  if (days === null) return 'revue jamais consultée';
  const d = Math.floor(days);
  if (d <= 0) return 'revue consultée aujourd’hui';
  return `dernière revue il y a ${d} jour${d > 1 ? 's' : ''}`;
}

/** Combien de suggestions en attente l'accueil montre à la fois. */
const MAX_SHOWN = 3;

/** Ce qu'un geste a produit, affiché à la place des boutons avec « Annuler ». */
type Outcome = { text: string; storeUndo: boolean; snoozed: boolean };

/**
 * « Ça stagne » : quelques constats de la revue, chacun avec les gestes qui le
 * règlent sur place.
 *
 * Rien n'est calculé ici : les signaux viennent de `reviewSignals`, avec les
 * seuils réglés dans la revue, et `homeSuggestions` n'en garde qu'une poignée.
 * Les écritures passent par `planPairMove` et `store.group`, comme dans la
 * revue — un déplacement emmène donc sa paire, et `Ctrl+Z` le défait.
 *
 * Les matrices en lecture seule sont écartées : on n'y propose pas un geste que
 * la base refuserait.
 */
export function Suggestions({
  store,
  onOpenBoard,
  onReview,
}: {
  store: Store;
  onOpenBoard: (boardId: string) => void;
  onReview: () => void;
}) {
  const { tasks, patchTask } = store;
  const { stats, refresh } = useReview();
  const [snoozed, setSnoozed] = useState<Record<string, string>>(readSnoozed);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  /** La suggestion dont le champ d'échéance est ouvert. Une seule à la fois. */
  const [dating, setDating] = useState<string | null>(null);
  /**
   * La dernière suggestion réglée par une ÉCRITURE. `store.undo()` défait le
   * dernier geste, pas un geste choisi : « Annuler » n'est donc offert que sur
   * celle-ci — l'offrir plus haut défairait autre chose que ce qu'on montre.
   */
  const [lastWrite, setLastWrite] = useState<string | null>(null);

  const writable = useMemo(
    () => orderedBoards(store.universes, store.boards).filter((b) => b.role !== 'lecture'),
    [store.universes, store.boards],
  );

  // Les suggestions résolues restent affichées (avec « Annuler ») le temps de la
  // visite : on les fige donc dans la liste tant qu'elles portent un résultat,
  // sinon la ligne disparaîtrait sous le doigt au moment où le geste aboutit.
  const items = useMemo(() => {
    const ids = new Set(writable.map((b) => b.id));
    const signals = reviewSignals({
      tasks: tasks.filter((t) => ids.has(t.board_id)),
      boards: writable,
      stats,
      thresholds: readThresholds(),
    });
    // Toutes, puis trois au rendu : le reste se compte (« + N autres »).
    return homeSuggestions({ signals, snoozed, limit: Number.POSITIVE_INFINITY });
  }, [tasks, writable, stats, snoozed]);

  const [pinned, setPinned] = useState<Suggestion[]>([]);
  // Trois en attente au plus. Une suggestion réglée garde sa ligne (son résultat
  // et « Annuler ») et la suivante prend la place libérée — d'où le calcul en
  // deux temps : les réglées d'abord écartées du compte, puis remises.
  const pending = items.filter((i) => !outcomes[i.key]);
  const visible = pending.slice(0, MAX_SHOWN);
  const more = pending.length - visible.length;
  const settled = [
    ...items.filter((i) => outcomes[i.key]),
    ...pinned.filter((p) => outcomes[p.key] && !items.some((i) => i.key === p.key)),
  ];
  const shown = [...settled, ...visible];

  if (shown.length === 0) return null;

  const boardName = (id: string) => store.boards.find((b) => b.id === id)?.name ?? '';

  function resolve(s: Suggestion, outcome: Outcome) {
    setPinned((prev) => [...prev.filter((p) => p.key !== s.key), s]);
    setOutcomes((prev) => ({ ...prev, [s.key]: outcome }));
    if (outcome.storeUndo) setLastWrite(s.key);
  }

  function apply(label: string, writes: TaskWrite[]) {
    store.group(label, () => {
      for (const w of writes) void patchTask(w.id, w.patch);
    });
  }

  function move(s: Suggestion, task: Task, quad: QuadrantKey) {
    const pos = endPosition(visibleTasks(tasks, task.board_id, quad));
    const label = `Déplacée vers « ${quadrant(quad).label} »`;
    withVT(() => apply(label, planPairMove(tasks, task, { quadrant: quad }, pos)));
    // Sortir d'« Éliminer » ou y entrer change un fait que seul le serveur connaît.
    refresh();
    resolve(s, { text: `${label}.`, storeUndo: true, snoozed: false });
  }

  /** Tait la suggestion un mois. Sans effet visible tant que la ligne porte son résultat. */
  function sleep(key: string) {
    setSnoozed((prev) => {
      const next = { ...prev, [key]: snoozeUntil(Date.now(), 30) };
      writeSnoozed(next);
      return next;
    });
  }

  function snooze(s: Suggestion) {
    resolve(s, { text: 'Plus de rappel pendant un mois.', storeUndo: false, snoozed: true });
    sleep(s.key);
  }

  function undo(s: Suggestion) {
    const o = outcomes[s.key];
    if (!o) return;
    if (o.storeUndo) {
      store.undo();
      setLastWrite(null);
    }
    if (o.snoozed) {
      setSnoozed((prev) => {
        const next = { ...prev };
        delete next[s.key];
        writeSnoozed(next);
        return next;
      });
    }
    setOutcomes((prev) => {
      const next = { ...prev };
      delete next[s.key];
      return next;
    });
    setPinned((prev) => prev.filter((p) => p.key !== s.key));
  }

  return (
    <section className="stuck" aria-labelledby="stuck-title">
      <div className="stuck__head">
        <h2 className="stuck__title" id="stuck-title">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
          Ça stagne
        </h2>
        <button className="stuck__all" onClick={onReview}>Tout revoir ›</button>
        <span className="stuck__last">{lastReviewLabel()}</span>
      </div>
      <ul className="stuck__list" aria-live="polite">
        {shown.map((s) => {
          const outcome = outcomes[s.key];
          const title = 'task' in s ? s.task.title : s.board.name;
          const since = sinceLabel(s.days);
          const why =
            s.kind === 'parking' ? `sans case depuis ${since} · ${boardName(s.task.board_id)}`
            : s.kind === 'doing' ? `dans Faire depuis ${since} · ${boardName(s.task.board_id)}`
            : s.kind === 'neverMoved' ? `dans ${quadrant(s.task.quadrant).label} depuis ${since} · ${boardName(s.task.board_id)}`
            : s.kind === 'dormant' ? (since ? `aucune activité depuis ${since}` : 'aucune activité récente')
            : 'des tâches s’y accumulent sans en sortir';
          return (
            <li key={s.key} className="stuck__item">
              <span className="stuck__text">
                <span className="stuck__line">
                  <span className="stuck__kind">{KIND_LABEL[s.kind]}</span>
                  <span className="stuck__name">{title}</span>
                </span>
                <span className="stuck__why">{why}</span>
              </span>
              {outcome ? (
                <span className="stuck__done">
                  {outcome.text}
                  {(!outcome.storeUndo || lastWrite === s.key) && (
                    <button className="stuck__undo" onClick={() => undo(s)}>Annuler</button>
                  )}
                </span>
              ) : (
                <span className="stuck__acts">
                  {s.kind === 'parking' &&
                    (['faire', 'planifier', 'deleguer', 'eliminer'] as QuadrantKey[]).map((q) => (
                      <button key={q} className={`stuck__act stuck__act--${q}`} onClick={() => move(s, s.task, q)}>
                        {quadrant(q).label}
                      </button>
                    ))}
                  {s.kind === 'doing' && (
                    <>
                      <button className="stuck__act stuck__act--planifier" onClick={() => move(s, s.task, 'planifier')}>Planifier</button>
                      <button className="stuck__act stuck__act--deleguer" onClick={() => move(s, s.task, 'deleguer')}>Déléguer</button>
                      <button className="stuck__act" onClick={() => snooze(s)}>Je garde</button>
                    </>
                  )}
                  {s.kind === 'neverMoved' && (
                    <>
                      <button
                        className="stuck__act stuck__act--planifier"
                        aria-expanded={dating === s.key}
                        onClick={() => setDating((d) => (d === s.key ? null : s.key))}
                      >
                        Donner une date
                      </button>
                      {s.task.quadrant !== 'eliminer' && (
                        <button className="stuck__act stuck__act--eliminer" onClick={() => move(s, s.task, 'eliminer')}>Éliminer</button>
                      )}
                      <button className="stuck__act" onClick={() => snooze(s)}>Je garde</button>
                    </>
                  )}
                  {(s.kind === 'dormant' || s.kind === 'eliminer') && (
                    <>
                      <button className="stuck__act stuck__act--open" onClick={() => onOpenBoard(s.board.id)}>
                        {s.kind === 'dormant' ? 'Ouvrir' : 'Voir'}
                      </button>
                      <button className="stuck__act" onClick={() => snooze(s)}>Je garde</button>
                    </>
                  )}
                </span>
              )}
              {'task' in s && dating === s.key && !outcome && (
                <Deadline
                  task={s.task}
                  editing
                  onCancel={() => setDating(null)}
                  onSet={(dueAt) => {
                    const id = s.task.id;
                    store.group('Échéance fixée', () => void patchTask(id, { due_at: dueAt }));
                    // Une échéance ne change pas de case : sans mise en sommeil, la
                    // même suggestion reviendrait dès la prochaine visite.
                    resolve(s, {
                      text: `Échéance : ${new Date(dueAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
                      storeUndo: true,
                      snoozed: true,
                    });
                    sleep(s.key);
                  }}
                  onClear={() => {}}
                />
              )}
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <button className="stuck__more" onClick={onReview}>
          + {more} {more > 1 ? 'autres suggestions' : 'autre suggestion'} dans la Revue
        </button>
      )}
    </section>
  );
}
