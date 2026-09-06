import type { ReactNode } from 'react';

/**
 * Icônes Lucide recopiées en ligne (tracés officiels, v1.41).
 *
 * Pas de dépendance : le dépôt n'en a aucune pour les icônes, s'interdit les CDN
 * par choix de confidentialité, et #79 — la migration vers Lucide — n'a pas
 * encore tranché la forme. Le SVG en ligne est la convention déjà en place, du
 * chevron des étapes à la corbeille de l'en-tête.
 *
 * Les formes passent en `children` plutôt qu'en liste de `d` : toutes les icônes
 * Lucide ne sont pas faites que de `<path>` (`calendar-check` porte un `<rect>`),
 * et une signature qui ne saurait qu'en dessiner obligerait à convertir les
 * autres à la main — donc à les réécrire, donc à s'écarter de l'original.
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

/** `layers-plus` — empiler une étape de plus sous la tâche. */
export function IconLayersPlus({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 .83.18 2 2 0 0 0 .83-.18l8.58-3.9a1 1 0 0 0 0-1.831z" />
      <path d="M16 17h6" />
      <path d="M19 14v6" />
      <path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 .825.178" />
      <path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l2.116-.962" />
    </Icon>
  );
}

/** `paperclip` — attacher un lien. */
export function IconPaperclip({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551" />
    </Icon>
  );
}

/**
 * `flag` — l'engagement du jour (#49). Un fanion : c'est ce qu'on plante sur ce
 * qu'on a décidé de faire.
 *
 * `filled` le remplit quand l'engagement est pris. Un contour et un aplat se
 * distinguent d'un coup d'oeil, là où deux contours de teintes différentes
 * demandent de comparer — et ne se distinguent plus du tout en niveaux de gris.
 */
export function IconFlag({ size, filled }: { size?: number; filled?: boolean }) {
  return (
    <Icon size={size} fill={filled ? 'currentColor' : 'none'}>
      <path d="M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528" />
    </Icon>
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

/** `trash-2` — supprimer. */
export function IconTrash({ size }: { size?: number }) {
  return (
    <Icon size={size}>
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Icon>
  );
}

