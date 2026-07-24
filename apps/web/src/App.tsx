import { useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { useStore } from './data/store';
import { Home } from './screens/Home';
import { MatrixScreen } from './screens/Matrix';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return null;
  if (!session) return <SignIn />;
  return <AppRoot userId={session.user.id} />;
}

function AppRoot({ userId }: { userId: string }) {
  const store = useStore(userId);
  const [roomId, setRoomId] = useState<string | null>(null);

  if (!store.ready) return null;

  const room = store.rooms.find((r) => r.id === roomId) ?? null;

  return (
    <div>
      <div className="userbar">
        <button className="signout" onClick={() => supabase.auth.signOut()}>
          Déconnexion
        </button>
      </div>
      {room ? (
        <MatrixScreen store={store} room={room} onHome={() => setRoomId(null)} onSwitch={setRoomId} />
      ) : (
        <Home store={store} onOpen={setRoomId} />
      )}
    </div>
  );
}

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
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1>Penduline</h1>
        <p className="muted">
          {mode === 'signin' ? 'Connexion à ton compte' : 'Créer un compte'}
        </p>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Mot de passe
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>
          {busy ? '…' : mode === 'signin' ? 'Se connecter' : "S'inscrire"}
        </button>
        <button
          type="button"
          className="btn-link"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'Pas de compte ? Créer' : 'Déjà un compte ? Se connecter'}
        </button>
      </form>
    </main>
  );
}
