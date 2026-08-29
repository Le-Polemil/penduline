import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { useStore } from './data/store';
import { Home } from './screens/Home';
import { Loader } from './components/Loader';
import { MatrixScreen } from './screens/Matrix';
import { GlobalScreen, type Scope } from './screens/Global';
import { AnnounceProvider } from './a11y/announce';
import { ToastProvider } from './components/Toast';
import { Search, type SearchHit } from './components/Search';
import { clearSessionNotice, readSessionNotice } from './lib/session-notice';

/**
 * Lit ce que GoTrue a déposé dans le fragment d'URL en renvoyant l'utilisateur.
 *
 * Le client est en flux `implicit` (défaut d'auth-js) : les jetons arrivent dans
 * le fragment, pas en PKCE. Bonne nouvelle au passage — sans code verifier à
 * retrouver en stockage local, le lien marche depuis n'importe quel navigateur,
 * donc l'utilisateur peut demander la réinitialisation ici et ouvrir son mail
 * sur son téléphone.
 *
 * On lit le fragment nous-mêmes plutôt que de tout déléguer au client, parce
 * que `PASSWORD_RECOVERY` n'est émis qu'après un aller-retour réseau : le lire
 * dès le premier rendu supprime toute course avec l'abonnement.
 *
 * ⚠️ Fonction volontairement PURE. Elle sert d'initialiseur à `useState`, que
 * StrictMode invoque DEUX FOIS en développement — un effet de bord ici ne
 * serait pas rejouable. Le nettoyage du fragment vit donc dans un effet.
 *
 * Les deux cas sont disjoints : un lien expiré porte `error_description` et
 * jamais `type=recovery`. On ne risque donc pas d'afficher l'écran de nouveau
 * mot de passe sans session derrière.
 */
function readAuthHash(): { recovery: boolean; linkError: string | null } {
  const raw = window.location.hash.slice(1);
  if (!raw) return { recovery: false, linkError: null };
  const params = new URLSearchParams(raw);
  return {
    recovery: params.get('type') === 'recovery',
    linkError: params.get('error_description'),
  };
}

export function App() {
  // Initialiseur paresseux : évalué au premier rendu, avant qu'auth-js n'ait
  // eu le temps de consommer le fragment.
  const [hash] = useState(readAuthHash);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [recovering, setRecovering] = useState(hash.recovery);

  // auth-js n'efface le fragment qu'en cas de SUCCÈS (il lève avant sur un lien
  // expiré) : on nettoie donc ce seul cas, sinon le message se rejouerait à
  // chaque rechargement. Dans un effet et non dans l'initialiseur ci-dessus :
  // `replaceState` appelé deux fois est sans conséquence, contrairement à une
  // lecture qui ne retrouverait plus son fragment.
  useEffect(() => {
    if (!hash.linkError) return;
    window.history.replaceState(
      window.history.state,
      '',
      window.location.pathname + window.location.search,
    );
  }, [hash.linkError]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Le lien de récupération OUVRE une session. Sans ce drapeau, `session`
      // deviendrait non nul et l'application s'afficherait normalement :
      // l'écran de changement de mot de passe serait purement et simplement
      // sauté, et l'utilisateur repartirait avec son ancien mot de passe.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Le nid pendulaire plutôt qu'un écran blanc : cette attente couvre un appel
  // réseau (récupération de session), elle peut durer.
  if (!ready) return <Loader />;
  // Prime délibérément sur `session` : c'est tout l'objet du drapeau.
  if (recovering) return <NewPassword onDone={() => setRecovering(false)} />;
  if (!session) return <SignIn linkError={hash.linkError} />;
  return <AppRoot userId={session.user.id} />;
}

/**
 * Ce que l'application affiche.
 *
 * Naguère un `boardId: string | null` — un booléen déguisé, qui ne pouvait pas
 * exprimer un troisième écran. La vue globale porte sa portée avec elle : elle
 * survit ainsi à un aller-retour vers l'accueil.
 */
type View =
  | { kind: 'home' }
  /**
   * `focusTask` : la tâche à mettre en évidence à l'arrivée, venue de la
   * recherche. `openBin` quand elle est terminée ou supprimée — ouvrir sur une
   * grille où la tâche n'est pas serait pire que ne rien faire.
   */
  | { kind: 'board'; id: string; focusTask?: string; openBin?: boolean }
  | { kind: 'global'; scope: Scope };

const HOME: View = { kind: 'home' };

/**
 * `sessionStorage` et non `localStorage` : la vue est un état d'onglet, pas une
 * préférence. Deux onglets ouverts sur deux matrices doivent le rester.
 */
const VIEW_KEY = 'penduline:view';

/**
 * Relit la vue de l'onglet.
 *
 * Elle est persistée pour une raison précise : une session expirée renvoie à
 * l'écran de connexion, et sans ça l'utilisateur repartait de l'accueil après
 * s'être reconnecté — il perdait l'écran sur lequel il travaillait, en plus de
 * son geste.
 *
 * Pure, comme `readAuthHash` : elle sert d'initialiseur à `useState`. Tout ce
 * qui ne se relit pas retombe sur l'accueil, y compris un JSON valide mais de
 * forme inconnue (une version antérieure du type `View`).
 */
function readView(): View {
  try {
    const raw = window.sessionStorage.getItem(VIEW_KEY);
    if (!raw) return HOME;
    const v = JSON.parse(raw) as View;
    if (v.kind === 'board' && typeof v.id === 'string') return v;
    if (v.kind === 'global' && (v.scope?.kind === 'all' || typeof v.scope?.id === 'string')) return v;
    return HOME;
  } catch {
    // `sessionStorage` peut lever (navigation privée verrouillée), et le JSON
    // stocké peut être corrompu. Ni l'un ni l'autre n'est une raison de ne pas
    // afficher l'application.
    return HOME;
  }
}

/**
 * Les fournisseurs transverses, et rien d'autre.
 *
 * Ils sont montés **au-dessus** de l'espace de travail parce que `useStore` y
 * consomme `useToast` : c'est le store qui signale les échecs d'écriture, il
 * doit donc se rendre à l'intérieur de l'hôte de toasts, pas à côté.
 */
function AppRoot({ userId }: { userId: string }) {
  return (
    // Une seule région d'annonce pour toute l'application : plusieurs zones
    // `aria-live` concurrentes sont mal restituées par les lecteurs d'écran.
    <AnnounceProvider>
      <ToastProvider>
        <Workspace userId={userId} />
      </ToastProvider>
    </AnnounceProvider>
  );
}

function Workspace({ userId }: { userId: string }) {
  const store = useStore(userId);
  const [view, setView] = useState<View>(readView);
  const [searching, setSearching] = useState(false);

  function allerA(hit: SearchHit) {
    setSearching(false);
    setView({ kind: 'board', id: hit.boardId, focusTask: hit.taskId, openBin: hit.inBin });
  }

  useEffect(() => {
    try {
      window.sessionStorage.setItem(VIEW_KEY, JSON.stringify(view));
    } catch {
      // Perdre la mémoire de la vue est un désagrément, pas une panne.
    }
  }, [view]);

  if (!store.ready) return <Loader label="Chargement de vos matrices…" />;

  // Une matrice supprimée depuis un autre appareil laisserait la vue pointer
  // dans le vide : on retombe alors sur l'accueil.
  const board = view.kind === 'board' ? store.boards.find((r) => r.id === view.id) ?? null : null;
  const onHome = () => setView(HOME);

  return (
    <>
      {/* Le retour vit dans la barre du haut, face à « Déconnexion » — et non
          dans l'en-tête de la matrice, où il était mêlé à son titre. */}
      <div className="userbar">
        {view.kind !== 'home' ? (
          <button className="crumb" onClick={onHome}>
            ‹ Retour
          </button>
        ) : (
          <span />
        )}
        <span className="userbar__right">
          {/* Dans la barre plutôt que dans un écran : la recherche est ainsi
              atteignable depuis les trois, sans qu'aucun n'ait à la porter. */}
          <button className="searchbtn" onClick={() => setSearching(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" width="14" height="14" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            Rechercher
          </button>
          <button className="signout" onClick={() => supabase.auth.signOut()}>
            Déconnexion
          </button>
        </span>
      </div>
      {searching && (
        <Search boards={store.boards} onClose={() => setSearching(false)} onPick={allerA} />
      )}
      {board ? (
        <MatrixScreen
          store={store}
          board={board}
          onHome={onHome}
          focusTask={view.kind === 'board' ? view.focusTask : undefined}
          openBin={view.kind === 'board' ? view.openBin : undefined}
          onSwitch={(id) => setView({ kind: 'board', id })}
          onGlobal={(scope) => setView({ kind: 'global', scope })}
        />
      ) : view.kind === 'global' ? (
        <GlobalScreen
          store={store}
          scope={view.scope}
          onScope={(scope) => setView({ kind: 'global', scope })}
        />
      ) : (
        <Home
          store={store}
          onOpen={(id) => setView({ kind: 'board', id })}
          onGlobal={(scope) => setView({ kind: 'global', scope })}
        />
      )}
    </>
  );
}

type Mode = 'signin' | 'signup' | 'forgot';

const TITLES: Record<Mode, string> = {
  signin: 'Connexion à votre compte',
  signup: 'Créer un compte',
  forgot: 'Réinitialiser le mot de passe',
};

const SUBMITS: Record<Mode, string> = {
  signin: 'Se connecter',
  signup: "S'inscrire",
  forgot: 'Envoyer le lien',
};

function SignIn({ linkError }: { linkError: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<Mode>('signin');
  const [error, setError] = useState<string | null>(null);
  // Initialiseur paresseux : `readSessionNotice` est pure, mais l'appeler à
  // chaque rendu pour rien n'a pas d'intérêt.
  const [notice, setNotice] = useState<string | null>(() =>
    // On ne relaie pas le message brut de GoTrue, qui est en anglais et parle
    // de « token » : l'utilisateur a juste besoin de savoir quoi faire.
    linkError
      ? "Ce lien n'est plus valable — il a expiré ou a déjà servi. Demandez-en un nouveau."
      // Une écriture a pu échouer faute de session et provoquer cette
      // déconnexion : c'est ici que son message est repris, faute de quoi
      // l'utilisateur arriverait devant cet écran sans explication.
      : readSessionNotice(),
  );
  // L'effacement est ici et non dans l'initialiseur : StrictMode invoque ce
  // dernier deux fois, et une lecture destructive perdrait le message.
  useEffect(() => clearSessionNotice(), []);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setNotice(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    if (mode === 'forgot') {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      // Anti-énumération : le message est le MÊME que l'adresse ait un compte
      // ou non. Le différencier permettrait de découvrir qui est inscrit.
      // Les vraies erreurs (réseau, quota d'envoi) ne sont volontairement pas
      // distinguées à l'écran — silence assumé, par exception au principe
      // général de remontée des échecs.
      if (error) console.error('[penduline] resetPasswordForEmail', error.message);
      setNotice(
        "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.",
      );
      setBusy(false);
      return;
    }

    if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      // Quand la confirmation d'adresse est active, `signUp` réussit SANS
      // ouvrir de session. Sans ce message l'écran resterait muet et le
      // parcours deviendrait un cul-de-sac.
      else if (!data.session)
        setNotice('Compte créé. Vérifiez votre boîte mail pour confirmer votre adresse.');
      setBusy(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>Penduline</h1>
        <p className="muted">{TITLES[mode]}</p>
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        {/* En mode « oublié », seule l'adresse est demandée. */}
        {mode !== 'forgot' && (
          <label>
            Mot de passe
            <input
              type="password"
              name="password"
              // `new-password` en inscription, sinon le gestionnaire propose un mot
              // de passe existant là où il faut en créer un.
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </label>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? '…' : SUBMITS[mode]}
        </button>
        {mode === 'forgot' ? (
          <button type="button" className="btn-link" onClick={() => switchMode('signin')}>
            ‹ Retour à la connexion
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn-link"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? 'Pas de compte ? Créer' : 'Déjà un compte ? Se connecter'}
            </button>
            {mode === 'signin' && (
              <button type="button" className="btn-link" onClick={() => switchMode('forgot')}>
                Mot de passe oublié ?
              </button>
            )}
          </>
        )}
      </form>
    </main>
  );
}

/**
 * Écran atteint depuis le lien reçu par e-mail. La session est déjà ouverte à
 * ce stade — d'où l'absence de champ « ancien mot de passe » : c'est le lien
 * qui fait foi.
 */
function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    // Pas de renvoi vers la connexion : le lien a ouvert une session, donc
    // l'utilisateur est déjà authentifié. Lui redemander ses identifiants
    // serait une corvée gratuite au pire moment.
    onDone();
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>Penduline</h1>
        <p className="muted">Choisissez un nouveau mot de passe</p>
        <label>
          Nouveau mot de passe
          <input
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoFocus
          />
        </label>
        <label>
          Confirmation
          <input
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? '…' : 'Enregistrer'}
        </button>
      </form>
    </main>
  );
}
