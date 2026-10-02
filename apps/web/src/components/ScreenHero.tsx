import type { ReactNode } from 'react';

/**
 * Le héros réduit des écrans intérieurs — matrice, vue globale, aujourd'hui, revue.
 *
 * L'accueil a le sien (`HomeHero`), plus grand et câblé sur le jour. Celui-ci
 * n'est qu'une COQUILLE : le bandeau d'encre qui prolonge la barre du haut, le
 * nid en filigrane, la vague qui rejoint le fond de page. Chaque écran y verse
 * ce qu'il a à dire — un petit titre de section, un titre en Caprasimo, des
 * chiffres clés en pastilles.
 *
 * Pourquoi une coquille et non un composant à props (`eyebrow`, `title`,
 * `pills`…) : les quatre écrans n'arrangent pas les mêmes choses dans le même
 * ordre — la matrice met son fil d'Ariane au-dessus du titre, la vue globale
 * intercale une ligne de portées, « Aujourd'hui » centre tout. Une signature
 * assez large pour les couvrir toutes serait une signature qui ne dit plus rien.
 *
 * Le nid reprend les décalages de l'accueil (`top: -40px`,
 * `right: clamp(-120px, 2vw, 60px)`) dans une taille plus petite : le bandeau
 * est moins haut, un nid à l'échelle de l'accueil en déborderait. Il n'existe
 * pas pour les lecteurs d'écran et ne bouge plus sous `prefers-reduced-motion`.
 */
export function ScreenHero({
  children,
  /** Ajoute une classe au bandeau — « Aujourd'hui » s'en sert pour centrer et respirer. */
  variant,
}: {
  children: ReactNode;
  variant?: string;
}) {
  return (
    <section className={`shero${variant ? ` shero--${variant}` : ''}`}>
      {/* Le décor est dans SA PROPRE couche, et c'est elle qui rogne — pas le
          bandeau. `overflow: hidden` posé sur `.shero` couperait le menu du
          sélecteur de matrice, qui descend sous la vague. */}
      <span className="shero__decor" aria-hidden="true">
        <span className="shero__nest">
          <span className="shero__branch" />
          <span className="shero__swing">
            <span className="shero__nid" />
          </span>
        </span>
      </span>
      <div className="shero__inner">{children}</div>
      {/* Le même tracé que le héros de l'accueil : les deux bandeaux se
          terminent de la même main, sinon on les lit comme deux gabarits. */}
      <svg className="shero__wave" viewBox="0 0 1280 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 40 L0 22 C120 6 220 36 360 22 C500 8 600 34 760 20 C900 8 1020 32 1140 18 C1200 12 1240 16 1280 20 L1280 40 Z" />
      </svg>
    </section>
  );
}
