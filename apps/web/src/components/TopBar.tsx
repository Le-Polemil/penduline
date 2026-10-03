import { useEffect, useRef, useState } from 'react';

/** Les vues que la barre sait désigner — un sous-ensemble de `View`, sans ses paramètres. */
export type TopBarView = 'home' | 'board' | 'focus' | 'global' | 'review' | 'stats';

/**
 * La barre du haut, la même sur tous les écrans.
 *
 * Elle remplace la `userbar` et son « ‹ Retour » : les lentilles qui vivaient en
 * boutons sur l'accueil deviennent une navigation, atteignable de partout. Une
 * matrice ouverte n'a pas d'entrée à elle — c'est « Matrices » qui y ramène, et
 * qui reste marquée comme la section courante (`aria-current`), puisqu'une
 * matrice EST une page de la section matrices.
 *
 * Le compte (Applications, Déconnexion) se replie derrière une pastille : ce sont
 * des gestes rares, qui n'ont pas à concurrencer la navigation.
 */
export function TopBar({
  view,
  email,
  onNavigate,
  onSearch,
  onApps,
  onSignOut,
}: {
  view: TopBarView;
  email: string | null;
  onNavigate: (to: 'home' | 'focus' | 'global' | 'review' | 'stats') => void;
  onSearch: () => void;
  onApps: () => void;
  onSignOut: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Un menu déroulant se ferme au clic ailleurs et à Échap — et rend le focus à
  // son bouton, sinon le clavier repart du début du document.
  useEffect(() => {
    if (!menu) return;
    function onDown(e: PointerEvent) {
      if (menuRef.current?.contains(e.target as Node) || triggerRef.current?.contains(e.target as Node)) return;
      setMenu(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setMenu(false);
      triggerRef.current?.focus();
    }
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  const items: { to: 'home' | 'focus' | 'global' | 'review' | 'stats'; label: string; current: boolean }[] = [
    { to: 'home', label: 'Matrices', current: view === 'home' || view === 'board' },
    { to: 'focus', label: 'Aujourd’hui', current: view === 'focus' },
    { to: 'global', label: 'Vue globale', current: view === 'global' },
    { to: 'review', label: 'Revue', current: view === 'review' },
    { to: 'stats', label: 'Rétrospective', current: view === 'stats' },
  ];
  const initial = (email?.trim()[0] ?? '?').toUpperCase();

  return (
    <header className="topbar">
      <div className="topbar__inner">
        <button className="topbar__brand" onClick={() => onNavigate('home')} aria-label="Penduline — accueil">
          <img src="/logo.png" alt="" width="26" height="40" />
          <span className="topbar__name" aria-hidden="true">Penduline</span>
        </button>

        <nav className="topbar__nav" aria-label="Vues">
          {items.map((it) => (
            <button
              key={it.to}
              className="topbar__link"
              aria-current={it.current ? 'page' : undefined}
              onClick={() => onNavigate(it.to)}
            >
              {it.label}
            </button>
          ))}
        </nav>

        <div className="topbar__right">
          <button className="topbar__search" onClick={onSearch}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" width="16" height="16" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <span className="topbar__search-label">Chercher une tâche</span>
            <kbd className="topbar__kbd" aria-hidden="true">/</kbd>
          </button>
          <div className="topbar__account">
            <button
              ref={triggerRef}
              className="topbar__avatar"
              aria-label={email ? `Compte de ${email}` : 'Compte'}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              {initial}
            </button>
            {menu && (
              <div ref={menuRef} className="topbar__menu" role="menu" aria-label="Compte">
                {email && <p className="topbar__menu-email">{email}</p>}
                <button
                  role="menuitem"
                  className="topbar__menu-item"
                  autoFocus
                  onClick={() => {
                    setMenu(false);
                    onApps();
                  }}
                >
                  Applications connectées
                </button>
                <button
                  role="menuitem"
                  className="topbar__menu-item"
                  onClick={() => {
                    setMenu(false);
                    onSignOut();
                  }}
                >
                  Déconnexion
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
