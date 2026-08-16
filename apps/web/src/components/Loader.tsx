/**
 * Écran d'attente : le nid du logo qui se balance.
 *
 * Le produit tire son nom de la rémiz penduline et de son nid suspendu — le
 * balancier n'est pas un ornement, c'est le geste que le nom décrit.
 *
 * Deux choix expliquent la forme de ce fichier :
 *
 * 1. **Le tracé est recopié depuis `public/icon.svg` au lieu d'y être chargé.**
 *    `icon.svg` sert de favicon, et une SVG animée chargée comme favicon
 *    s'anime dans certains navigateurs : un logo d'onglet qui oscille en
 *    permanence. `icon.svg` reste donc strictement statique et fait foi pour le
 *    dessin ; toute retouche graphique doit être reportée ici.
 *
 * 2. **Le col et le nid sont deux groupes distincts.** Faire pivoter l'ensemble
 *    en bloc donnerait un pendule rigide ; ce sont les amplitudes légèrement
 *    différentes et le décalage de phase entre les deux qui font *plier* le col,
 *    au lieu de le faire suivre.
 */
export function Loader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <svg className="loader__svg" viewBox="11.75 5.5 88.5 88.5" aria-hidden="true">
        {/* Le col : l'attache par laquelle le nid pend. */}
        <g className="loader__neck">
          <path d="M48 10 C48 4 64 4 64 10 L62 24 C60 30 52 30 50 24 Z" fill="#c67139" />
        </g>
        {/* Le nid et ses quatre tuiles, dans l'ordre de la matrice. */}
        <g className="loader__nest">
          <path
            d="M56 20 C39 20 28 36 28 56 C28 76 39 94 56 94 C73 94 84 76 84 56 C84 36 73 20 56 20 Z"
            fill="#c67139"
          />
          <path
            d="M45.5 40.5 L49.5 40.5 A5 5 0 0 1 54.5 45.5 L54.5 55.5 L44.5 55.5 A5 5 0 0 1 39.5 50.5 L39.5 46.5 A6 6 0 0 1 45.5 40.5 Z"
            fill="#dbe3ce"
          />
          <path
            d="M62.5 40.5 L66.5 40.5 A6 6 0 0 1 72.5 46.5 L72.5 50.5 A5 5 0 0 1 67.5 55.5 L57.5 55.5 L57.5 45.5 A5 5 0 0 1 62.5 40.5 Z"
            fill="#dde7ef"
          />
          <path
            d="M44.5 58.5 L54.5 58.5 L54.5 68.5 A5 5 0 0 1 49.5 73.5 L45.5 73.5 A6 6 0 0 1 39.5 67.5 L39.5 63.5 A5 5 0 0 1 44.5 58.5 Z"
            fill="#f2e0c4"
          />
          <path
            d="M57.5 58.5 L67.5 58.5 A5 5 0 0 1 72.5 63.5 L72.5 67.5 A6 6 0 0 1 66.5 73.5 L62.5 73.5 A5 5 0 0 1 57.5 68.5 Z"
            fill="#e3d8d4"
          />
        </g>
      </svg>
      <span className="loader__label">{label}</span>
    </div>
  );
}
