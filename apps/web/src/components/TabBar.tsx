import { Icon } from './Icons';
import type { TopBarView } from './TopBar';

/** Ce que chaque onglet désigne, et le tracé qui le dit sans mot. */
const TABS: {
  to: 'home' | 'focus' | 'global' | 'bilan';
  /** Le mot sous l'icône. Court — quatre onglets dans 390 px, c'est 97 px chacun. */
  label: string;
  /** Le nom complet, pour qui n'a que le nom accessible. */
  aria: string;
  icon: string;
}[] = [
  { to: 'home', label: 'Matrices', aria: 'Matrices', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' },
  {
    to: 'focus',
    label: 'Aujourd’hui',
    aria: 'Aujourd’hui',
    icon: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  },
  { to: 'global', label: 'Globale', aria: 'Vue globale', icon: 'M3 6h18M3 12h18M3 18h18M8 3v18' },
  { to: 'bilan', label: 'Bilan', aria: 'Bilan', icon: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2' },
];

/**
 * La navigation du téléphone : quatre onglets en bas, fixes.
 *
 * Elle REMPLACE la ligne de pastilles défilante de la barre du haut, qui avait
 * deux défauts qu'aucun réglage ne corrigeait : « Revue » et « Rétrospective »
 * naissaient hors champ — il fallait deviner qu'on pouvait faire défiler pour
 * apprendre qu'elles existent — et elle remontait avec la page, donc elle
 * n'était plus là au moment où l'on avait fini de lire et où l'on voulait aller
 * ailleurs. En bas, les vues sont toujours visibles et toujours à portée de
 * pouce.
 *
 * ⚠️ Quatre emplacements, et le compte est une contrainte, pas un hasard : à
 * 390 px, quatre onglets font 97 px chacun. C'est précisément cette contrainte
 * qui a fait réunir rétrospective, revue et objectifs sous « Bilan » plutôt que
 * d'en faire une sixième entrée : à six, « Aujourd'hui » se serait tronqué.
 * Toute vue de plus devra se loger DANS une des quatre.
 *
 * Une matrice ouverte n'a pas d'onglet à elle : c'est « Matrices » qui y ramène,
 * et qui reste marquée comme la section courante — une matrice EST une page de
 * la section matrices. Même règle que la barre du haut.
 *
 * Masquée au-delà de 720 px : la barre du haut y porte déjà la navigation, en
 * entier et sans défilement.
 */
export function TabBar({
  view,
  onNavigate,
}: {
  view: TopBarView;
  onNavigate: (to: 'home' | 'focus' | 'global' | 'bilan') => void;
}) {
  return (
    <nav className="tabbar" aria-label="Vues">
      <ul className="tabbar__list">
        {TABS.map((t) => {
          const current = t.to === 'home' ? view === 'home' || view === 'board' : view === t.to;
          return (
            <li className="tabbar__item" key={t.to}>
              <button
                className="tabbar__link"
                aria-label={t.aria}
                aria-current={current ? 'page' : undefined}
                onClick={() => onNavigate(t.to)}
              >
                <span className="tabbar__pill">
                  <Icon size={20}>
                    <path d={t.icon} />
                  </Icon>
                </span>
                {/* Le mot est décoratif : le nom accessible du bouton porte déjà
                    l'intitulé complet, et l'abrégé (« Rétro ») y ferait doublon. */}
                <span className="tabbar__label" aria-hidden="true">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
