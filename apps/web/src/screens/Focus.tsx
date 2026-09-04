import { useMemo, useState } from 'react';
import {
  FOCUS_MAX,
  focusBilan,
  focusDayLabel,
  focusToday,
  localDay,
  quadrant,
  type Task,
} from '@penduline/shared';
import type { Store } from '../data/store';
import { TaskCard } from '../components/TaskCard';
import { useCompletion } from '../data/useCompletion';
import { useFocus } from '../data/useFocus';
import { readFocusLimit, writeFocusLimit } from '../data/focusPrefs';

/**
 * Le mode « aujourd'hui » (#49).
 *
 * Écran délibérément pauvre : les tâches choisies, et rien d'autre. Pas de cases,
 * pas de compteurs de quadrant, pas de recherche de plus. Le dépouillement n'est
 * pas une économie de travail — c'est la fonctionnalité.
 *
 * La liste vient de `useFocus` et non de `store.tasks`, parce qu'une tâche cochée
 * sort du second (#40) : l'écran afficherait « 2 tâches » au lieu de « 3
 * choisies, 1 faite », et perdrait le sentiment d'avancement qui le justifie.
 */
export function FocusScreen({ store }: { store: Store }) {
  const { tasks: focusTasks, loading, failed, refresh } = useFocus();
  const [limit, setLimit] = useState(readFocusLimit);
  const [tuning, setTuning] = useState(false);
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const [renamingTask, setRenamingTask] = useState<{ id: string; title: string } | null>(null);

  // `store.tasks` pour cocher : c'est lui qui porte l'état optimiste, et
  // `useCompletion` a besoin de la liste complète pour dénouer les paires.
  const { onCheck } = useCompletion(store.tasks, store.patchTask);

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

  const faites = today.filter((t) => t.done).length;

  function setLimite(n: number) {
    const borne = Math.min(FOCUS_MAX, Math.max(1, n));
    setLimit(borne);
    writeFocusLimit(borne);
  }

  /** Sortir une tâche de la sélection, depuis l'écran lui-même. */
  function retirer(t: Task) {
    store.group("Retirée d'aujourd'hui", () => void store.patchTask(t.id, { focus_day: null }));
    setMenuTask(null);
    refresh();
  }

  function commitRename() {
    if (!renamingTask) return;
    const title = renamingTask.title.trim();
    const before = focusTasks.find((t) => t.id === renamingTask.id)?.title;
    if (title && title !== before) {
      const id = renamingTask.id;
      store.group('Renommée', () => void store.patchTask(id, { title }));
      refresh();
    }
    setRenamingTask(null);
  }

  function ligne(t: Task) {
    const board = store.boards.find((b) => b.id === t.board_id);
    return (
      <div className={`focus-item${t.done ? ' focus-item--done' : ''}`} key={t.id}>
        <span className="focus-item__board">{board?.name ?? '—'}</span>
        <TaskCard
          task={t}
          quad={quadrant(t.quadrant)}
          tasks={store.tasks}
          otherBoards={store.boards.filter((b) => b.id !== t.board_id)}
          // `false` et non `t.pinned` : épingler veut dire « en haut de sa
          // case », et cet écran n'a pas de case. Le fanion y désignerait un
          // ordre qui n'existe pas.
          pinnedCard={false}
          menuOpen={menuTask === t.id}
          onMenu={(open) => setMenuTask(open ? t.id : null)}
          rename={{
            value: renamingTask?.id === t.id ? renamingTask.title : null,
            start: () => setRenamingTask({ id: t.id, title: t.title }),
            change: (value) => setRenamingTask({ id: t.id, title: value }),
            cancel: () => setRenamingTask(null),
            commit: commitRename,
          }}
          onCheck={() => {
            onCheck(t);
            refresh();
          }}
          // Déplacer une tâche entre cases ou matrices n'a rien à faire ici :
          // l'écran sert à FAIRE, pas à ranger. Les gestes de classement restent
          // sur la matrice, où ils ont leur contexte.
          onMoveQuad={() => undefined}
          onMoveBoard={() => undefined}
          onTogglePin={() => undefined}
          onUnpair={() => undefined}
          onDelete={() => retirer(t)}
          // `focus` présent avec `on: true` : la seule action offerte est de
          // sortir de la sélection.
          focus={{ on: true, refusal: null, toggle: () => retirer(t) }}
        />
      </div>
    );
  }

  return (
    <div className="focus">
      <div className="focus-head">
        <h1 className="focus-title">Aujourd'hui</h1>
        {/* Le compteur nu « 2 / 3 » ne s'énonce pas : il est doublé d'un texte
            explicite pour le lecteur d'écran. */}
        <span className="focus-count" aria-hidden="true">
          {faites} / {today.length || limit}
        </span>
        <span className="sr-only">
          {today.length === 0
            ? `Aucune tâche choisie, limite de ${limit}.`
            : `${faites} tâche${faites > 1 ? 's' : ''} faite${faites > 1 ? 's' : ''} sur ${today.length} choisie${today.length > 1 ? 's' : ''}.`}
        </span>
      </div>

      {failed ? (
        <p className="focus-empty">
          La sélection du jour n'a pas pu être chargée. Elle se lit sur le serveur, qui n'a pas
          répondu.
        </p>
      ) : loading ? (
        <p className="focus-empty">Lecture…</p>
      ) : (
        <>
          {today.length > 0 ? (
            <div className="focus-list">{today.map(ligne)}</div>
          ) : (
            <p className="focus-empty">
              Rien de choisi pour aujourd'hui. Ouvrez une matrice et désignez vos tâches par le
              menu <span className="focus-kbd">⋯</span> d'une carte.
            </p>
          )}

          {/* La place restante est dite, et la limite avec elle : c'est la
              contrainte qui fait la valeur du mode, elle doit se voir. */}
          {today.length > 0 && today.length < limit && (
            <p className="focus-room">
              {limit - today.length === 1
                ? 'Une place reste libre.'
                : `${limit - today.length} places restent libres.`}
            </p>
          )}

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
              Trois est un choix, pas une contrainte technique : une liste de quinze n'est plus
              un focus.
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
        </>
      )}
    </div>
  );
}
