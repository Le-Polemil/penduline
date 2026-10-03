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
/** Ce qui s'ajoute au saut de base. */
export interface Options {
  /**
   * Le saut est une OUVERTURE DE MATRICE : la carte de l'accueil devient la
   * page, sa mini-grille devient les quatre cases. Un troisième jeton dans
   * `data-vt`, parce que les noms de la carte ne doivent exister que là — sur
   * un saut ordinaire, « À trier » morphrait vers une mini-case qui n'a pas de
   * contrepartie, et l'on verrait une case naître de nulle part.
   */
  carte?: boolean;
  /**
   * Le saut est une OUVERTURE D'UNIVERS : le plateau devient la page, et ses
   * mini-cases volent vers les groupes de la grande grille. Jeton distinct de
   * `carte` — les deux posent des noms différents, et les mélanger ferait
   * morpher une case de matrice vers un groupe de vue globale.
   */
  univers?: boolean;
  /**
   * Joué juste APRÈS l'échange du DOM, et avant l'instantané d'arrivée. C'est
   * la seule fenêtre où l'on peut désigner un élément du nouvel écran — marquer
   * la carte vers laquelle la matrice se replie, par exemple.
   */
  apres?: () => void;
}

/** Désigne la carte d'une matrice sur l'accueil, le temps du saut. */
export function marquerCarte(boardId: string): void {
  document.querySelector(`[data-board="${CSS.escape(boardId)}"]`)?.setAttribute('data-vt-board', '');
}

function oublierLesCartes(): void {
  for (const el of document.querySelectorAll('[data-vt-board]')) el.removeAttribute('data-vt-board');
  oublierLesNoms();
}

export function transitionDeVue(dir: Direction, fn: () => void, options: Options = {}): void {
  // `typeof` et non une simple vérité : la bibliothèque TypeScript déclare la
  // méthode comme toujours présente, alors que Safari et Firefox ne l'ont pas.
  if (typeof document.startViewTransition !== 'function' || mouvementReduit()) {
    fn();
    options.apres?.();
    oublierLesCartes();
    return;
  }

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
  racine.setAttribute(
    ATTR,
    `on ${dir}${options.carte ? ' carte' : ''}${options.univers ? ' univers' : ''}`,
  );

  let vt: ViewTransition;
  try {
    vt = document.startViewTransition(() => {
      flushSync(fn);
      // APRÈS `flushSync`, et pas dans `fn` : c'est seulement ici que le DOM du
      // nouvel écran existe.
      options.apres?.();
    });
  } catch {
    // Un navigateur qui annonce l'API mais la refuse (transition déjà en vol,
    // document caché) ne doit pas laisser l'écran sur place.
    racine.removeAttribute(ATTR);
    fn();
    options.apres?.();
    oublierLesCartes();
    return;
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
        oublierLesCartes();
        courante = null;
      }
      secouerLeNid(dir, options.carte || options.univers);
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
/**
 * La secousse du nid, qui ponctue les cinq transitions retenues.
 *
 * ⚠️ DEUX secousses, et c'est la planche qui le veut. Un saut d'un écran à
 * l'autre est un voyage : 640 ms, large (9° → −5° → 2°). Une carte qui s'ouvre
 * ou un plateau qui se déplie reste sur place : 440 ms, plus serré
 * (9° → −3,5° → 1°), pour que le nid s'apaise avec le bandeau et non après lui.
 * Les unifier ferait traîner le nid de 200 ms sur les deux gestes courts.
 *
 * ⚠️ Elle part APRÈS la transition, pas avec elle comme sur les planches : le
 * temps d'une view transition le DOM réel est masqué au profit des
 * pseudo-éléments, et une animation posée sur le nid vivant ne se verrait pas.
 */
function secouerLeNid(dir: Direction, bref = false): void {
  if (mouvementReduit()) return;
  const sens = dir === 'fwd' ? 1 : -1;
  const souple = 'cubic-bezier(.22,1,.36,1)';
  const duree = bref ? 440 : 640;
  const [haut, bas] = bref ? [-3.5, 1] : [-5, 2];

  for (const pivot of document.querySelectorAll('.hero__swing, .shero__swing')) {
    pivot.animate(
      [
        { transform: 'rotate(0deg)', easing: souple },
        { transform: `rotate(${9 * sens}deg)`, offset: 0.22, easing: souple },
        { transform: `rotate(${haut * sens}deg)`, offset: 0.52, easing: souple },
        { transform: `rotate(${bas * sens}deg)`, offset: 0.78, easing: souple },
        { transform: 'rotate(0deg)' },
      ],
      { duration: duree },
    );
  }
  // Le nid s'éclaire au premier balancement : à 8 % d'opacité, une variation de
  // luminosité ne se verrait pas. C'est l'opacité qui porte l'éclat.
  for (const nid of document.querySelectorAll('.hero__nest, .shero__nest')) {
    nid.animate([{ opacity: 0.08 }, { opacity: 0.22, offset: 0.25 }, { opacity: 0.08 }], {
      duration: duree,
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

/* ── Le nid comme destination ───────────────────────────────────────────────
   Planches « Aujourd'hui — C : la tâche monte au nid » et « Revue — D : le tri
   au nid ». Les deux gestes sont le même : quelque chose qu'on vient de régler
   quitte l'écran en direction du nid, qui encaisse le choc.

   C'est la seule transition du lot qui ne passe PAS par l'API View Transitions,
   et pour une raison de fond : elle ne change pas d'écran. Un instantané de
   page entière pour faire voler une carte coûterait le gel de tout le reste, et
   l'arc dépend de positions réelles qu'un pseudo-élément ne connaît pas. */

/**
 * Envoie un fantôme de `source` se poser dans le nid.
 *
 * ⚠️ UN CLONE, et pas l'élément lui-même. L'élément d'origine disparaît dans la
 * foulée — c'est tout l'intérêt du geste — et React le démonte quand il veut :
 * l'animer reviendrait à courir après un nœud qui peut s'évaporer en plein vol.
 * Le clone vit dans une couche fixe, ne reçoit aucun clic, et se retire tout
 * seul.
 *
 * L'arc passe par un point haut (−70 px à mi-parcours) : une trajectoire droite
 * se lit comme un glissement, une trajectoire courbe comme un lancer.
 */
export function envoyerAuNid(source: Element | null | undefined): void {
  if (!source || mouvementReduit()) return;
  const nid = document.querySelector('.hero__nest, .shero__nest');
  if (!nid) return;

  const depart = source.getBoundingClientRect();
  const cible = nid.getBoundingClientRect();
  if (depart.width === 0 || depart.height === 0) return;
  const dx = cible.left + cible.width / 2 - (depart.left + depart.width / 2);
  const dy = cible.top + cible.height / 2 - (depart.top + depart.height / 2);

  const fantome = source.cloneNode(true) as HTMLElement;
  // Un clone porte les identifiants de son modèle : deux `id` identiques dans
  // le document casseraient `aria-labelledby` et les étiquettes de formulaire
  // le temps du vol.
  fantome.removeAttribute('id');
  for (const el of fantome.querySelectorAll('[id]')) el.removeAttribute('id');
  fantome.setAttribute('aria-hidden', 'true');
  fantome.style.cssText = `position:fixed;left:${depart.left}px;top:${depart.top}px;width:${depart.width}px;height:${depart.height}px;margin:0;pointer-events:none;z-index:45`;
  document.body.append(fantome);

  const vol = fantome.animate(
    [
      { transform: 'none', opacity: 1 },
      {
        transform: `translate(${dx * 0.42}px, ${dy * 0.42 - 70}px) scale(0.38) rotate(-5deg)`,
        opacity: 1,
        offset: 0.45,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(0.03) rotate(9deg)`, opacity: 0 },
    ],
    { duration: 400, easing: 'cubic-bezier(.45,0,.35,1)' },
  );
  void vol.finished.catch(() => undefined).then(() => fantome.remove());

  // Le nid encaisse, 250 ms plus tard — quand le fantôme y arrive, pas quand il
  // part. Un nid qui tressaille au décollage raconterait l'inverse du geste.
  for (const pivot of document.querySelectorAll('.hero__swing, .shero__swing')) {
    pivot.animate(
      [
        { transform: 'none' },
        { transform: 'rotate(-5deg) scale(1.05)', offset: 0.45 },
        { transform: 'none' },
      ],
      { duration: 200, delay: 250, easing: 'ease-out' },
    );
  }
}

/* ── Univers → Vue globale ──────────────────────────────────────────────────
   Planche « G : le plateau se déplie + le nid ». Le plateau d'un univers
   devient la page, et chaque mini-case de chaque matrice vole vers le groupe
   qui lui correspond dans la grande grille.

   ⚠️ LES NOMS SONT POSÉS EN JAVASCRIPT, pas en feuille de styles — contrairement
   à l'ouverture d'une matrice. Il en faut un par COUPLE (matrice, case), et leur
   nombre dépend des données : une règle CSS devrait énumérer des matrices qu'on
   ne connaît qu'à l'exécution. L'identifiant de la matrice entre dans le nom, ce
   qui garantit l'unicité sans avoir à compter les rangs — et les rangs ne
   coïncideraient pas, la vue globale sautant les matrices vides d'une case. */

const CASES = ['faire', 'planifier', 'deleguer', 'eliminer'] as const;

/** Les éléments qui portent un nom posé à la main, pour savoir quoi effacer. */
const MARQUE = 'data-vt-nom';

function nommer(el: Element, nom: string): void {
  (el as HTMLElement).style.viewTransitionName = nom;
  el.setAttribute(MARQUE, '');
}

/** Le plateau d'un univers, côté accueil : le plateau, et ses mini-cases pleines. */
export function marquerUnivers(universeId: string): void {
  const plateau = document.querySelector(`[data-universe="${CSS.escape(universeId)}"]`);
  if (!plateau) return;
  nommer(plateau, 'pd-tray');
  for (const ligne of plateau.querySelectorAll('[data-board]')) {
    const board = ligne.getAttribute('data-board');
    if (!board) continue;
    for (const q of CASES) {
      // Une mini-case VIDE n'a pas de groupe en face : la nommer la ferait
      // voler vers nulle part. Elle se contente du fondu général.
      const cell = ligne.querySelector(`.mini-grid__cell--${q}:not(.mini-grid__cell--empty)`);
      if (cell) nommer(cell, `pd-u-${board}-${q}`);
    }
  }
}

/** La vue globale : la page, et un groupe par couple (matrice, case). */
export function marquerVueGlobale(): void {
  const page = document.querySelector('.matrix');
  if (page) nommer(page, 'pd-tray');
  for (const groupe of document.querySelectorAll('.bgroup[data-board]')) {
    const board = groupe.getAttribute('data-board');
    const q = groupe.closest('[id^="q-"]')?.id.slice(2);
    if (board && q && (CASES as readonly string[]).includes(q)) {
      nommer(groupe, `pd-u-${board}-${q}`);
    }
  }
}

/** Efface les noms posés à la main. Appelé avec le nettoyage général. */
function oublierLesNoms(): void {
  for (const el of document.querySelectorAll(`[${MARQUE}]`)) {
    (el as HTMLElement).style.viewTransitionName = '';
    el.removeAttribute(MARQUE);
  }
}
