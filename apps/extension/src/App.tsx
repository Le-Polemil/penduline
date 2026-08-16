import { useEffect, useState, type CSSProperties, type DragEvent, type FormEvent } from 'react';
import { flushSync } from 'react-dom';
import type { Session } from '@supabase/supabase-js';
import {
  ALL,
  countOpen,
  endPosition,
  PARK,
  positionBefore,
  QUADS,
  type Quadrant,
  type QuadrantKey,
  type Board,
  type Task,
} from '@penduline/shared';
import { isConfigured, supabase } from './supabase';
import { getActiveBoard, setActiveBoard } from './active-board';
import { useExtStore, type ExtStore } from './store';

/**
 * Ouvre l'app web complète. Surchargée au build par `VITE_WEB_APP_URL` (`.env`
 * racine) ; le défaut reste le serveur de dev, pour ne pas casser le local.
 */
const WEB_APP_URL =
  (import.meta.env.VITE_WEB_APP_URL as string | undefined) ?? 'http://localhost:5173';

/**
 * « À trier » n'a pas de fond propre : `PARK.bg` vaut `'transparent'`
 * (packages/shared/src/quadrants.ts), parce que sur le web la zone occupe toute
 * la largeur sous la grille et se fond dans la page. Dans le popup elle est une
 * case comme les autres, il lui faut donc un fond — même repli neutre que celui
 * déjà appliqué au rendu de la corbeille côté web.
 */
function quadBg(q: Quadrant): string {
  return q.bg === 'transparent' ? 'var(--color-neutral-200)' : q.bg;
}

/**
 * Le disque « À trier », au centre de la grille des quatre cases.
 *
 * Au repos il occupe 72 % d'une tuile et n'affiche qu'un caractère : son compte
 * s'il tient, un « + » au-delà de neuf. Deux chiffres ne rentrent pas à cette
 * taille — plutôt que de les tronquer, on dit « il y en a beaucoup » et le
 * survol donne le chiffre exact, en agrandissant le disque à 100 %.
 *
 * Sélectionné, il reste grand : le rétrécir cacherait précisément le compte que
 * l'utilisateur vient de choisir de regarder.
 */
function ParkSquare({
  n,
  dimmed,
  selected,
  onClick,
}: {
  n: number;
  dimmed: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  const plus = n > 9;
  return (
    <button
      className={`square square--park${selected ? ' square--park-on' : ''}`}
      title={`${PARK.label} — ${n}`}
      style={{ background: PARK.ink, opacity: dimmed ? 0.3 : 1 }}
      onClick={onClick}
    >
      {/*
        Le « + » porte sa propre classe : il est centré sur l'axe mathématique de
        la fonte et non sur la hauteur des chiffres, donc il pend dans le disque
        sans un relèvement de 0,046 em (mesuré — voir `.square__idle--plus`).
      */}
      <span className={`square__idle${plus ? ' square__idle--plus' : ''}`}>{plus ? '+' : n}</span>
      <span className="square__full">{n}</span>
    </button>
  );
}

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
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <div className="popup">
      {!isConfigured ? (
        <ConfigNeeded />
      ) : !ready ? null : !session ? (
        <SignIn />
      ) : (
        <PopupApp userId={session.user.id} />
      )}
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

function PopupApp({ userId }: { userId: string }) {
  const store = useExtStore(userId);
  const [screen, setScreen] = useState<'home' | 'detail'>('home');
  const [boardId, setBoardId] = useState<string | null>(null);
  const [activeBoard, setActive] = useState<string | null>(null);

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

  function openBoard(id: string) {
    void setActiveBoard(id);
    setActive(id);
    setBoardId(id);
    withVT(() => setScreen('detail'));
  }

  if (!store.ready) return null;

  const board = store.boards.find((r) => r.id === boardId) ?? null;
  if (screen === 'detail' && board) {
    return <Detail store={store} board={board} onHome={() => withVT(() => setScreen('home'))} />;
  }
  return <Home store={store} activeBoard={activeBoard} onOpen={openBoard} />;
}

// ── Accueil ──────────────────────────────────────────────────────────────────
function Home({
  store,
  activeBoard,
  onOpen,
}: {
  store: ExtStore;
  activeBoard: string | null;
  onOpen: (id: string) => void;
}) {
  const [calmOpen, setCalmOpen] = useState(false);
  // `null` = bouton au repos ; une chaîne (même vide) = champ ouvert. Même
  // convention que l'accueil web, pour que les deux se lisent pareil.
  const [draft, setDraft] = useState<string | null>(null);

  const openCount = (r: Board) =>
    store.tasks.filter((t) => t.board_id === r.id && !t.done && !t.deleted).length;
  const active = store.boards.filter((r) => openCount(r) > 0);
  const calm = store.boards.filter((r) => openCount(r) === 0);
  const empty = store.boards.length === 0;

  async function create() {
    const name = (draft ?? '').trim();
    if (!name) return;
    const id = await store.addBoard(name);
    setDraft(null);
    // On ouvre la matrice créée : dans un popup, rester sur une liste pour aller
    // rechercher ce qu'on vient de nommer serait une étape de trop.
    if (id) onOpen(id);
  }

  return (
    <>
      <header className="home-head">
        <Logo />
        <span className="home-brand">Penduline</span>
        <a className="home-openapp" href={WEB_APP_URL} target="_blank" rel="noreferrer">
          Ouvrir l'app ›
        </a>
      </header>

      <div className="home-list">
        {/* L'état vide ne renvoie plus vers le web : c'était le seul moment où
            l'extension avouait son incomplétude, et il tombait au pire endroit —
            la toute première utilisation. */}
        {empty && draft === null && (
          <p className="empty">
            Aucune matrice pour l'instant.
            <br />
            Créez la première : une pièce, une journée, un projet…
          </p>
        )}

        {active.map((r) => (
          <button
            key={r.id}
            className="board"
            style={{ borderColor: activeBoard === r.id ? 'var(--color-accent)' : 'transparent' }}
            onClick={() => onOpen(r.id)}
          >
            <span className="board__name">{r.name}</span>
            <span className="board__pills">
              {QUADS.map((q) => ({ ink: q.ink, n: countOpen(store.tasks, r.id, q.key) }))
                .filter((p) => p.n > 0)
                .map((p, i) => (
                  <span key={i} className="pill" style={{ background: p.ink }}>
                    {p.n}
                  </span>
                ))}
            </span>
            <span className="board__chev">›</span>
          </button>
        ))}

        {calm.length > 0 && (
          <>
            <button className="calm-toggle" onClick={() => setCalmOpen((o) => !o)}>
              {(calmOpen ? '▾' : '▸') + ` ${calm.length} ${calm.length > 1 ? 'matrices calmes' : 'matrice calme'}`}
            </button>
            {calmOpen &&
              calm.map((r) => (
                <button key={r.id} className="board board--calm" onClick={() => onOpen(r.id)}>
                  <span className="board__name">{r.name}</span>
                  <span className="board__meta">Rien à faire</span>
                  <span className="board__chev">›</span>
                </button>
              ))}
          </>
        )}

        {draft === null ? (
          <button className="add-board" onClick={() => setDraft('')}>
            ＋ Nouvelle matrice
          </button>
        ) : (
          <form
            className="add-board-form"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input
              className="add-board-input"
              value={draft}
              autoFocus
              placeholder="Nom de la matrice"
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              // Échap annule. Pas de fermeture au blur : cliquer sur « Créer »
              // déclenche d'abord le blur, ce qui perdrait la saisie.
              onKeyDown={(e) => {
                if (e.key === 'Escape') setDraft(null);
              }}
            />
            {/* Dans 400 px, pas de bouton « Annuler » à côté du champ : la croix
                tient le rôle et laisse la place au nom. */}
            <button className="add-board-submit" type="submit" disabled={!draft.trim()}>
              Créer
            </button>
            <button
              className="add-board-cancel"
              type="button"
              aria-label="Annuler"
              onClick={() => setDraft(null)}
            >
              ✕
            </button>
          </form>
        )}
      </div>

      <footer className="home-foot">
        <a className="icon-btn" href="https://github.com/Le-Polemil" target="_blank" rel="noreferrer" title="GitHub">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
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
      </footer>
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
function Detail({ store, board, onHome }: { store: ExtStore; board: Board; onHome: () => void }) {
  const { tasks, patchTask } = store;
  const [filter, setFilter] = useState<QuadrantKey | null>(null);
  const [addQuad, setAddQuad] = useState<QuadrantKey>('faire');
  const [draft, setDraft] = useState('');
  const [drag, setDrag] = useState<string | null>(null);
  const [dragOverQuad, setDragOverQuad] = useState<QuadrantKey | null>(null);
  const [hoverGap, setHoverGap] = useState<{ quad: QuadrantKey; before: string } | null>(null);

  const boardTasks = tasks.filter((t) => t.board_id === board.id);

  function listFor(quad: QuadrantKey): Task[] {
    return boardTasks
      .filter((t) => t.quadrant === quad && !t.done && !t.deleted && !t.archived)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.position - b.position);
  }

  function dropAt(quad: QuadrantKey, beforeId: string | null) {
    if (!drag || drag === beforeId) return;
    const rest = boardTasks
      .filter((t) => t.quadrant === quad && !t.done && !t.deleted && !t.archived && t.id !== drag)
      .sort((a, b) => a.position - b.position);
    const pos = positionBefore(rest, beforeId);
    withVT(() => patchTask(drag, { quadrant: quad, pair_id: null, position: pos }));
    setDrag(null);
    setDragOverQuad(null);
    setHoverGap(null);
  }

  function addTask() {
    const title = draft.trim();
    if (!title) return;
    const pos = endPosition(listFor(addQuad));
    void store.addTask(board.id, addQuad, title, pos);
    setDraft('');
  }

  const addQuadObj = ALL.find((q) => q.key === addQuad) ?? ALL[0];

  return (
    <>
      <header className="detail-head">
        <button className="back" onClick={onHome}>
          ‹
        </button>
        <span className="detail-board">{board.name}</span>
        {/*
          Les cinq zones ne partagent plus ni géométrie ni comportement : les
          quatre tuiles forment la grille, le parking est un disque au centre qui
          grandit au survol. Les fondre dans une seule boucle rendrait le rendu
          illisible pour rien.
        */}
        <span className={`squares${filter === 'parking' ? ' squares--park-on' : ''}`}>
          {QUADS.map((q, i) => {
            const n = countOpen(tasks, board.id, q.key);
            const on = !filter || filter === q.key;
            return (
              <button
                key={q.key}
                className={`square square--${i + 1}`}
                title={q.label}
                style={{
                  background: q.ink,
                  opacity: on ? 1 : 0.3,
                  outline: filter === q.key ? '2px solid var(--color-text)' : 'none',
                }}
                onClick={() => setFilter((f) => (f === q.key ? null : q.key))}
              >
                {n}
              </button>
            );
          })}
          <ParkSquare
            n={countOpen(tasks, board.id, PARK.key)}
            dimmed={!!filter && filter !== PARK.key}
            selected={filter === PARK.key}
            onClick={() => setFilter((f) => (f === PARK.key ? null : PARK.key))}
          />
        </span>
      </header>

      {filter && (
        <div className="filter-banner">
          <span>
            Filtre : <strong>{ALL.find((q) => q.key === filter)?.label}</strong>
          </span>
          <button className="filter-clear" onClick={() => setFilter(null)}>
            ✕ tout voir
          </button>
        </div>
      )}

      <div className="detail-list">
        {ALL.filter((q) => !filter || filter === q.key).map((q) => {
          const list = listFor(q.key);
          const outline = drag ? (dragOverQuad === q.key ? q.ink : `${q.ink}66`) : 'transparent';
          return (
            <div
              key={q.key}
              className="quad"
              style={
                {
                  '--q-ink': q.ink,
                  '--q-dark': q.dark,
                  background: quadBg(q),
                  borderColor: outline,
                } as CSSProperties
              }
              onDragOver={(e: DragEvent) => {
                if (drag) {
                  e.preventDefault();
                  if (dragOverQuad !== q.key) setDragOverQuad(q.key);
                }
              }}
              onDrop={(e: DragEvent) => {
                if (drag) {
                  e.preventDefault();
                  dropAt(q.key, null);
                }
              }}
            >
              <div className="quad-head">
                <span className="quad-label">{q.label}</span>
                {q.sub && <span className="quad-sub">{q.sub}</span>}
                <span className="quad-count">{countOpen(tasks, board.id, q.key)}</span>
              </div>
              <div className="quad-tasks">
                {list.map((t) => {
                  const gapActive = !!drag && hoverGap?.quad === q.key && hoverGap.before === t.id;
                  const isDrag = drag === t.id;
                  return (
                    <div key={t.id}>
                      <div
                        className={`gap${gapActive ? ' gap--active' : ''}`}
                        onDragOver={(e: DragEvent) => {
                          if (drag) {
                            e.preventDefault();
                            e.stopPropagation();
                            if (hoverGap?.before !== t.id || hoverGap?.quad !== q.key)
                              setHoverGap({ quad: q.key, before: t.id });
                          }
                        }}
                        onDrop={(e: DragEvent) => {
                          if (drag) {
                            e.preventDefault();
                            e.stopPropagation();
                            dropAt(q.key, t.id);
                          }
                        }}
                      >
                        <div className="gap__line" />
                      </div>
                      <div
                        className={`task${t.pinned ? ' task--pinned' : ''}${isDrag ? ' task--dragging' : ''}`}
                        style={{ viewTransitionName: `vt-${t.id}` } as CSSProperties}
                        draggable
                        onDragStart={(e: DragEvent) => {
                          e.dataTransfer.effectAllowed = 'move';
                          window.setTimeout(() => setDrag(t.id), 0);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setDragOverQuad(null);
                          setHoverGap(null);
                        }}
                      >
                        <button
                          className="task__check"
                          aria-label="Terminer"
                          onClick={() => patchTask(t.id, { done: true, archived: true })}
                        />
                        <span className="task__title">{t.title}</span>
                        <button
                          className={`task__pin${t.pinned ? ' task__pin--on' : ''}`}
                          title={t.pinned ? 'Désépingler' : 'Épingler en haut'}
                          onClick={() => withVT(() => patchTask(t.id, { pinned: !t.pinned, pair_id: null }))}
                        >
                          ⚑
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <footer className="detail-foot">
        <input
          className="add-input"
          value={draft}
          placeholder={`＋ ajouter dans « ${addQuadObj.label} »…`}
          style={{ borderColor: addQuadObj.ink }}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addTask();
          }}
        />
        {/*
          Même figure que l'en-tête, mais géométrie SEULE : ces pastilles ne
          portent aucun compteur, donc l'agrandissement au survol n'aurait rien
          à révéler — ce serait un geste qui promet quelque chose et ne le tient
          pas.
        */}
        <span className="add-squares">
          {QUADS.map((q, i) => (
            <button
              key={q.key}
              className={`add-square add-square--${i + 1}`}
              title={`Ajouter dans ${q.label}`}
              style={{ background: q.ink, outline: addQuad === q.key ? '2px solid var(--color-text)' : 'none' }}
              onClick={() => setAddQuad(q.key)}
            />
          ))}
          <button
            className="add-square add-square--park"
            title={`Ajouter dans ${PARK.label}`}
            style={{
              background: PARK.ink,
              outline: addQuad === PARK.key ? '2px solid var(--color-text)' : 'none',
            }}
            onClick={() => setAddQuad(PARK.key)}
          />
        </span>
      </footer>
    </>
  );
}

// ── Connexion minimale (le popup a sa propre session) ────────────────────────
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
        aller-retour par e-mail, et un popup de 400×600 qui se ferme au moindre
        clic ailleurs est le pire endroit pour ça. On renvoie vers l'app web,
        qui porte le parcours complet.
      */}
      {mode === 'signin' && (
        <a className="signin-forgot" href={WEB_APP_URL} target="_blank" rel="noreferrer">
          Mot de passe oublié ?
        </a>
      )}
    </form>
  );
}
