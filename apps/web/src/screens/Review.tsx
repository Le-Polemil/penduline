import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ageInDays,
  countOpen,
  deleteLabel,
  endPosition,
  isOpenRow,
  orderedBoards,
  planDelete,
  planPairMove,
  reviewSignals,
  sinceLabel,
  snoozeUntil,
  suggestionKey,
  visibleTasks,
  type BoardRange,
  type QuadrantKey,
  type ReviewSignal,
  type ReviewSignalKey,
  type ReviewThresholds,
  type Task,
  type TaskWrite,
} from '@penduline/shared';
import { QUADS, quadrant } from '../lib/quads';
import { withVT } from '../lib/viewTransition';
import type { Store } from '../data/store';
import { Deadline } from '../components/Deadline';
import { ScreenHero } from '../components/ScreenHero';
import { AxisGrid } from '../components/AxisGrid';
import { Icon } from '../components/Icons';
import { useReview } from '../data/useReview';
import { useNow } from '../data/useNow';
import { useAnnounce } from '../a11y/announce';
import { readSnoozed, writeSnoozed } from '../data/suggestionPrefs';
import { markReviewed, readLastReview, readThresholds, writeThresholds } from '../data/reviewPrefs';

/** Le seuil que chaque signal expose au réglage. */
const TUNABLE: Record<ReviewSignalKey, keyof ReviewThresholds> = {
  parking: 'parkingDays',
  neverMoved: 'neverMovedDays',
  doing: 'doingDays',
  dormant: 'dormantDays',
  eliminer: 'eliminerStaleDays',
};

/**
 * Les paliers offerts par signal.
 *
 * Des PALIERS et non un champ libre : un seuil est un ordre de grandeur, pas un
 * réglage fin. « 14 ou 21 jours » est une question qu'on sait trancher ; « 17 ou
 * 18 » n'en est pas une, et un champ numérique la pose quand même.
 */
const STEPS: Record<ReviewSignalKey, number[]> = {
  parking: [7, 10, 14, 21, 30],
  doing: [3, 5, 7, 10, 14],
  neverMoved: [14, 21, 30, 45, 60],
  dormant: [14, 21, 30, 45, 60],
  eliminer: [14, 21, 30, 45, 60],
};

/** Le nom court de chaque signal — celui de la pile et de la progression. */
const SHORT: Record<ReviewSignalKey, string> = {
  parking: 'À trier',
  doing: '« Faire » qui dure',
  neverMoved: 'Jamais reclassées',
  dormant: 'Matrices endormies',
  eliminer: '« Éliminer » déborde',
};

/** La question que chaque signal pose à la carte. */
const QUESTION: Record<ReviewSignalKey, string> = {
  parking: 'Où la ranger ?',
  doing: 'Toujours urgente ?',
  neverMoved: 'Elle mérite une date ?',
  dormant: 'Ce contexte existe encore ?',
  eliminer: 'On fait le ménage ?',
};

/**
 * La teinte qui habille un signal. Les trois signaux de tâche empruntent la
 * couleur de la case dont ils parlent ; les deux signaux de matrice restent
 * neutres — ils ne parlent d'aucune case en particulier.
 */
const TONE: Record<ReviewSignalKey, QuadrantKey | 'neutre'> = {
  parking: 'parking',
  doing: 'faire',
  neverMoved: 'planifier',
  dormant: 'neutre',
  eliminer: 'eliminer',
};

/** Ce qu'un geste a produit, et par quel chemin on peut le défaire. */
interface Outcome {
  text: string;
  /** Le geste a écrit : `store.undo()` sait le défaire — mais seulement s'il est le dernier. */
  storeUndo: boolean;
  /** Le geste a mis le signal en sommeil : réversible indépendamment. */
  snoozed: boolean;
}

/** Une décision offerte sur la carte courante. */
interface Decision {
  label: string;
  hint: string;
  /** La touche qui la déclenche, et qui s'affiche sur le bouton. */
  key: string;
  /** La teinte du bouton : une case, « ouvrir », ou neutre. */
  tone: QuadrantKey | 'ouvrir' | 'neutre';
  run: () => void;
}

/** Un élément de la pile : ce qu'on regarde, et le signal qui l'y a mis. */
interface Item {
  key: string;
  signal: ReviewSignal;
  board: BoardRange;
  /** Absent sur les signaux de matrice. */
  task?: Task;
  days: number | null;
}

/**
 * La revue périodique, une décision à la fois (#47).
 *
 * L'ancien écran empilait cinq sections dépliables : on arrivait devant trente
 * lignes et on repartait sans en toucher une. Ici la pile est la même — les
 * mêmes `reviewSignals`, les mêmes seuils — mais elle se présente CARTE PAR
 * CARTE, avec la question du signal et les deux ou quatre réponses possibles.
 * Le reste de la pile reste visible à droite, pour savoir où l'on en est et y
 * revenir.
 *
 * L'écran ne calcule toujours RIEN : tout vient de `packages/shared`, pur et
 * testé ; ici on ne fait que rendre et agir.
 *
 * ⚠️ **Ce que la carte n'offre pas, « Ouvrir » le rend.** L'ancien écran posait
 * une vraie `TaskCard` par ligne, avec son menu `⋯` complet — renommer,
 * déplacer vers une autre matrice, pièces jointes, étapes, engagement du jour.
 * Une carte de décision ne peut pas porter tout ça sans redevenir la liste qu'on
 * fuyait. Chaque carte porte donc « Ouvrir » : la matrice s'ouvre sur la tâche,
 * mise en évidence, là où tous les gestes vivent déjà.
 *
 * ⚠️ **Les matrices en lecture seule sont écartées** (#53), comme dans « Ça
 * stagne » : chaque carte demande une décision, et on ne demande pas une
 * décision qu'on n'a pas le droit d'appliquer.
 */
export function ReviewScreen({
  store,
  onOpenBoard,
}: {
  store: Store;
  onOpenBoard: (boardId: string, taskId?: string) => void;
}) {
  const { tasks, patchTask } = store;
  const { stats, loading, failed, refresh } = useReview();
  const [thresholds, setThresholds] = useState<ReviewThresholds>(readThresholds);
  const [snoozed, setSnoozed] = useState<Record<string, string>>(readSnoozed);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  /**
   * La dernière décision réglée par une ÉCRITURE.
   *
   * ⚠️ `store.undo()` défait le DERNIER geste, pas un geste choisi. Le bilan ne
   * peut donc pas offrir « Annuler » sur chaque ligne, contrairement à la
   * maquette : il l'offre sur la dernière écriture, et sur les mises en sommeil,
   * qui sont locales et se défont une par une. Proposer plus défairait autre
   * chose que ce que la ligne montre.
   */
  const [lastWrite, setLastWrite] = useState<string | null>(null);
  /** Les cartes passées sans décider. Local à la visite : passer n'est pas un geste. */
  const [passees, setPassees] = useState<Set<string>>(new Set());
  const [cur, setCur] = useState(0);
  /** On est au bilan — soit la pile est finie, soit on a demandé à s'arrêter. */
  const [bilan, setBilan] = useState(false);
  const [seuilsOpen, setSeuilsOpen] = useState(false);
  /** La carte dont le champ d'échéance est ouvert. Une seule à la fois. */
  const [dating, setDating] = useState<string | null>(null);

  const now = useNow();
  const announce = useAnnounce();
  /** Les décisions de la carte courante, pour le gestionnaire de clavier. */
  const decisionsRef = useRef<Decision[]>([]);

  // Consulter la revue EST la revue : on horodate à l'arrivée, pas sur un bouton
  // « j'ai terminé » que personne ne cliquerait.
  useEffect(() => markReviewed(), []);
  useEffect(() => writeThresholds(thresholds), [thresholds]);

  /** Les matrices où un geste est possible — les seules que la revue regarde. */
  const boards = useMemo(
    () => orderedBoards(store.universes, store.boards).filter((b) => b.role !== 'lecture'),
    [store.universes, store.boards],
  );

  const signals = useMemo(() => {
    const ids = new Set(boards.map((b) => b.id));
    return reviewSignals({
      tasks: tasks.filter((t) => ids.has(t.board_id)),
      boards,
      stats,
      thresholds,
    });
  }, [tasks, boards, stats, thresholds]);

  /**
   * La pile : tous les éléments au-dessus de leur seuil, dans l'ordre des
   * signaux. Ce qui a été réglé y RESTE — sinon la carte disparaîtrait sous le
   * doigt au moment où le geste aboutit, et la progression reculerait.
   */
  const [epingles, setEpingles] = useState<{ at: number; item: Item }[]>([]);
  const queue = useMemo(() => {
    const out: Item[] = [];
    for (const signal of signals) {
      if (signal.kind === 'tasks') {
        for (const task of signal.tasks) {
          const key = suggestionKey(signal.key, task.id);
          if (snoozed[key]) continue;
          const board = boards.find((b) => b.id === task.board_id);
          if (!board) continue;
          const stamp = signal.key === 'parking' ? task.created_at : task.quadrant_changed_at;
          const d = ageInDays(stamp, now);
          out.push({ key, signal, board, task, days: d === null ? null : Math.floor(d) });
        }
      } else {
        for (const board of signal.boards) {
          const key = suggestionKey(signal.key, board.id);
          if (snoozed[key]) continue;
          const s = stats.find((x) => x.board_id === board.id);
          const stamp = signal.key === 'dormant' ? s?.last_activity ?? null : s?.eliminer_last_cleared ?? null;
          const d = ageInDays(stamp, now);
          out.push({ key, signal, board, days: d === null ? null : Math.floor(d) });
        }
      }
    }
    // Les éléments réglés ont quitté les signaux (ou leur mise en sommeil les a
    // écartés) : on les remet À LEUR PLACE pour que la pile ne rétrécisse pas —
    // et surtout pas en fin de file, qui ferait sauter la progression, les
    // index de navigation et les couleurs de la jauge sous les doigts.
    for (const p of [...epingles].sort((a, b) => a.at - b.at)) {
      if (!out.some((i) => i.key === p.item.key)) out.splice(Math.min(p.at, out.length), 0, p.item);
    }
    return out;
  }, [signals, boards, stats, snoozed, now, epingles]);

  const total = queue.length;
  const reglees = queue.filter((i) => outcomes[i.key]).length;
  const ouverte = (i: Item) => !outcomes[i.key] && !passees.has(i.key);

  /** La prochaine carte à regarder après `from`, en faisant le tour. `-1` = plus rien. */
  function suivante(from: number): number {
    for (let i = from + 1; i < total; i++) if (ouverte(queue[i])) return i;
    for (let i = 0; i <= Math.min(from, total - 1); i++) if (ouverte(queue[i])) return i;
    return -1;
  }

  const index = Math.min(cur, Math.max(0, total - 1));
  const item: Item | null = total > 0 && !bilan ? queue[index] : null;

  // ── Écritures ──────────────────────────────────────────────────────────────
  function apply(label: string, writes: TaskWrite[]) {
    store.group(label, () => {
      for (const w of writes) void patchTask(w.id, w.patch);
    });
  }

  /** Enregistre le résultat, épingle la carte, et passe à la suivante. */
  function regler(i: Item, outcome: Outcome) {
    setEpingles((prev) => [...prev.filter((p) => p.item.key !== i.key), { at: index, item: i }]);
    setOutcomes((prev) => ({ ...prev, [i.key]: outcome }));
    if (outcome.storeUndo) setLastWrite(i.key);
    announce(outcome.text);
    const nx = suivante(index);
    if (nx < 0) setBilan(true);
    else setCur(nx);
  }

  function move(i: Item, task: Task, quad: QuadrantKey) {
    const pos = endPosition(visibleTasks(tasks, task.board_id, quad));
    const label = `Déplacée vers « ${quadrant(quad).label} »`;
    withVT(() => apply(label, planPairMove(tasks, task, { quadrant: quad }, pos)));
    // Entrer dans « Éliminer » ou en sortir change un fait que seul le serveur
    // connaît (`eliminer_open`), et que la mémoire ne peut pas recalculer.
    refresh();
    regler(i, { text: `${label}.`, storeUndo: true, snoozed: false });
  }

  /** Tait le signal un mois — pour CET objet seulement. */
  function dormir(key: string) {
    setSnoozed((prev) => {
      const next = { ...prev, [key]: snoozeUntil(Date.now(), 30) };
      writeSnoozed(next);
      return next;
    });
  }

  function garder(i: Item) {
    dormir(i.key);
    regler(i, { text: 'Plus de rappel pendant un mois.', storeUndo: false, snoozed: true });
  }

  /** Vide « Éliminer » d'une matrice vers la corbeille, en UN geste annulable. */
  function menage(i: Item) {
    const victimes = tasks.filter(
      (t) => t.board_id === i.board.id && t.quadrant === 'eliminer' && isOpenRow(t),
    );
    if (victimes.length === 0) return garder(i);
    const label =
      victimes.length > 1
        ? `${victimes.length} tâches supprimées`
        : deleteLabel(tasks, victimes[0]);
    withVT(() => apply(label, victimes.flatMap((t) => planDelete(tasks, t))));
    refresh();
    regler(i, {
      text: `${victimes.length > 1 ? `Les ${victimes.length} tâches sont` : 'La tâche est'} à la corbeille.`,
      storeUndo: true,
      snoozed: false,
    });
  }

  function ouvrir(i: Item) {
    onOpenBoard(i.board.id, i.task?.id);
  }

  function annuler(i: Item) {
    const o = outcomes[i.key];
    if (!o) return;
    if (o.storeUndo) {
      store.undo();
      setLastWrite(null);
      refresh();
    }
    if (o.snoozed) {
      setSnoozed((prev) => {
        const next = { ...prev };
        delete next[i.key];
        writeSnoozed(next);
        return next;
      });
    }
    setOutcomes((prev) => {
      const next = { ...prev };
      delete next[i.key];
      return next;
    });
  }

  // ── Les décisions de la carte courante ─────────────────────────────────────
  function decisions(i: Item): Decision[] {
    const t = i.task;
    switch (i.signal.key) {
      case 'parking':
        return QUADS.map((q, n) => ({
          label: q.label,
          hint: q.sub ?? '',
          key: String(n + 1),
          tone: q.key,
          run: () => move(i, t!, q.key),
        }));
      case 'doing':
        return [
          { label: 'Planifier', hint: 'Importante, mais ça peut attendre', key: '1', tone: 'planifier', run: () => move(i, t!, 'planifier') },
          { label: 'Déléguer', hint: 'Quelqu’un d’autre peut s’en charger', key: '2', tone: 'deleguer', run: () => move(i, t!, 'deleguer') },
          { label: 'Je garde', hint: 'Toujours urgente, je m’y mets', key: '3', tone: 'neutre', run: () => garder(i) },
        ];
      case 'neverMoved': {
        const out: Decision[] = [
          {
            label: 'Donner une date',
            hint: 'Une échéance la fera revenir d’elle-même',
            key: '1',
            tone: 'planifier',
            run: () => setDating((d) => (d === i.key ? null : i.key)),
          },
        ];
        // Proposer « Éliminer » à une tâche qui y est déjà n'aurait pas de sens.
        if (t && t.quadrant !== 'eliminer') {
          out.push({ label: 'Éliminer', hint: 'Elle ne compte plus', key: '2', tone: 'eliminer', run: () => move(i, t, 'eliminer') });
        }
        out.push({ label: 'Je garde', hint: 'Le classement tient toujours', key: String(out.length + 1), tone: 'neutre', run: () => garder(i) });
        return out;
      }
      case 'dormant':
        return [
          { label: 'Ouvrir', hint: 'Aller y faire un tour', key: '1', tone: 'ouvrir', run: () => ouvrir(i) },
          { label: 'Je garde', hint: 'Elle dort, c’est normal', key: '2', tone: 'neutre', run: () => garder(i) },
        ];
      case 'eliminer':
        return [
          { label: 'Faire le ménage', hint: 'À la corbeille, récupérables', key: '1', tone: 'eliminer', run: () => menage(i) },
          { label: 'Ouvrir', hint: 'Les regarder une par une', key: '2', tone: 'ouvrir', run: () => ouvrir(i) },
          { label: 'Je garde', hint: 'Je les assume encore', key: '3', tone: 'neutre', run: () => garder(i) },
        ];
    }
  }

  const decs = item ? decisions(item) : [];
  decisionsRef.current = decs;

  // ── Clavier ────────────────────────────────────────────────────────────────
  /**
   * `1`–`4` décident, `→` passe, `←` revient, `Z` annule, `Échap` montre le bilan.
   *
   * Mêmes gardes que `useSearchShortcut` et `useUndoShortcut` : inerte dans un
   * champ de saisie et derrière une modale. Sans elles, taper « z » dans le champ
   * d'échéance annulerait le geste précédent.
   */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const cible = e.target as HTMLElement | null;
      if (cible?.tagName === 'INPUT' || cible?.tagName === 'TEXTAREA' || cible?.isContentEditable) return;
      if (document.querySelector('[role="dialog"]')) return;

      if (e.key === 'Escape') {
        if (!bilan && total > 0) {
          e.preventDefault();
          setBilan(true);
        }
        return;
      }
      if (bilan) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        passer();
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCur((c) => Math.max(0, c - 1));
        return;
      }
      if (e.key === 'z' || e.key === 'Z') {
        const dernier = queue.find((i) => i.key === lastWrite);
        if (dernier) {
          e.preventDefault();
          annuler(dernier);
        }
        return;
      }
      const n = Number(e.key);
      const d = Number.isInteger(n) ? decisionsRef.current[n - 1] : undefined;
      if (d) {
        e.preventDefault();
        d.run();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // `decisionsRef` évite de réinstaller l'écouteur à chaque rendu de carte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bilan, total, index, lastWrite, queue]);

  function passer() {
    if (!item) return;
    const key = item.key;
    setPassees((prev) => new Set(prev).add(key));
    const nx = suivante(index);
    if (nx < 0) setBilan(true);
    else setCur(nx);
  }

  function reprendre(i: Item) {
    setPassees((prev) => {
      const next = new Set(prev);
      next.delete(i.key);
      return next;
    });
    const n = queue.findIndex((x) => x.key === i.key);
    if (n >= 0) setCur(n);
    setBilan(false);
  }

  // ── Mots et habillage ──────────────────────────────────────────────────────
  function titre(i: Item): string {
    return i.task ? i.task.title : i.board.name;
  }

  function lieu(i: Item): string {
    const uni = i.board.universe_id
      ? store.universes.find((u) => u.id === i.board.universe_id)
      : null;
    if (!i.task) return uni ? `Univers ${uni.name}` : 'Sans univers';
    return uni ? `${i.board.name} · ${uni.name}` : i.board.name;
  }

  /** Le détail sous le titre : ce que la mesure a vu, en une phrase. */
  function meta(i: Item): string {
    const depuis = sinceLabel(i.days);
    switch (i.signal.key) {
      case 'parking':
        return depuis ? `Au parking depuis ${depuis}, sans case.` : 'Au parking, sans case.';
      case 'doing':
        return depuis ? `Dans « Faire » depuis ${depuis}.` : 'Dans « Faire ».';
      case 'neverMoved':
        return `Dans « ${quadrant(i.task!.quadrant).label} » depuis ${depuis}${i.task!.due_at ? '' : ', sans échéance'}.`;
      case 'dormant':
        return depuis ? `Aucune tâche n’a bougé depuis ${depuis}.` : 'Aucune tâche n’a bougé récemment.';
      case 'eliminer': {
        const n = stats.find((s) => s.board_id === i.board.id)?.eliminer_open ?? 0;
        return depuis
          ? `${n} tâches dans « Éliminer », rien n’en sort depuis ${depuis}.`
          : `${n} tâches dans « Éliminer », rien n’en est jamais sorti.`;
      }
    }
  }

  /** La pastille de nature, en tête de carte. */
  function kind(i: Item): string {
    const depuis = i.days === null ? '' : ` · ${i.days} j`;
    return `${SHORT[i.signal.key]}${depuis}`;
  }

  function toneStyle(key: ReviewSignalKey): CSSProperties {
    const t = TONE[key];
    return t === 'neutre'
      ? ({ '--tone': 'var(--color-neutral-600)', '--tone-soft': 'var(--color-surface)', '--tone-ink': 'var(--color-text)' } as CSSProperties)
      : ({
          '--tone': `var(--q-${t}-ink)`,
          '--tone-soft': t === 'parking' ? 'var(--card-warm)' : `var(--q-${t}-bg)`,
          '--tone-ink': `var(--q-${t}-dark)`,
        } as CSSProperties);
  }

  function decStyle(tone: Decision['tone']): CSSProperties {
    if (tone === 'ouvrir') {
      return { '--tone': 'var(--color-accent)', '--tone-soft': 'var(--card-warm)', '--tone-ink': 'var(--color-accent-700)' } as CSSProperties;
    }
    if (tone === 'neutre') {
      return { '--tone': 'var(--color-neutral-500)', '--tone-soft': 'var(--card-warm)', '--tone-ink': 'var(--color-text)' } as CSSProperties;
    }
    return {
      '--tone': `var(--q-${tone}-ink)`,
      '--tone-soft': `var(--q-${tone}-bg)`,
      '--tone-ink': `var(--q-${tone}-dark)`,
    } as CSSProperties;
  }

  const dernierLabel = (() => {
    const last = readLastReview();
    const d = last ? ageInDays(last, now) : null;
    if (d === null) return 'première visite';
    return Math.floor(d) <= 0 ? 'consultée aujourd’hui' : `dernière visite il y a ${Math.floor(d)} j`;
  })();

  // ── Rendu ──────────────────────────────────────────────────────────────────
  const aucune = boards.length === 0;
  const passeesListe = queue.filter((i) => passees.has(i.key) && !outcomes[i.key]);
  const regleesListe = queue.filter((i) => outcomes[i.key]);

  /** Le décompte par case des cartes de matrice — la mini-grille du mockup. */
  function miniGrille(b: BoardRange) {
    return QUADS.map((q) => ({ q, n: countOpen(tasks, b.id, q.key) }));
  }

  function carteDecisions(i: Item) {
    const grille = i.signal.key === 'parking';
    const boutons = decs.map((d) => (
      <button
        key={d.key}
        className="rv-dec"
        style={decStyle(d.tone)}
        aria-keyshortcuts={d.key}
        onClick={d.run}
      >
        <span className="rv-dec__head">
          <span className="rv-dec__label">{d.label}</span>
          <kbd className="rv-dec__key">{d.key}</kbd>
        </span>
        <span className="rv-dec__hint">{d.hint}</span>
      </button>
    ));
    if (!grille) {
      return (
        <div className="rv-decs" role="group" aria-label={`Ranger « ${titre(i)} »`}>
          {boutons}
        </div>
      );
    }
    // Les quatre cases dans leur géométrie : ranger au parking, c'est choisir une
    // position sur les axes, pas une entrée dans une liste.
    return (
      <div role="group" aria-label={`Ranger « ${titre(i)} »`}>
        <AxisGrid
          faire={boutons[0]}
          planifier={boutons[1]}
          deleguer={boutons[2]}
          eliminer={boutons[3]}
        />
      </div>
    );
  }

  return (
    <>
      <ScreenHero>
        <div className="shero__row">
          <div className="shero__lead">
            <p className="shero__eyebrow">
              Revue <span aria-hidden="true">·</span> <span aria-live="polite">{dernierLabel}</span>
            </p>
            <h1 className="shero__title">Une décision à la fois.</h1>
          </div>
          <div className="shero__side rv-counter">
            <span className="rv-counter__n" aria-hidden="true">
              {total === 0 ? '0' : `${reglees}/${total}`}
            </span>
            <span className="rv-counter__text">
              {loading
                ? 'Lecture…'
                : total === 0
                  ? 'Rien à signaler'
                  : `${total - reglees} ${total - reglees > 1 ? 'cartes' : 'carte'} à regarder`}
            </span>
          </div>
        </div>

        {total > 0 && (
          <div className="rv-progress">
            <div className="rv-segments" aria-hidden="true">
              {queue.map((i) => (
                <span
                  key={i.key}
                  className={`rv-seg${outcomes[i.key] ? ' rv-seg--done' : ''}${passees.has(i.key) ? ' rv-seg--skip' : ''}`}
                  style={toneStyle(i.signal.key)}
                />
              ))}
            </div>
            <div className="rv-legend">
              {signals.map((s) => {
                const n = queue.filter((i) => i.signal.key === s.key).length;
                if (n === 0) return null;
                return (
                  <span key={s.key} className="rv-legend__item">
                    <span className="rv-legend__dot" style={toneStyle(s.key)} aria-hidden="true" />
                    {SHORT[s.key]} ({n})
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </ScreenHero>

      <div className="review">
        <div className="rv-main">
          {aucune ? (
            <p className="home-empty">
              La revue s'appuie sur vos matrices — créez-en une et revenez quand elle aura vécu.
            </p>
          ) : total === 0 ? (
            <section className="rv-card rv-card--calme" aria-label="Rien à signaler">
              <h2 className="rv-card__title">Rien ne traîne.</h2>
              <p className="rv-card__meta">
                Les cinq mesures sont au vert, aux seuils que vous avez réglés. C'est une
                information, pas une absence d'écran.
              </p>
              <ul className="rv-clear">
                {signals.map((s) => (
                  <li key={s.key}>
                    <span className="rv-legend__dot" style={toneStyle(s.key)} aria-hidden="true" />
                    {s.empty}
                  </li>
                ))}
              </ul>
              {failed && (
                <p className="rv-card__meta">
                  Deux de ces mesures ont besoin du serveur, qui n'a pas répondu : elles ne disent
                  rien plutôt que de rassurer à tort.
                </p>
              )}
            </section>
          ) : bilan ? (
            <section className="rv-card rv-card--bilan" aria-labelledby="rv-bilan">
              <h2 className="rv-card__title" id="rv-bilan">
                {reglees === 0
                  ? 'Rien décidé, et c’est une décision.'
                  : reglees === total
                    ? 'Pile vide.'
                    : `${reglees} ${reglees > 1 ? 'décisions prises' : 'décision prise'}.`}
              </h2>
              <p className="rv-card__meta">
                {reglees === 0
                  ? 'La pile vous attendra telle quelle. Revenir plus tard ne coûte rien.'
                  : `Revue consultée ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}.`}
              </p>

              {regleesListe.length > 0 && (
                <div className="rv-bilan__group">
                  <h3 className="rv-bilan__label">Ce qui a changé</h3>
                  {regleesListe.map((i) => {
                    const o = outcomes[i.key]!;
                    return (
                      <div className="rv-bilan__row" key={i.key}>
                        <span className="rv-legend__dot" style={toneStyle(i.signal.key)} aria-hidden="true" />
                        <span className="rv-bilan__text">
                          <span className="rv-bilan__title">{titre(i)}</span>
                          <span className="rv-bilan__outcome">{o.text}</span>
                        </span>
                        {/* Voir la note sur `lastWrite` : une seule écriture est
                            annulable, celle du dessus de la pile. */}
                        {(!o.storeUndo || lastWrite === i.key) && (
                          <button
                            className="rv-bilan__act"
                            aria-label={`Annuler : ${titre(i)}`}
                            onClick={() => annuler(i)}
                          >
                            Annuler
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {passeesListe.length > 0 && (
                <div className="rv-bilan__group">
                  <h3 className="rv-bilan__label">
                    {passeesListe.length > 1 ? `${passeesListe.length} cartes passées` : 'Une carte passée'}
                  </h3>
                  {passeesListe.map((i) => (
                    <div className="rv-bilan__row rv-bilan__row--left" key={i.key}>
                      <span className="rv-legend__dot" style={toneStyle(i.signal.key)} aria-hidden="true" />
                      <span className="rv-bilan__text">
                        <span className="rv-bilan__title">{titre(i)}</span>
                        <span className="rv-bilan__outcome">{SHORT[i.signal.key]}</span>
                      </span>
                      <button
                        className="rv-bilan__act rv-bilan__act--strong"
                        aria-label={`Reprendre : ${titre(i)}`}
                        onClick={() => reprendre(i)}
                      >
                        Reprendre
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {reglees + passeesListe.length < total && (
                <button
                  className="rv-nav__next rv-bilan__back"
                  onClick={() => {
                    const nx = suivante(-1);
                    if (nx >= 0) {
                      setCur(nx);
                      setBilan(false);
                    }
                  }}
                >
                  Revenir à la pile
                </button>
              )}
            </section>
          ) : item ? (
            <>
              <div className="rv-deck">
                {/* Les cartes qui suivent, en ombre : la pile a une épaisseur, et
                    c'est elle qui dit qu'on avance. */}
                {[2, 1]
                  .filter((n) => total - reglees - passees.size > n)
                  .map((n) => (
                    <span key={n} className={`rv-ghost rv-ghost--${n}`} aria-hidden="true" />
                  ))}

                <article
                  className={`rv-card${item.signal.key === 'parking' ? ' rv-card--parking' : ''}`}
                  style={toneStyle(item.signal.key)}
                  aria-labelledby="rv-titre"
                >
                  <div className="rv-card__head">
                    <span className="rv-chip">{kind(item)}</span>
                    <span className="rv-card__place">{lieu(item)}</span>
                  </div>

                  <div className="rv-card__body">
                    {!item.task && (
                      <span
                        className="rv-mini"
                        role="img"
                        aria-label={`Matrice ${item.board.name}`}
                      >
                        {miniGrille(item.board).map(({ q, n }) => (
                          <span
                            key={q.key}
                            className="rv-mini__cell"
                            style={{ '--q-bg': q.bg, '--q-dark': q.dark } as CSSProperties}
                          >
                            {n}
                          </span>
                        ))}
                      </span>
                    )}
                    <div className="rv-card__text">
                      <h2 className="rv-card__title" id="rv-titre">{titre(item)}</h2>
                      <p className="rv-card__meta">{meta(item)}</p>
                    </div>
                  </div>

                  <div className="rv-card__ask">
                    <p className="rv-question">
                      {QUESTION[item.signal.key]}{' '}
                      <span className="rv-question__why">{item.signal.hint}</span>
                    </p>

                    {carteDecisions(item)}

                    {item.task && dating === item.key && (
                      <Deadline
                        task={item.task}
                        editing
                        onCancel={() => setDating(null)}
                        onSet={(dueAt) => {
                          const t = item.task!;
                          store.group('Échéance fixée', () => void patchTask(t.id, { due_at: dueAt }));
                          setDating(null);
                          // Une échéance ne change pas de case : sans mise en
                          // sommeil, la même carte reviendrait à la visite suivante.
                          dormir(item.key);
                          regler(item, {
                            text: `Échéance : ${new Date(dueAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}.`,
                            storeUndo: true,
                            snoozed: true,
                          });
                        }}
                        onClear={() => setDating(null)}
                      />
                    )}
                  </div>

                  <div className="rv-nav">
                    <button
                      className="rv-nav__prev"
                      aria-keyshortcuts="ArrowLeft"
                      disabled={index === 0}
                      onClick={() => setCur((c) => Math.max(0, c - 1))}
                    >
                      <kbd className="rv-kbd">←</kbd> Précédente
                    </button>
                    <button className="rv-nav__open" onClick={() => ouvrir(item)}>
                      {item.task ? `Ouvrir dans « ${item.board.name} »` : `Ouvrir « ${item.board.name} »`}
                    </button>
                    <span className="rv-nav__gap" />
                    <button className="rv-nav__next" aria-keyshortcuts="ArrowRight" onClick={passer}>
                      Passer <kbd className="rv-kbd">→</kbd>
                    </button>
                  </div>
                </article>
              </div>

              <p className="rv-keys">
                <span>Raccourcis&nbsp;:</span>
                <span><kbd className="rv-kbd">1</kbd>–<kbd className="rv-kbd">{decs.length}</kbd> décider</span>
                <span><kbd className="rv-kbd">→</kbd> passer</span>
                <span><kbd className="rv-kbd">←</kbd> revenir</span>
                <span><kbd className="rv-kbd">Z</kbd> annuler</span>
                <span><kbd className="rv-kbd">Échap</kbd> voir le bilan</span>
              </p>
            </>
          ) : null}
        </div>

        <aside className="rv-aside" aria-label="La pile et les seuils">
          {total > 0 && (
            <section className="rv-pile" aria-labelledby="rv-pile-titre">
              <div className="rv-pile__head">
                <h2 className="rv-pile__title" id="rv-pile-titre">La pile</h2>
                <span className="rv-pile__meta">{reglees} sur {total}</span>
              </div>
              {signals.map((s) => {
                const lignes = queue.filter((i) => i.signal.key === s.key);
                if (lignes.length === 0) return null;
                return (
                  <div className="rv-pile__group" key={s.key}>
                    <h3 className="rv-pile__label">
                      <span className="rv-legend__dot" style={toneStyle(s.key)} aria-hidden="true" />
                      {SHORT[s.key]}
                    </h3>
                    {lignes.map((i) => {
                      const o = outcomes[i.key];
                      const courante = !bilan && queue[index]?.key === i.key;
                      return (
                        <button
                          key={i.key}
                          className={`rv-pile__row${courante ? ' rv-pile__row--on' : ''}${o ? ' rv-pile__row--done' : ''}`}
                          aria-current={courante ? 'true' : undefined}
                          aria-label={`${titre(i)}${o ? ` — ${o.text}` : passees.has(i.key) ? ' — passée' : ''}`}
                          onClick={() => {
                            const n = queue.findIndex((x) => x.key === i.key);
                            if (n >= 0) setCur(n);
                            setBilan(false);
                          }}
                        >
                          <span className="rv-pile__mark" style={toneStyle(s.key)} aria-hidden="true">
                            {o ? '✓' : passees.has(i.key) ? '→' : ''}
                          </span>
                          <span className="rv-pile__name">{titre(i)}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </section>
          )}

          <section className="rv-seuils">
            <button
              className="rv-seuils__toggle"
              aria-expanded={seuilsOpen}
              aria-controls="rv-seuils"
              onClick={() => setSeuilsOpen((o) => !o)}
            >
              <Icon size={18}>
                <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
                <circle cx="16" cy="7" r="2" />
                <circle cx="10" cy="17" r="2" />
              </Icon>
              <span className="rv-seuils__label">Régler les seuils</span>
              <span className={`rv-seuils__chev${seuilsOpen ? ' rv-seuils__chev--open' : ''}`}>
                <Icon size={14}>
                  <path d="m6 9 6 6 6-6" />
                </Icon>
              </span>
            </button>
            {seuilsOpen && (
              <div className="rv-seuils__body" id="rv-seuils">
                <p className="rv-seuils__hint">La pile se recompose aussitôt.</p>
                {signals.map((s) => {
                  const champ = TUNABLE[s.key];
                  const paliers = STEPS[s.key];
                  const valeur = thresholds[champ];
                  // Le palier courant, ou le plus proche : un seuil hérité d'un
                  // champ libre peut ne tomber sur aucun palier.
                  const rang = paliers.reduce(
                    (best, v, n) => (Math.abs(v - valeur) < Math.abs(paliers[best] - valeur) ? n : best),
                    0,
                  );
                  const pose = (n: number) =>
                    setThresholds((prev) => ({ ...prev, [champ]: paliers[n] }));
                  return (
                    <div className="rv-seuil" key={s.key}>
                      <span className="rv-seuil__label">{SHORT[s.key]}</span>
                      <span className="rv-seuil__field" role="group" aria-label={`Seuil : ${SHORT[s.key]}`}>
                        <button
                          className="rv-seuil__step"
                          aria-label="Baisser le seuil"
                          disabled={rang === 0}
                          onClick={() => pose(rang - 1)}
                        >
                          −
                        </button>
                        <span className="rv-seuil__value" aria-live="polite">{valeur}&nbsp;j</span>
                        <button
                          className="rv-seuil__step"
                          aria-label="Relever le seuil"
                          disabled={rang === paliers.length - 1}
                          onClick={() => pose(rang + 1)}
                        >
                          +
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {!bilan && total > 0 && (
            <button className="rv-stop" aria-keyshortcuts="Escape" onClick={() => setBilan(true)}>
              Arrêter là et voir le bilan
            </button>
          )}
        </aside>
      </div>
    </>
  );
}
