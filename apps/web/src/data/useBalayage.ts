import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';

/**
 * Le balayage d'une carte de tâche (#89).
 *
 * ⚠️ POURQUOI CE GESTE EXISTE. Sous `(hover: none)`, les deux raccourcis de la
 * carte (`.task__act`) passaient à 44 × 44 pour rester frappables : 88 px pris
 * sur 306. Le titre tombait à 91 px, à 13 px dès qu'une échéance s'affichait, et
 * à **zéro** dans une paire — deux commandes secondaires occupaient plus de place
 * que la seule chose qu'on vient lire. Les sortir de la carte et les poser dans
 * un bandeau révélé au balayage rend au titre ~176 px sans supprimer une seule
 * fonction. Le menu `⋯` reste le chemin sans geste : un geste directionnel ne
 * doit jamais être le seul accès à une action (WCAG 2.5.1).
 *
 * ⚠️ IL N'Y A PAS DE CONFLIT AVEC LE GLISSER-DÉPOSER, et ce n'est pas un
 * arbitrage à l'exécution : c'est une exclusion à la CONSTRUCTION. Le balayage
 * n'est monté que sous 720 px, où le glisser HTML5 ne se déclenche pas depuis le
 * tactile ; au-dessus (iPad, desktop) il ne l'est pas du tout, et l'axe
 * horizontal appartient au glisser seul. Les deux API ne coexistent jamais sur
 * un même écran.
 *
 * Trois gardes complètent l'isolation :
 *
 * 1. `touch-action: pan-y` sur le conteneur — le navigateur garde l'axe vertical
 *    et nous laisse l'horizontal, sans avoir à annuler un événement passif (React
 *    pose ses écouteurs de mouvement en passif : un `preventDefault` y serait
 *    ignoré, avec un avertissement en console).
 * 2. Un seuil de 10 px avant d'armer : sans lui, le moindre tremblement pendant
 *    un appui ouvrirait le bandeau. Et tant que le geste n'est pas armé, un
 *    mouvement plus vertical qu'horizontal le lui rend : c'est un défilement.
 * 3. Le `click` est avalé si la carte a bougé. Indispensable :
 *    `useTitreDepliable` n'arme son garde-fou `glisse` que sur `dragstart`, qui
 *    n'arrive jamais ici — sans cet avalement, **tout balayage déplierait un
 *    titre**. L'écouteur est posé en phase de CAPTURE sur le conteneur, donc en
 *    amont de celui de `useTitreDepliable`, qui vit sur `.task` en bouillonnement.
 */

/** Distance parcourue avant que le geste soit considéré comme horizontal. */
const SEUIL = 10;

/**
 * L'état où retombe la carte au relâchement.
 *
 * Sortie du gestionnaire d'événement pour être testable sans DOM, comme
 * `gapIndexAt` et `dropTarget` l'ont été dans `dnd/gap.ts`. C'est toute la règle
 * du geste : au-delà de la moitié du bandeau, il reste ouvert.
 *
 * `dx` est le décalage de la carte, négatif vers la gauche — le sens qui découvre
 * le bandeau.
 */
export function etatApres(dx: number, largeur: number): 'ouvert' | 'ferme' {
  if (largeur <= 0) return 'ferme';
  return -dx >= largeur / 2 ? 'ouvert' : 'ferme';
}

/**
 * Borne le suivi du doigt à la largeur du bandeau.
 *
 * Au-delà, la carte se décollerait du bord droit et laisserait un vide : le
 * bandeau est adossé au bord, il n'y a rien de plus à découvrir. Vers la droite,
 * la carte ne dépasse jamais sa position de repos.
 */
export function borner(dx: number, largeur: number): number {
  return Math.min(0, Math.max(-largeur, dx));
}

export interface Balayage {
  /** Décalage courant de la carte, en pixels (négatif ou nul). */
  decalage: number;
  /** Le geste est-il en cours ? Coupe la transition pendant le suivi du doigt. */
  suit: boolean;
  /** À poser sur le conteneur clippant (`.task-swipe`). */
  gestes: {
    onPointerDown: (e: ReactPointerEvent) => void;
    onPointerMove: (e: ReactPointerEvent) => void;
    onPointerUp: (e: ReactPointerEvent) => void;
    onPointerCancel: () => void;
  };
}

/**
 * @param conteneur Le conteneur clippant, qui porte l'avaleur de `click`.
 * @param actif     Le geste est-il monté ? (faux au-dessus de 720 px)
 * @param ouvert    Le bandeau est-il ouvert ? L'état vit chez l'ÉCRAN, comme
 *                  `menuOpen` — une seule carte ouverte à la fois, et c'est lui
 *                  qui le sait.
 * @param onOuvrir  Demande d'ouverture ou de fermeture.
 * @param largeur   Largeur du bandeau, en pixels.
 */
export function useBalayage(
  conteneur: RefObject<HTMLElement>,
  actif: boolean,
  ouvert: boolean,
  onOuvrir: (ouvert: boolean) => void,
  largeur: number,
): Balayage {
  const [decalage, setDecalage] = useState(0);
  const [suit, setSuit] = useState(false);
  /* Hors état React : ces valeurs changent soixante fois par seconde pendant un
     geste, et un rendu par mouvement ne servirait à rien. */
  const origine = useRef<{ x: number; y: number } | null>(null);
  const arme = useRef(false);
  /** Le geste a-t-il déplacé la carte ? Lu par l'avaleur de `click`. */
  const bouge = useRef(false);

  /* La position de repos suit l'état, et non l'inverse : refermer depuis
     l'extérieur — un appui ailleurs, une autre carte balayée — doit ramener la
     carte sans passer par le geste. */
  useEffect(() => {
    setDecalage(actif && ouvert ? -largeur : 0);
  }, [actif, ouvert, largeur]);

  const fin = useCallback(
    (dx: number) => {
      setSuit(false);
      arme.current = false;
      origine.current = null;
      const etat = etatApres(dx, largeur);
      /* On repose la carte ici plutôt que d'attendre l'effet : si l'état ne
         change pas — geste avorté — l'effet ne rejouerait pas, et la carte
         resterait où le doigt l'a laissée. */
      setDecalage(etat === 'ouvert' ? -largeur : 0);
      if ((etat === 'ouvert') !== ouvert) onOuvrir(etat === 'ouvert');
    },
    [largeur, onOuvrir, ouvert],
  );

  const gestes = {
    onPointerDown: (e: ReactPointerEvent) => {
      if (!actif || e.pointerType === 'mouse') return;
      origine.current = { x: e.clientX, y: e.clientY };
      arme.current = false;
      bouge.current = false;
    },
    onPointerMove: (e: ReactPointerEvent) => {
      const o = origine.current;
      if (!actif || !o) return;
      const dx = e.clientX - o.x;
      const dy = e.clientY - o.y;
      if (!arme.current) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SEUIL) {
          origine.current = null;
          return;
        }
        if (Math.abs(dx) < SEUIL) return;
        arme.current = true;
        bouge.current = true;
        setSuit(true);
      }
      setDecalage(borner((ouvert ? -largeur : 0) + dx, largeur));
    },
    onPointerUp: (e: ReactPointerEvent) => {
      const o = origine.current;
      if (!actif || !o) return;
      if (!arme.current) {
        origine.current = null;
        return;
      }
      fin(borner((ouvert ? -largeur : 0) + (e.clientX - o.x), largeur));
    },
    onPointerCancel: () => {
      if (!actif || !origine.current) return;
      fin(ouvert ? -largeur : 0);
    },
  };

  useEffect(() => {
    const el = conteneur.current;
    if (!actif || !el) return;
    function avaler(e: Event) {
      if (!bouge.current) return;
      bouge.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
    el.addEventListener('click', avaler, true);
    return () => el.removeEventListener('click', avaler, true);
  }, [actif, conteneur]);

  return { decalage, suit, gestes };
}

/**
 * La frontière entre les deux gestes horizontaux, en pixels.
 *
 * C'est le point de bascule déjà utilisé par la grille 2×2 (`styles.css`), et il
 * sépare ici deux mondes : en dessous, le balayage ; au-dessus, le glisser-déposer
 * HTML5. La LARGEUR et non `(hover: none)`, parce que le glisser HTML5 fonctionne
 * sur iPad (Safari, depuis iOS 11, par appui long) et pas sur téléphone — or
 * `(hover: none)` confond les deux, là où iPhone ≤ 430 et iPad ≥ 768 se séparent
 * proprement.
 */
export const SEUIL_TELEPHONE = 720;

/** Largeur d'un bouton du bandeau. Partagée avec `styles.css` (`.task-swipe__act`). */
export const LARGEUR_ACTION = 44;

/** Sommes-nous sous le seuil téléphone ? Suivi, parce qu'on tourne l'appareil. */
export function useTelephone(): boolean {
  return useRequeteMedia(`(max-width: ${SEUIL_TELEPHONE}px)`);
}

/**
 * Le pointeur est-il FIN — une souris, un trackpad, un stylet précis ?
 *
 * Le pendant JS de la garde `(hover: hover) and (pointer: fine)` posée sur tout
 * le survol de `styles.css` (#90). Il sert là où un effet de survol est piloté en
 * JavaScript plutôt qu'en CSS : on ne MONTE alors les gestionnaires de souris que
 * sur un pointeur qui peut se promener sans rien déclencher, au lieu d'arbitrer
 * dans le gestionnaire lui-même. Même exclusion à la construction que pour le
 * balayage — voir l'en-tête de ce fichier.
 *
 * ⚠️ C'est le TROISIÈME axe, et il ne se confond ni avec `useTelephone` (la
 * largeur, donc la géométrie) ni avec `(pointer: coarse)` (la taille du doigt,
 * donc les cibles). L'iPad les sépare à lui seul : large, grossier, sans survol.
 */
export function usePointeurFin(): boolean {
  return useRequeteMedia('(hover: hover) and (pointer: fine)');
}

/** Le rouage commun aux deux : une requête média suivie dans le temps. */
function useRequeteMedia(requete: string): boolean {
  const [vrai, setVrai] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(requete).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(requete);
    const suivre = () => setVrai(mq.matches);
    suivre();
    mq.addEventListener('change', suivre);
    return () => mq.removeEventListener('change', suivre);
  }, [requete]);
  return vrai;
}
