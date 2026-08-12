/**
 * Modèle de la matrice d'Eisenhower — aligné sur la maquette Claude Design
 * (« Matrice Maison.dc.html »).
 *
 * 4 cases + une 5ᵉ zone « À trier » (parking) pleine largeur pour ce qu'on ne
 * sait pas encore classer. Une couleur par case (palette terracotta/sauge du
 * design system « Organic ») :
 *
 *   faire      vert   — urgent + important
 *   planifier  bleu   — important, pas urgent
 *   deleguer   doré   — urgent, pas important
 *   eliminer   rouge  — ni urgent, ni important
 *   parking    neutre — à trier
 *
 * `key` est stocké tel quel en base (enum Postgres `quadrant`). Ne pas renommer
 * sans migration.
 */

export type QuadrantKey = 'faire' | 'planifier' | 'deleguer' | 'eliminer' | 'parking';

export interface Quadrant {
  key: QuadrantKey;
  /** Titre affiché (police heading) */
  label: string;
  /** Sous-titre explicatif. Absent quand le titre parle de lui-même (« À trier »). */
  sub?: string;
  /** Couleur pleine (badges, cercle de checkbox, contours au drag) */
  ink: string;
  /** Variante foncée lisible sur fond clair (titres, texte sur `bg`) */
  dark: string;
  /** Fond de la case */
  bg: string;
}

export const QUADS: Quadrant[] = [
  { key: 'faire',     label: 'Faire',     sub: 'urgent + important',      ink: '#5c6b45', dark: '#43502f', bg: '#e3e8da' },
  { key: 'planifier', label: 'Planifier', sub: 'important, pas urgent',   ink: '#38607f', dark: '#27455c', bg: '#dde7ef' },
  { key: 'deleguer',  label: 'Déléguer',  sub: 'urgent, pas important',   ink: '#8f6a14', dark: '#6b4f0e', bg: '#f3e7cd' },
  { key: 'eliminer',  label: 'Éliminer',  sub: 'ni urgent, ni important', ink: '#a63d2a', dark: '#7c2d1e', bg: '#e3d8d4' },
];

export const PARK: Quadrant = {
  key: 'parking',
  label: 'À trier',
  ink: '#7b756a',
  dark: '#5d5850',
  bg: 'transparent',
};

/** Les 5 zones dans l'ordre d'affichage (les 4 cases puis « À trier »). */
export const ALL: Quadrant[] = [...QUADS, PARK];

const BY_KEY: Record<QuadrantKey, Quadrant> = Object.fromEntries(
  ALL.map((q) => [q.key, q]),
) as Record<QuadrantKey, Quadrant>;

export function quadrant(key: QuadrantKey): Quadrant {
  return BY_KEY[key] ?? PARK;
}
