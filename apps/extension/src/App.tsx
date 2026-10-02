import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { flushSync } from 'react-dom';
import type { Session } from '@supabase/supabase-js';
import {
  countOpen,
  deadlineStatus,
  endPosition,
  focusToday,
  formatDeadline,
  fromLocalInput,
  groupByUniverse,
  isOverdue,
  localDay,
  partnerOf,
  planPairMove,
  positionBefore,
  toLocalInput,
  type QuadrantKey,
  type BoardRange,
  type Task,
  type TaskWrite,
} from '@penduline/shared';
// Les cases peintes par la feuille de styles : le panneau a un thème sombre
// depuis la refonte, et une couleur en style en ligne ne suit pas une requête
// média. Même mécanique que `apps/web/src/lib/quads.ts`.
import { ALL, QUADS } from './quads';
import { isConfigured, supabase } from './supabase';
import { getActiveBoard, setActiveBoard } from './active-board';
import { getActiveTab } from './active-tab';
import { Capture } from './Capture';
import { Icon } from './Icons';
import { getPending, watchPending, type PendingCapture } from './pending-capture';
import { Loader } from './Loader';
import { clearSnapshot } from './snapshot';
import { quadBg } from './quad-bg';
import { useExtStore, type ExtStore } from './store';
import { TaskMenu } from './TaskMenu';
import { TaskTitle } from './TaskTitle';
import { ToastProvider } from './toast';
import { useNow } from './useNow';
import { listenForSharedSession } from './session-bridge';
import { WEB_APP_URL } from './web-app';

function withVT(fn: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
  if (doc.startViewTransition) doc.startViewTransition(() => flushSync(fn));
  else fn();
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isConfigured) {
      setReady(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));

    // Le panneau peut être ouvert AU MOMENT où l'app web pousse sa session. Son
    // client est une instance distincte de celle du service worker : sans cet
    // écouteur, il resterait sur l'écran de connexion jusqu'au prochain montage.
    // Le `setSession` qui suit fait repasser `onAuthStateChange` ci-dessus.
    const unlisten = listenForSharedSession();

    return () => {
      sub.subscription.unsubscribe();
      unlisten();
    };
  }, []);

  /**
   * Déconnecté, l'icône ne doit plus rien annoncer (#108).
   *
   * Sans ça, le badge gardait le reliquat d'un compte auquel on n'a plus accès —
   * et il y serait resté indéfiniment, le panneau déconnecté ne poussant plus
   * jamais de compte.
   *
   * `ready` garde l'effet : avant que la session ne soit relue, `session` est
   * nul sans que ça veuille dire quoi que ce soit, et effacer là ferait clignoter
   * le badge à chaque ouverture du panneau.
   */
  useEffect(() => {
    if (!ready || session) return;
    // L'instantané part avec : il n'a plus de compte à servir, et le laisser
    // signifierait garder des titres de tâches lisibles sur le poste après une
    // déconnexion volontaire.
    void clearSnapshot();
    try {
      chrome.runtime.sendMessage({ type: 'focus', count: 0 });
    } catch {
      /* pas de runtime (aperçu web) */
    }
  }, [ready, session]);

  return (
    <div className="panel">
      {/* Au-dessus de `PanelApp` : c'est `useExtStore` qui signale les échecs
          d'écriture, il doit donc se rendre à l'intérieur de l'hôte. */}
      <ToastProvider>
        {!isConfigured ? (
          <ConfigNeeded />
        ) : !ready ? (
          <Loader />
        ) : !session ? (
          <SignIn />
        ) : (
          <PanelApp userId={session.user.id} />
        )}
      </ToastProvider>
    </div>
  );
}

function ConfigNeeded() {
  return (
    <div className="signin">
      <div className="signin-brand">
        <Logo />
        <span className="home-brand">Penduline</span>
      </div>
      <p className="signin-sub">Configuration Supabase manquante</p>
      <p style={{ font: '12.5px var(--font-body)', color: 'var(--color-neutral-600)', margin: 0, lineHeight: 1.5 }}>
        Crée un fichier <code>.env</code> à la racine du projet avec
        <code> VITE_SUPABASE_URL</code> et <code>VITE_SUPABASE_ANON_KEY</code>, puis
        rebuild&nbsp;: <code>npm run build:ext</code>. Recharge ensuite l'extension.
      </p>
    </div>
  );
}

function PanelApp({ userId }: { userId: string }) {
  const store = useExtStore(userId);
  const [screen, setScreen] = useState<'home' | 'detail'>('home');
  const [boardId, setBoardId] = useState<string | null>(null);
  const [activeBoard, setActive] = useState<string | null>(null);
  /**
   * La capture déposée par le service worker (#78). `undefined` = pas encore lu ;
   * `null` = rien en attente, on affiche la grille comme avant.
   */
  const [pending, setPending] = useState<PendingCapture | null | undefined>(undefined);
  /**
   * Le titre de l'onglet regardé, pour le bouton « Capturer cette page ».
   *
   * Relu à chaque changement d'onglet ET à chaque navigation : le panneau reste
   * ouvert pendant qu'on butine, et un bouton qui annoncerait la page d'il y a
   * dix minutes serait pire que muet.
   */
  const [pageTitle, setPageTitle] = useState('');

  useEffect(() => {
    void getPending().then(setPending);
  }, []);

  /**
   * Les captures qui arrivent APRÈS le montage.
   *
   * La lecture ci-dessus ne suffit plus depuis le passage au panneau : le
   * service worker doit appeler `sidePanel.open()` avant d'écrire la capture
   * (contrainte du geste utilisateur), et le panneau ne se ferme plus, donc il
   * peut très bien être monté depuis dix minutes quand elle arrive. Voir
   * `watchPending`, qui documente les deux cas.
   *
   * ⚠️ `setPending(c)` et non `setPending(c ?? null)` en cascade : la valeur
   * `undefined` est réservée au « pas encore lu » de la lecture initiale, et la
   * laisser réapparaître ici renverrait l'écran de chargement.
   */
  useEffect(() => watchPending((c) => setPending(c)), []);

  useEffect(() => {
    let vivant = true;
    const relire = () => void getActiveTab().then((t) => vivant && setPageTitle(t?.title ?? ''));
    relire();
    try {
      chrome.tabs.onActivated.addListener(relire);
      chrome.tabs.onUpdated.addListener(relire);
      return () => {
        vivant = false;
        chrome.tabs.onActivated.removeListener(relire);
        chrome.tabs.onUpdated.removeListener(relire);
      };
    } catch {
      // Pas de `chrome.tabs` (aperçu web) : le titre reste vide, le bouton dit
      // « la page ouverte » et la capture part sur un formulaire vide.
      return () => {
        vivant = false;
      };
    }
  }, []);

  // Reprise de la dernière matrice ouverte (TTL géré côté store).
  useEffect(() => {
    getActiveBoard().then((id) => {
      setActive(id);
      if (id) {
        setBoardId(id);
        setScreen('detail');
      }
    });
  }, []);

  /**
   * Relire au changement de vue — mais SEULEMENT quand le canal ne le fait pas
   * déjà (#116, puis #117).
   *
   * Le panneau reste ouvert des heures : ce qu'on change depuis l'app web, un
   * autre appareil ou le menu contextuel n'y arrivait jamais. Depuis #117 le
   * canal temps réel s'en charge, et cette relecture devient redondante tant
   * qu'il est établi.
   *
   * ⚠️ **Conditionnée, et non supprimée.** Un socket peut très bien ne jamais
   * s'établir — hors ligne, ou WebSocket bloqué par un proxy d'entreprise. Sans
   * ce repli, un panneau dans ce cas n'aurait plus AUCUN rattrapage, et la
   * panne serait muette : c'est exactement le mode de défaillance que le canal
   * ne peut pas signaler lui-même.
   *
   * `premierRendu` écarte le tour initial : `charger` vient tout juste de
   * répondre pour que `ready` passe à `true`, une seconde lecture au même
   * instant ne rapporterait rien.
   */
  const premierRendu = useRef(true);
  useEffect(() => {
    if (!store.ready) return;
    if (premierRendu.current) {
      premierRendu.current = false;
      return;
    }
    // ⚠️ `store.verifier()` et non `store.live` : le drapeau dit quel a été le
    // dernier statut RAPPORTÉ, et sur un socket mort sans fermeture propre il
    // n'en arrive aucun. Interroger relance l'abonnement si besoin.
    if (store.verifier()) return;
    store.refresh();
  }, [screen, boardId, store.ready, store.verifier, store.refresh]);

  /**
   * Et au retour de visibilité — même repli, même condition.
   *
   * Le panneau survit à la fermeture d'un onglet et à la minimisation de la
   * fenêtre sans se démonter : on peut le retrouver après une heure SANS changer
   * de vue, donc sans déclencher la relecture ci-dessus.
   *
   * ⚠️ **C'est ici que le bug du 28 septembre se logeait.** La condition était
   * `if (liveRef.current) return` — un drapeau nourri par `onLive`, donc par le
   * dernier statut rapporté par la bibliothèque. Or sur un poste au repos, le
   * battement de cœur bridé cessait, le serveur fermait la connexion, et AUCUN
   * statut n'était rapporté : le drapeau restait `true`, le repli sortait sans
   * rien faire, et le panneau affichait un état figé jusqu'à ce qu'on le
   * referme. Un filet de sécurité suspendu au seul signal que la panne empêche
   * de mettre à jour.
   *
   * `verifier()` interroge l'état réel du canal et du socket, et relance
   * l'abonnement s'il ne tient plus. Les deux fonctions passent par le store,
   * qui les garde stables : plus de ref à tenir à jour ici.
   */
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      if (store.verifier()) return;
      store.refresh();
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [store.verifier, store.refresh]);

  // Le service worker a besoin de la liste des matrices pour construire son menu
  // contextuel, qui doit être enregistré AVANT tout clic droit. Plutôt que de le
  // faire interroger Supabase — il peut être tué à tout moment — on lui pousse
  // celle qu'on vient de charger.
  useEffect(() => {
    if (!store.ready) return;
    try {
      chrome.runtime.sendMessage({
        type: 'boards',
        boards: store.boards.map((b) => ({ id: b.id, name: b.name })),
      });
    } catch {
      /* pas de runtime (aperçu web) */
    }
  }, [store.ready, store.boards]);

  /**
   * Le compte du jour, pour le badge de l'icône (#108).
   *
   * ICI et non dans `Home`, qui affiche pourtant le même nombre dans son
   * bandeau : `Home` est démonté dès qu'on ouvre une matrice, et c'est
   * précisément sur `Detail` qu'on coche des tâches. Le badge y serait resté
   * figé sur le compte du matin.
   *
   * Les deux appellent la même fonction pure sur les mêmes tâches : c'est le
   * même nombre par construction, pas une seconde source.
   */
  const focusCount = focusToday(store.tasks, localDay()).length;
  useEffect(() => {
    if (!store.ready) return;
    try {
      chrome.runtime.sendMessage({ type: 'focus', count: focusCount });
    } catch {
      /* pas de runtime (aperçu web) */
    }
  }, [store.ready, focusCount]);

  /**
   * « Capturer cette page » : on fabrique la même capture que le menu
   * contextuel, et le formulaire existant prend le relais.
   *
   * Pas de second chemin d'écriture : `Capture` sait déjà relire avant
   * d'écrire, choisir la matrice et valider le lien. C'est l'ENTRÉE qui
   * manquait, pas le formulaire.
   */
  async function capturer() {
    const tab = await getActiveTab();
    setPending({
      title: tab?.title ?? '',
      url: tab?.url ?? '',
      boardId: activeBoard,
      at: Date.now(),
    });
  }

  function openBoard(id: string) {
    void setActiveBoard(id);
    setActive(id);
    setBoardId(id);
    withVT(() => setScreen('detail'));
  }

  if (!store.ready || pending === undefined) return <Loader label="Chargement des matrices…" />;

  // Le formulaire passe AVANT la grille : c'est ce que l'utilisateur vient de
  // demander, que le panneau se soit ouvert pour ça ou qu'il fût déjà là.
  if (pending) {
    return (
      <Capture
        pending={pending}
        boards={store.boards}
        tasks={store.tasks}
        onWrite={store.captureTask}
        onDone={() => setPending(null)}
        onCancel={() => setPending(null)}
      />
    );
  }

  const board = store.boards.find((r) => r.id === boardId) ?? null;
  if (screen === 'detail' && board) {
    return (
      <Detail
        store={store}
        board={board}
        onHome={() => withVT(() => setScreen('home'))}
        onOpen={openBoard}
        pageTitle={pageTitle}
        onCapture={() => void capturer()}
      />
    );
  }
  return (
    <Home
      store={store}
      activeBoard={activeBoard}
      onOpen={openBoard}
      pageTitle={pageTitle}
      onCapture={() => void capturer()}
    />
  );
}

// ── Le bandeau d'encre, commun aux deux vues ─────────────────────────────────
/**
 * L'en-tête du panneau : le même bandeau que l'app web, en plus court.
 *
 * Le nid y pend comme sur l'accueil du site, à l'échelle de 400 px, et la vague
 * rejoint le fond de page. Ce sont les deux signes qui font reconnaître
 * l'extension comme la même application que le site, et non comme un satellite.
 */
function PanelHero({ children }: { children: ReactNode }) {
  return (
    <header className="phero">
      <span className="phero__decor" aria-hidden="true">
        <span className="phero__nest">
          <span className="phero__branch" />
          <span className="phero__swing">
            <span className="phero__nid" />
          </span>
        </span>
      </span>
      <div className="phero__inner">{children}</div>
      <svg className="phero__wave" viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 24 L0 14 C40 4 80 22 140 13 C200 4 250 20 310 12 C350 7 380 10 400 12 L400 24 Z" />
      </svg>
    </header>
  );
}

/** Le lien vers l'app web, en pastille (accueil) ou en icône seule (matrice). */
function OpenApp({ compact = false }: { compact?: boolean }) {
  return (
    <a
      className={compact ? 'phero__icon' : 'phero__openapp'}
      href={WEB_APP_URL}
      target="_blank"
      rel="noreferrer"
      aria-label="Ouvrir Penduline dans un onglet"
      title="Ouvrir l'app"
    >
      {!compact && 'Ouvrir l’app'}
      <Icon size={14}>
        <path d="M7 17 17 7M8 7h9v9" />
      </Icon>
    </a>
  );
}

/**
 * La mini-grille d'une matrice : le compte de chaque case, dans sa couleur.
 *
 * Décorative (`aria-hidden`) — le même compte est dit en toutes lettres dans le
 * nom accessible du bouton qui la porte. Une case vide ne montre pas « 0 » mais
 * un creux : à cette taille, quatre zéros font du bruit là où un trou se lit.
 */
function MiniGrid({ tasks, boardId, size }: { tasks: Task[]; boardId: string; size: 'sm' | 'md' }) {
  return (
    <span className={`mini mini--${size}`} aria-hidden="true">
      {QUADS.map((q) => {
        const n = countOpen(tasks, boardId, q.key);
        return (
          <span
            key={q.key}
            className={`mini__cell mini__cell--${q.key}${n === 0 ? ' mini__cell--empty' : ''}`}
          >
            {n > 0 ? n : ''}
          </span>
        );
      })}
    </span>
  );
}

/** Le bouton de capture, posé au-dessus de tout, sur les deux vues. */
function CaptureBar({ pageTitle, onCapture }: { pageTitle: string; onCapture: () => void }) {
  return (
    <div className="capbar">
      <button className="capbar__btn" onClick={onCapture} aria-haspopup="dialog">
        <span className="capbar__glyph" aria-hidden="true">＋</span>
        <span className="capbar__text">
          <span className="capbar__title">Capturer cette page</span>
          <span className="capbar__page">{pageTitle || 'la page ouverte'}</span>
        </span>
      </button>
    </div>
  );
}

/** Le formulaire « + Nouvelle matrice », identique dans les deux vues. */
function NewBoard({ onCreate }: { onCreate: (name: string) => void | Promise<void> }) {
  // `null` = bouton au repos ; une chaîne (même vide) = champ ouvert. Même
  // convention que l'accueil web, pour que les deux se lisent pareil.
  const [draft, setDraft] = useState<string | null>(null);
  if (draft === null) {
    return (
      <button className="add-board" onClick={() => setDraft('')}>
        ＋ Nouvelle matrice
      </button>
    );
  }
  return (
    <form
      className="add-board-form"
      onSubmit={(e) => {
        e.preventDefault();
        const name = draft.trim();
        if (!name) return;
        void onCreate(name);
        setDraft(null);
      }}
    >
      <input
        className="add-board-input"
        value={draft}
        autoFocus
        placeholder="Nom de la matrice"
        aria-label="Nom de la matrice"
        maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        // Échap annule. Pas de fermeture au blur : cliquer sur « Créer »
        // déclenche d'abord le blur, ce qui perdrait la saisie.
        onKeyDown={(e) => {
          if (e.key === 'Escape') setDraft(null);
        }}
      />
      <button className="add-board-submit" type="submit" disabled={!draft.trim()}>
        Créer
      </button>
      {/* Dans 400 px, pas de bouton « Annuler » à côté du champ : la croix tient
          le rôle et laisse la place au nom. */}
      <button
        className="add-board-cancel"
        type="button"
        aria-label="Annuler"
        onClick={() => setDraft(null)}
      >
        ✕
      </button>
    </form>
  );
}

/** Les liens de pied de page, les mêmes partout. */
function PanelLinks() {
  return (
    <div className="plinks">
      <a className="icon-btn" href="https://github.com/Le-Polemil" target="_blank" rel="noreferrer" aria-label="Penduline sur GitHub">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.88-1.36-3.88-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.18-3.09-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a11 11 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.73.81 1.18 1.83 1.18 3.09 0 4.41-2.69 5.38-5.26 5.67.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.8.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
        </svg>
      </a>
      <a className="bmc" href="https://buymeacoffee.com/polemil" target="_blank" rel="noreferrer">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 8h1a4 4 0 1 1 0 8h-1" />
          <path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z" />
        </svg>
        Soutenez-moi
      </a>
    </div>
  );
}

// ── Accueil ──────────────────────────────────────────────────────────────────
/**
 * L'accueil du panneau : ce qu'on a promis pour aujourd'hui, puis les matrices.
 *
 * L'ordre n'est pas décoratif. Dans 400 px, ce sur quoi on s'est engagé doit
 * être visible à l'ouverture, pas derrière une navigation — et c'est la seule
 * chose dont on soit sûr qu'elle intéresse à cette seconde.
 */
function Home({
  store,
  activeBoard,
  onOpen,
  pageTitle,
  onCapture,
}: {
  store: ExtStore;
  activeBoard: string | null;
  onOpen: (id: string) => void;
  pageTitle: string;
  onCapture: () => void;
}) {
  const now = useNow();
  // `localDay()` recalculé à chaque rendu : un panneau rouvert le lendemain doit
  // voir une sélection vide, pas celle de la veille (#49).
  const day = localDay();

  const ouvertes = store.tasks.filter((t) => !t.done && !t.deleted && !t.parent_id);
  /**
   * ⚠️ Asymétrie assumée avec l'écran web : le panneau ne charge que les tâches
   * OUVERTES, il ne peut donc pas afficher « 1 faite sur 3 ». Il montre ce qui
   * RESTE — ce qui, dans un panneau dédié à l'action, se lit comme de
   * l'avancement plutôt que comme une perte.
   */
  const today = focusToday(store.tasks, day);
  const late = ouvertes.filter((t) => isOverdue(t, now));

  // Le regroupement par univers REMPLACE celui par « actives / calmes ». Deux
  // dimensions de regroupement dans 400 px seraient illisibles — et une matrice
  // au repos n'a plus besoin d'être masquée puisque son univers la situe déjà.
  const groups = groupByUniverse(store.universes, store.boards).filter((g) => g.boards.length > 0);
  const grouped = store.universes.length > 0;
  const empty = store.boards.length === 0;

  const eyebrow =
    late.length > 0
      ? `${late.length} en retard · ${today.length} pour aujourd’hui`
      : today.length > 0
        ? `${today.length} ${today.length > 1 ? 'tâches' : 'tâche'} pour aujourd’hui`
        : 'Rien en retard';

  async function create(name: string) {
    const id = await store.addBoard(name);
    // On ouvre la matrice créée : dans un panneau, rester sur une liste pour
    // aller rechercher ce qu'on vient de nommer serait une étape de trop.
    if (id) onOpen(id);
  }

  return (
    <>
      <PanelHero>
        <div className="phero__brand">
          <img src="/logo.png" alt="" width={20} height={31} />
          <span className="phero__name">Penduline</span>
          <OpenApp />
        </div>
        <p className="phero__eyebrow">{eyebrow}</p>
      </PanelHero>

      <main className="plist">
        <section className="ptoday" aria-labelledby="ptoday-h">
          <div className="ptoday__head">
            <h2 className="ptoday__title" id="ptoday-h">Aujourd’hui</h2>
            <span className="ptoday__meta">
              {today.length === 0
                ? 'rien d’engagé'
                : `${today.length} ${today.length > 1 ? 'restantes' : 'restante'}`}
            </span>
            {late.length > 0 && <span className="pill-late">{late.length} en retard</span>}
          </div>
          {today.length === 0 ? (
            <p className="ptoday__empty">
              Rien d’engagé pour aujourd’hui. Ouvrez une matrice et désignez une tâche par son
              menu ⋯.
            </p>
          ) : (
            today.map((t) => {
              const statut = deadlineStatus(t.due_at, now);
              const b = store.boards.find((x) => x.id === t.board_id);
              return (
                <div className={`prow${statut === 'overdue' ? ' prow--late' : ''}`} key={t.id}>
                  <button
                    className="prow__check"
                    style={{ '--q-ink': `var(--q-${t.quadrant}-ink)` } as CSSProperties}
                    aria-label={`Terminer « ${t.title} »`}
                    onClick={() => void store.patchTask(t.id, { done: true, archived: true })}
                  />
                  <button
                    className="prow__body"
                    aria-label={`Ouvrir « ${t.title} » dans ${b?.name ?? 'sa matrice'}`}
                    onClick={() => b && onOpen(b.id)}
                  >
                    <span className="prow__title">{t.title}</span>
                    <span className="prow__meta">
                      {t.due_at && statut && (
                        <span className={`chip chip--${statut}`}>{formatDeadline(t.due_at, now)}</span>
                      )}
                      <span className="prow__board">
                        <span
                          className="prow__dot"
                          style={{ background: `var(--q-${t.quadrant}-ink)` }}
                          aria-hidden="true"
                        />
                        {b?.name ?? '—'}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })
          )}
        </section>

        {/* L'état vide ne renvoie pas vers le web : c'était le seul moment où
            l'extension avouait son incomplétude, et il tombait au pire endroit —
            la toute première utilisation. */}
        {empty && (
          <p className="empty">
            Aucune matrice pour l’instant.
            <br />
            Créez la première : une pièce, une journée, un projet…
          </p>
        )}

        {groups.map((g) => (
          <section className="pgroup" key={g.universe?.id ?? 'sans-univers'} aria-label={g.universe?.name ?? 'Sans univers'}>
            {/* Sans aucun univers, pas d'en-tête : la liste se lit comme avant. */}
            {grouped && <h2 className="pgroup__title">{g.universe?.name ?? 'Sans univers'}</h2>}
            {g.boards.map((b) => {
              const n = ouvertes.filter((t) => t.board_id === b.id).length;
              const park = countOpen(store.tasks, b.id, 'parking');
              const enRetard = late.filter((t) => t.board_id === b.id).length;
              const sub = n === 0 ? 'Rien à faire' : `${n} à faire${park > 0 ? ` · ${park} à trier` : ''}`;
              return (
                <button
                  key={b.id}
                  className={`pboard${activeBoard === b.id ? ' pboard--on' : ''}`}
                  aria-current={activeBoard === b.id ? 'true' : undefined}
                  aria-label={`${b.name} — ${sub}${enRetard > 0 ? `, ${enRetard} en retard` : ''}`}
                  onClick={() => onOpen(b.id)}
                >
                  <MiniGrid tasks={store.tasks} boardId={b.id} size="md" />
                  <span className="pboard__text">
                    <span className="pboard__name">{b.name}</span>
                    <span className="pboard__sub">
                      {enRetard > 0 && <span className="pill-late">{enRetard} en retard</span>}
                      {sub}
                    </span>
                  </span>
                  {activeBoard === b.id && <span className="pboard__open">Ouverte</span>}
                  <span className="pboard__chev" aria-hidden="true">
                    <Icon size={16}>
                      <path d="m9 18 6-6-6-6" />
                    </Icon>
                  </span>
                </button>
              );
            })}
          </section>
        ))}

        <NewBoard onCreate={create} />
        <PanelLinks />
      </main>

      <CaptureBar pageTitle={pageTitle} onCapture={onCapture} />
    </>
  );
}

function Logo() {
  return (
    <span className="logo">
      <span className="logo__grid">
        {QUADS.map((q) => (
          <span key={q.key} className="logo__cell" style={{ background: q.bg }} />
        ))}
      </span>
    </span>
  );
}

// ── Détail d'une matrice ───────────────────────────────────────────────────────
/** Ce que la case ouverte montre : une case, ou la coupe « ce qui presse ». */
type Slot = QuadrantKey | 'now';

function Detail({
  store,
  board,
  onHome,
  onOpen,
  pageTitle,
  onCapture,
}: {
  store: ExtStore;
  board: BoardRange;
  onHome: () => void;
  onOpen: (id: string) => void;
  pageTitle: string;
  onCapture: () => void;
}) {
  const { tasks, patchTask } = store;
  /**
   * La case ouverte. UNE à la fois, et c'est tout le sujet de cette refonte :
   * cinq listes empilées dans 400 px demandaient de défiler pour savoir ce
   * qu'il y avait ; quatre tuiles le disent d'un coup d'œil, et l'une d'elles
   * s'ouvre en pleine largeur.
   */
  const [slot, setSlot] = useState<Slot>('faire');
  const [switcher, setSwitcher] = useState(false);
  const [draft, setDraft] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const [hoverGap, setHoverGap] = useState<string | null>(null);
  const [menuTask, setMenuTask] = useState<string | null>(null);
  const [renamingTask, setRenamingTask] = useState<{ id: string; title: string } | null>(null);
  /** La tâche dont l'éditeur d'échéance est ouvert. Une seule à la fois (#19). */
  const [dating, setDating] = useState<{ id: string; value: string } | null>(null);

  const now = useNow();
  const day = localDay();
  const boardTasks = tasks.filter((t) => t.board_id === board.id);
  const ouvertes = boardTasks.filter((t) => !t.done && !t.deleted && !t.archived && !t.parent_id);
  const late = ouvertes.filter((t) => isOverdue(t, now));
  const today = ouvertes.filter((t) => t.focus_day === day);

  // Le rangement vient de `BoardRange` : c'est le store qui assemble la matrice
  // et sa place (#53). `null` — pas d'univers — est un état normal.
  const universe = board.universe_id
    ? store.universes.find((u) => u.id === board.universe_id) ?? null
    : null;

  /**
   * ⚠️ Tri LOCAL, divergent de celui du web, et il doit le rester : le panneau
   * affiche une liste plate, sans zones ni interstices multiples, donc rien ici
   * ne dépend de l'ordre des `position` pour calculer une insertion.
   *
   * Le rang « en retard » passe devant la position — le même ordre de préséance
   * que les zones du web (#19).
   */
  function listFor(quad: QuadrantKey): Task[] {
    return ouvertes
      .filter((t) => t.quadrant === quad)
      .sort(
        (a, b) => Number(isOverdue(b, now)) - Number(isOverdue(a, now)) || a.position - b.position,
      );
  }

  /** Ce que la coupe « ce qui presse » réunit : les retards, puis le jour. */
  const nowList = [...late, ...today.filter((t) => !isOverdue(t, now))];

  const quad = slot === 'now' ? null : ALL.find((q) => q.key === slot) ?? QUADS[0];
  const liste = slot === 'now' ? nowList : listFor(slot);
  /** La case où l'ajout atterrit. Sur la coupe, « À trier » : rien n'y est classé. */
  const addQuad: QuadrantKey = slot === 'now' ? 'parking' : slot;

  /**
   * Applique des écritures préparées par `packages/shared`.
   *
   * Le panneau n'affiche pas les paires côte à côte — c'est une mise en page du
   * web — mais il ne doit pas pour autant **casser** un lien que le web
   * garantit. La règle vit en un seul endroit, partagé par les deux
   * applications : c'est précisément parce qu'elle existait en double que
   * l'extension a continué à détruire des paires plusieurs jours après que le
   * web eut été corrigé.
   */
  function apply(writes: TaskWrite[]) {
    for (const w of writes) patchTask(w.id, w.patch);
  }

  function dropAt(target: QuadrantKey, beforeId: string | null) {
    if (!drag || drag === beforeId) return;
    const task = tasks.find((t) => t.id === drag);
    if (!task) return;
    const mate = partnerOf(tasks, task);
    const rest = listFor(target).filter((t) => t.id !== drag && t.id !== mate?.id);
    const pos = positionBefore(rest, beforeId);
    withVT(() => apply(planPairMove(tasks, task, { quadrant: target }, pos)));
    setDrag(null);
    setHoverGap(null);
  }

  function commitRename() {
    if (!renamingTask) return;
    const title = renamingTask.title.trim();
    const before = tasks.find((t) => t.id === renamingTask.id)?.title;
    if (title && title !== before) patchTask(renamingTask.id, { title });
    setRenamingTask(null);
  }

  function menuMove(task: Task, key: QuadrantKey) {
    const pos = endPosition(listFor(key));
    withVT(() => apply(planPairMove(tasks, task, { quadrant: key }, pos)));
    setMenuTask(null);
  }

  /**
   * Change une tâche de matrice. Pas de confirmation ici, contrairement au web.
   * La partenaire suit tout de même — l'invariant prime, et le web reste
   * l'endroit où l'on fait du rangement en connaissance de cause (#95).
   */
  function moveToBoard(task: Task, targetId: string) {
    const rest = tasks.filter(
      (t) => t.board_id === targetId && t.quadrant === task.quadrant && !t.done && !t.deleted && !t.archived,
    );
    withVT(() => apply(planPairMove(tasks, task, { board_id: targetId }, endPosition(rest))));
    setMenuTask(null);
  }

  function addTask() {
    const title = draft.trim();
    if (!title) return;
    void store.addTask(board.id, addQuad, title, endPosition(listFor(addQuad)));
    setDraft('');
  }

  /** La tuile d'une case : son compte, et l'aperçu de ce qui s'y trouve. */
  function tile(q: (typeof QUADS)[number], n: 0 | 1 | 2 | 3) {
    const list = listFor(q.key);
    const enRetard = list.filter((t) => isOverdue(t, now)).length;
    const on = slot === q.key;
    return (
      <button
        key={q.key}
        className={`ptile ptile--${n}${on ? ' ptile--on' : ''}`}
        style={{ '--q-ink': q.ink, '--q-dark': q.dark, '--q-bg': q.bg } as CSSProperties}
        aria-pressed={on}
        aria-label={`${q.label} — ${list.length} ${list.length > 1 ? 'tâches' : 'tâche'}${enRetard > 0 ? `, ${enRetard} en retard` : ''}`}
        onClick={() => setSlot(q.key)}
      >
        <span className="ptile__head">
          <span className="ptile__label">{q.label}</span>
          <span className="ptile__n">{list.length}</span>
        </span>
        <span className="ptile__preview">
          {list[0]?.title ?? ''}
        </span>
        {enRetard > 0 && <span className="pill-late">{enRetard} en retard</span>}
      </button>
    );
  }

  return (
    <>
      <PanelHero>
        <div className="phero__bar">
          <button className="phero__back" aria-label="Retour à l’accueil" title="Accueil" onClick={onHome}>
            <Icon size={20}>
              <path d="m15 18-6-6 6-6" />
            </Icon>
          </button>
          <button
            className="phero__switch"
            aria-haspopup="dialog"
            aria-expanded={switcher}
            onClick={() => setSwitcher((o) => !o)}
          >
            <span className="phero__switch-text">
              <span className="phero__switch-uni">
                {universe ? `${universe.name} · matrice` : 'Matrice'}
              </span>
              <span className="phero__switch-name">{board.name}</span>
            </span>
            <span className={`phero__switch-chev${switcher ? ' phero__switch-chev--open' : ''}`}>
              <Icon size={16}>
                <path d="m6 9 6 6 6-6" />
              </Icon>
            </span>
          </button>
          <OpenApp compact />
        </div>
        <div className="phero__pills">
          <button
            className={`pill-band pill-band--late${slot === 'now' ? ' pill-band--on' : ''}`}
            aria-pressed={slot === 'now'}
            onClick={() => setSlot('now')}
          >
            <span className="pill-band__n">{late.length}</span>en retard
          </button>
          <button
            className={`pill-band pill-band--today${slot === 'now' ? ' pill-band--on' : ''}`}
            aria-pressed={slot === 'now'}
            onClick={() => setSlot('now')}
          >
            <span className="pill-band__n">{today.length}</span>pour aujourd’hui
          </button>
        </div>
      </PanelHero>

      {switcher && (
        <>
          <button className="pscrim" aria-label="Fermer" onClick={() => setSwitcher(false)} />
          <div className="pswitch" role="dialog" aria-label="Choisir une matrice">
            {groupByUniverse(store.universes, store.boards)
              .filter((g) => g.boards.length > 0)
              .map((g) => (
                <div key={g.universe?.id ?? 'sans-univers'}>
                  {store.universes.length > 0 && (
                    <p className="pswitch__group">{g.universe?.name ?? 'Sans univers'}</p>
                  )}
                  {g.boards.map((b) => {
                    const n = tasks.filter((t) => t.board_id === b.id && !t.done && !t.deleted && !t.parent_id).length;
                    return (
                      <button
                        key={b.id}
                        className="pswitch__row"
                        aria-current={b.id === board.id ? 'true' : undefined}
                        onClick={() => {
                          setSwitcher(false);
                          if (b.id !== board.id) onOpen(b.id);
                        }}
                      >
                        <MiniGrid tasks={tasks} boardId={b.id} size="sm" />
                        <span className="pswitch__name">{b.name}</span>
                        <span className="pswitch__meta">{n === 0 ? 'Rien à faire' : `${n} à faire`}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            <NewBoard
              onCreate={async (name) => {
                const id = await store.addBoard(name);
                setSwitcher(false);
                if (id) onOpen(id);
              }}
            />
            <PanelLinks />
          </div>
        </>
      )}

      <main className="pmatrix">
        {/* Les axes, comme sur le web : c'est ce qui fait d'une grille de quatre
            cases une matrice d'Eisenhower. `aria-hidden` — l'information est
            déjà dans le nom de chaque tuile. */}
        <div className="paxes">
          <span className="paxes__corner" />
          <span className="paxes__top" aria-hidden="true">Urgent</span>
          <span className="paxes__top" aria-hidden="true">Pas urgent</span>
          <span className="paxes__side" aria-hidden="true">Important</span>
          <span className="paxes__side paxes__side--2" aria-hidden="true">Pas important</span>
          <div className="ptiles">
            {tile(QUADS[0], 0)}
            {tile(QUADS[1], 1)}
            {tile(QUADS[2], 2)}
            {tile(QUADS[3], 3)}
            {/* Le disque « À trier » au centre : la cinquième zone n'a pas de
                place sur les axes, et le centre est le seul endroit qui le dise. */}
            <button
              className={`ppark${slot === 'parking' ? ' ppark--on' : ''}`}
              aria-pressed={slot === 'parking'}
              aria-label={`À trier — ${countOpen(tasks, board.id, 'parking')}`}
              onClick={() => setSlot('parking')}
            >
              <span className="ppark__n">{countOpen(tasks, board.id, 'parking')}</span>
              <span className="ppark__label">à trier</span>
            </button>
          </div>
        </div>

        <section
          className={`pslot${slot === 'now' ? ' pslot--now' : ''}`}
          style={
            quad
              ? ({ '--q-ink': quad.ink, '--q-dark': quad.dark, '--q-bg': quadBg(quad) } as CSSProperties)
              : undefined
          }
          aria-labelledby="pslot-h"
          onDragOver={(e: DragEvent) => {
            if (drag && slot !== 'now') e.preventDefault();
          }}
          onDrop={(e: DragEvent) => {
            if (drag && slot !== 'now') {
              e.preventDefault();
              dropAt(slot, null);
            }
          }}
        >
          <div className="pslot__head">
            <h2 className="pslot__title" id="pslot-h">
              {slot === 'now' ? 'Ce qui presse' : quad!.label}
            </h2>
            <span className="pslot__sub">
              {slot === 'now' ? 'en retard, puis le jour' : quad!.sub ?? 'pas encore de case'}
            </span>
            {slot !== 'faire' && (
              <button className="pslot__back" onClick={() => setSlot('faire')}>
                Faire d’abord
              </button>
            )}
          </div>

          {liste.length === 0 ? (
            <p className="pslot__empty">Rien ici pour l’instant.</p>
          ) : (
            liste.map((t) => {
              const statut = deadlineStatus(t.due_at, now);
              const gapActive = !!drag && hoverGap === t.id && slot !== 'now';
              return (
                // Porte l'interstice, la carte (et son menu) puis l'éditeur
                // d'échéance. L'ancrage du menu, lui, vit sur `.task-anchor`.
                <div className="card-wrap" key={t.id}>
                  {slot !== 'now' && (
                    <div
                      className={`gap${gapActive ? ' gap--active' : ''}`}
                      onDragOver={(e: DragEvent) => {
                        if (drag) {
                          e.preventDefault();
                          e.stopPropagation();
                          if (hoverGap !== t.id) setHoverGap(t.id);
                        }
                      }}
                      onDrop={(e: DragEvent) => {
                        if (drag) {
                          e.preventDefault();
                          e.stopPropagation();
                          dropAt(slot, t.id);
                        }
                      }}
                    >
                      <div className="gap__line" />
                    </div>
                  )}
                  {/* Le menu s'ancre à LA CARTE et non au bloc entier : un
                      `top: 100%` calculé sur `.card-wrap` le fait tomber sous
                      l'éditeur d'échéance quand celui-ci est ouvert (#114). */}
                  <div className="task-anchor">
                    <div
                      className={`task${drag === t.id ? ' task--dragging' : ''}${statut ? ` task--${statut}` : ''}`}
                      style={
                        {
                          viewTransitionName: `vt-${t.id}`,
                          // Sur la coupe « ce qui presse », chaque carte garde
                          // l'encre de SA case : c'est le seul repère de
                          // classement qui reste quand la liste les mélange.
                          ...(slot === 'now'
                            ? { '--q-ink': `var(--q-${t.quadrant}-ink)`, '--q-dark': `var(--q-${t.quadrant}-dark)` }
                            : null),
                        } as CSSProperties
                      }
                      draggable={slot !== 'now'}
                      onDragStart={(e: DragEvent) => {
                        e.dataTransfer.effectAllowed = 'move';
                        window.setTimeout(() => setDrag(t.id), 0);
                      }}
                      onDragEnd={() => {
                        setDrag(null);
                        setHoverGap(null);
                      }}
                    >
                      <button
                        className="task__check"
                        aria-label={`Terminer « ${t.title} »`}
                        onClick={() => patchTask(t.id, { done: true, archived: true })}
                      />
                      {renamingTask?.id === t.id ? (
                        <form
                          className="task__rename"
                          onSubmit={(e) => {
                            e.preventDefault();
                            commitRename();
                          }}
                        >
                          <input
                            className="task__rename-input"
                            value={renamingTask.title}
                            autoFocus
                            aria-label="Nouveau titre"
                            maxLength={500}
                            onChange={(e) => setRenamingTask({ id: t.id, title: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') setRenamingTask(null);
                            }}
                          />
                        </form>
                      ) : (
                        <TaskTitle title={t.title} />
                      )}
                      {/* Le badge porte son texte, pas seulement sa couleur —
                          même règle que le web (#19). */}
                      {t.due_at && statut && (
                        <time className={`due due--${statut}`} dateTime={t.due_at}>
                          ⏰ {formatDeadline(t.due_at, now)}
                        </time>
                      )}
                      {t.focus_day === day && <span className="chip chip--today">Aujourd’hui</span>}
                      {/* Même colonne, même pastille que le web (#23). */}
                      {t.origin === 'agent' && (
                        <span className="agent-badge" title="Créé par une application connectée">
                          agent
                        </span>
                      )}
                      <button
                        className="task__more"
                        aria-label={`Actions pour « ${t.title} »`}
                        aria-expanded={menuTask === t.id}
                        onClick={() => setMenuTask((m) => (m === t.id ? null : t.id))}
                      >
                        ⋯
                      </button>
                    </div>
                    {menuTask === t.id && (
                      <TaskMenu
                        task={t}
                        quad={t.quadrant}
                        boards={store.boards.filter((b) => b.id !== board.id)}
                        universes={store.universes}
                        onMoveQuad={(key) => menuMove(t, key)}
                        onMoveBoard={(b) => moveToBoard(t, b.id)}
                        onDeadline={() => {
                          setDating({ id: t.id, value: t.due_at ? toLocalInput(t.due_at) : '' });
                          setMenuTask(null);
                        }}
                        onRename={() => {
                          setRenamingTask({ id: t.id, title: t.title });
                          setMenuTask(null);
                        }}
                        onClose={() => setMenuTask(null)}
                      />
                    )}
                  </div>
                  {/* L'éditeur d'échéance, sous la carte (#19). Il vit hors du
                      menu : celui-ci se referme au choix de l'action, et la
                      saisie doit survivre à sa fermeture. */}
                  {dating?.id === t.id && (
                    <form
                      className="due-edit"
                      onSubmit={(e: FormEvent) => {
                        e.preventDefault();
                        patchTask(t.id, { due_at: fromLocalInput(dating.value) });
                        setDating(null);
                      }}
                    >
                      <input
                        className="due-edit__input"
                        type="datetime-local"
                        value={dating.value}
                        autoFocus
                        aria-label="Échéance"
                        onChange={(e) => setDating({ id: t.id, value: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setDating(null);
                        }}
                      />
                      <button className="due-edit__ok" type="submit">
                        OK
                      </button>
                      {t.due_at && (
                        <button
                          className="due-edit__del"
                          type="button"
                          onClick={() => {
                            patchTask(t.id, { due_at: null });
                            setDating(null);
                          }}
                        >
                          Retirer
                        </button>
                      )}
                    </form>
                  )}
                </div>
              );
            })
          )}

          {/* L'ajout vit DANS la case ouverte : plus de sélecteur de destination
              en pied de panneau, puisque la destination est sous les yeux. */}
          <label className="padd">
            <span className="sr-only">
              Nouvelle tâche dans {slot === 'now' ? 'À trier' : quad!.label}
            </span>
            <span className="padd__plus" aria-hidden="true">＋</span>
            <input
              className="padd__input"
              value={draft}
              placeholder={`ajouter dans « ${slot === 'now' ? 'À trier' : quad!.label} »…`}
              maxLength={500}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') addTask();
              }}
            />
          </label>
        </section>
      </main>

      <CaptureBar pageTitle={pageTitle} onCapture={onCapture} />
    </>
  );
}


// ── Connexion minimale (le panneau a sa propre session) ────────────────────────
function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <form className="signin" onSubmit={submit}>
      <div className="signin-brand">
        <Logo />
        <span className="home-brand">Penduline</span>
      </div>
      <p className="signin-sub">{mode === 'signin' ? 'Connexion' : 'Créer un compte'}</p>
      <input
        className="signin-input"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <input
        className="signin-input"
        type="password"
        placeholder="Mot de passe"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />
      {error && <p className="signin-error">{error}</p>}
      <button className="signin-btn" type="submit" disabled={busy}>
        {busy ? '…' : mode === 'signin' ? 'Se connecter' : "S'inscrire"}
      </button>
      <button type="button" className="signin-link" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
        {mode === 'signin' ? 'Pas de compte ? Créer' : 'Déjà un compte ? Se connecter'}
      </button>
      {/*
        Le parcours de réinitialisation n'est PAS dupliqué ici : il suppose un
        aller-retour par e-mail, donc un détour par la boîte de réception et un
        lien qui s'ouvre dans un onglet. On renvoie vers l'app web, qui porte le
        parcours complet.

        (Le motif invoqué auparavant — « un popup qui se ferme au moindre clic
        ailleurs » — a disparu avec le passage au panneau. Celui de l'aller-retour
        par e-mail, lui, tient toujours.)
      */}
      {mode === 'signin' && (
        <a className="signin-forgot" href={WEB_APP_URL} target="_blank" rel="noreferrer">
          Mot de passe oublié ?
        </a>
      )}
    </form>
  );
}
