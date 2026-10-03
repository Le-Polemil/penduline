import { flushSync } from 'react-dom';
import { mouvementReduit } from './viewTransition';

/**
 * Les transitions entre écrans (planches « Transition… » du canvas de design).
 *
 * ⚠️ POURQUOI UN SECOND MODULE À CÔTÉ DE `viewTransition.ts`. Celui-là anime un
 * changement DANS un écran — une carte qui part à la corbeille, une tâche qui
 * change de case — et n'a rien à dire sur la direction ni sur le décor. Ici on
 * anime un changement D'ÉCRAN : il faut savoir si l'on avance ou si l'on
 * revient, poser des `view-transition-name` le temps du saut, et secouer le nid.
 * Les deux partagent la garde de mouvement réduit, et rien d'autre.
 *
 * ── CE QUE LE NAVIGATEUR FAIT, ET CE QU'IL NE FAIT PAS ──────────────────────
 *
 * Un `view-transition-name` doit être UNIQUE dans le document au moment de
 * l'instantané. C'est pourquoi ils ne sont posés QUE pendant la transition, par
 * un attribut sur `<html>` que la feuille de styles lit : hors transition,
 * aucun élément n'en porte, et deux écrans ne peuvent pas se disputer un nom.
 *
 * Le même attribut porte la DIRECTION, que le CSS ne peut pas deviner : la même
 * paire d'écrans se traverse dans les deux sens, et un glissement qui irait
 * toujours vers la gauche ferait mentir le geste.
 */

/** Vers l'avant (on descend la barre) ou vers l'arrière (on la remonte). */
export type Direction = 'fwd' | 'back';

/** L'attribut que la feuille de styles lit. Un seul, pour un seul nettoyage. */
const ATTR = 'data-vt';

/** La transition en cours. Une à la fois : la suivante coupe la précédente. */
let courante: ViewTransition | null = null;

/**
 * Change d'écran en animant le passage.
 *
 * `fn` doit faire la mise à jour d'état et RIEN d'autre : elle est rejouée dans
 * un `flushSync`, parce que l'API a besoin du DOM d'après au retour de la
 * fonction. Laissée à la planification normale de React, elle prendrait
 * l'instantané « après » sur le DOM d'avant, et rien ne bougerait.
 */
export function transitionDeVue(dir: Direction, fn: () => void): void {
  // `typeof` et non une simple vérité : la bibliothèque TypeScript déclare la
  // méthode comme toujours présente, alors que Safari et Firefox ne l'ont pas.
  if (typeof document.startViewTransition !== 'function' || mouvementReduit()) return fn();

  // Une navigation rapide ne doit pas empiler deux transitions : la seconde
  // coupe la première, qui aurait de toute façon animé vers un écran périmé.
  if (courante) {
    try {
      courante.skipTransition();
    } catch {
      // Déjà terminée : rien à couper.
    }
  }

  const racine = document.documentElement;
  racine.setAttribute(ATTR, `on ${dir}`);

  let vt: ViewTransition;
  try {
    vt = document.startViewTransition(() => flushSync(fn));
  } catch {
    // Un navigateur qui annonce l'API mais la refuse (transition déjà en vol,
    // document caché) ne doit pas laisser l'écran sur place.
    racine.removeAttribute(ATTR);
    return fn();
  }
  courante = vt;

  void vt.finished
    .catch(() => {
      // Une transition coupée rejette : ce n'est pas une erreur, c'est le geste
      // suivant qui est arrivé.
    })
    .then(() => {
      if (courante === vt) {
        racine.removeAttribute(ATTR);
        courante = null;
      }
      secouerLeNid(dir);
    });
}

/**
 * Le nid se secoue dans le sens de la navigation, puis s'apaise.
 *
 * ⚠️ APRÈS la transition, et sur l'élément RÉEL — pas sur l'instantané. Le
 * balancement dure 640 ms quand le saut en dure 380 : animé sur un
 * `::view-transition-*`, il serait coupé en plein vol au moment où le
 * pseudo-élément disparaît. Joué après, il déborde sur l'écran d'arrivée, et
 * c'est précisément l'effet voulu — le nid continue de pendre quand la page
 * s'est déjà posée.
 *
 * `element.animate()` passe DEVANT l'animation CSS `hero-sway` qui tourne en
 * permanence : les animations du Web Animations API sont plus haut dans l'ordre
 * de composition que celles déclarées en feuille de styles. Le balancement
 * normal reprend tout seul à la fin, sans qu'on ait à le relancer.
 */
function secouerLeNid(dir: Direction): void {
  if (mouvementReduit()) return;
  const sens = dir === 'fwd' ? 1 : -1;
  const souple = 'cubic-bezier(.22,1,.36,1)';

  for (const pivot of document.querySelectorAll('.hero__swing, .shero__swing')) {
    pivot.animate(
      [
        { transform: 'rotate(0deg)', easing: souple },
        { transform: `rotate(${9 * sens}deg)`, offset: 0.22, easing: souple },
        { transform: `rotate(${-5 * sens}deg)`, offset: 0.52, easing: souple },
        { transform: `rotate(${2 * sens}deg)`, offset: 0.78, easing: souple },
        { transform: 'rotate(0deg)' },
      ],
      { duration: 640 },
    );
  }
  // Le nid s'éclaire au premier balancement : à 8 % d'opacité, une variation de
  // luminosité ne se verrait pas. C'est l'opacité qui porte l'éclat.
  for (const nid of document.querySelectorAll('.hero__nest, .shero__nest')) {
    nid.animate([{ opacity: 0.08 }, { opacity: 0.22, offset: 0.25 }, { opacity: 0.08 }], {
      duration: 640,
      easing: 'ease-out',
    });
  }
}

/**
 * Dans quel sens va-t-on d'une vue à l'autre ?
 *
 * L'ordre est celui de la barre du haut, qui est aussi celui de la barre
 * d'onglets : le glissement rejoue le geste qu'on vient de faire, de gauche à
 * droite. Une vue inconnue (une matrice ouverte, par exemple) compte comme la
 * section qui la contient — c'est « Matrices » qui y ramène.
 */
const ORDRE = ['home', 'board', 'focus', 'global', 'bilan'] as const;
const RANG: Record<string, number> = {
  home: 0,
  board: 0,
  focus: 1,
  global: 2,
  bilan: 3,
};

export function sensEntre(de: string, vers: string): Direction {
  return (RANG[vers] ?? 0) >= (RANG[de] ?? 0) ? 'fwd' : 'back';
}

export { ORDRE };
