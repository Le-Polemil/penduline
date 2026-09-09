import type { ReactNode } from 'react';

/**
 * Icônes Lucide recopiées en ligne (tracés officiels, v1.41).
 *
 * ⚠️ DOUBLON ASSUMÉ de `apps/web/src/components/Icons.tsx`, réduit aux seules
 * icônes qu'emploie le menu ⋯ du panneau. Le partager supposerait de faire
 * entrer React — et un rendu JSX — dans `@penduline/shared`, qui est aujourd'hui
 * de la logique pure sans aucune dépendance de rendu : un prix hors de
 * proportion avec deux tracés. C'est #79 (migration vers Lucide) qui tranchera
 * la forme définitive du système d'icônes ; d'ici là, deux copies visibles
 * valent mieux qu'un paquet commun bâti pour l'occasion.
 *
 * Pas de dépendance npm : le dépôt n'en a aucune pour les icônes et s'interdit
 * les CDN par choix de confidentialité — une extension publiée qui appelle un
 * tiers à chaque ouverture doit le déclarer au Chrome Web Store.
 */
export function Icon({
  size = 15,
  fill = 'none',
  children,
}: {
  size?: number;
  fill?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={fill}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** `alarm-clock` — poser une échéance. */
export function IconAlarmClock({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2" />
      <path d="M5 3 2 6" />
      <path d="m22 6-3-3" />
      <path d="M6.38 18.7 4 21" />
      <path d="M17.64 18.67 20 21" />
    </Icon>
  );
}

/** `pen-line` — renommer. */
export function IconPenLine({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M13 21h8" />
      <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
    </Icon>
  );
}
