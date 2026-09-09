import { useEffect, useRef, useState } from 'react';

/** Délai laissé au double-clic pour annuler le dépliage. */
const ATTENTE_DOUBLE_CLIC = 220;

/**
 * Lire un titre tronqué, d'un clic sur la carte (#95).
 *
 * `.task__title` porte `white-space: nowrap` et coupe aux points de suspension :
 * un titre long devient illisible, et **rien** ne permettait d'en voir la suite —
 * ni infobulle, ni dépliage. Un titre coupé n'est pas seulement inélégant, il est
 * inutile : « Appeler le plombier pour la fuite sous l'… » ne dit pas quoi faire.
 *
 * Le dépliage a été préféré au retour à la ligne systématique : il garde la
 * grille compacte pour la grande majorité des titres, qui tiennent sur une ligne,
 * au lieu de faire varier la hauteur de TOUTES les cartes pour un cas minoritaire.
 *
 * ⚠️ TROIS PIÈGES, et le geste ne vaut que s'ils sont tous les trois évités.
 *
 * 1. **Le glisser doit disqualifier le clic.** La carte est déplaçable : sans
 *    précaution, tout début de déplacement finirait par déplier un titre. La
 *    règle porte sur le GESTE, pas sur son résultat — un glisser abandonné, qui
 *    n'a pas bougé la tâche d'un pixel, ne réhabilite PAS le clic. L'utilisateur
 *    a voulu déplacer, pas lire.
 * 2. **Le double-clic renomme**, et partage son premier clic avec celui-ci. Le
 *    clic arme donc un minuteur que le double-clic annule. Le dépliage traîne un
 *    peu, mais aucun clignotement : un titre qui s'ouvre puis se referme sous le
 *    curseur se lit comme un bug.
 * 3. **On ne déplie QUE ce qui est tronqué.** Sur un titre court, le clic ne doit
 *    produire aucun mouvement — un geste qui ne change rien de visible se lit
 *    comme une panne.
 *
 * `tronque` sert aussi l'affordance : sans lui, rien n'annoncerait qu'il y a
 * quelque chose à lire. Il conditionne le curseur et l'infobulle native.
 *
 * ⚠️ **Les écouteurs sont posés sur la CARTE (`.task`), pas sur le titre**, et en
 * natif plutôt qu'en props React. Ce n'est pas de la coquetterie : cliquer
 * n'importe où sur la carte doit déplier, et le titre n'est qu'un de ses enfants.
 * Passer par des props obligerait chaque hôte à recâbler trois gestionnaires sur
 * son propre rendu de carte — or le panneau d'extension rend ses cartes DANS UNE
 * BOUCLE, où aucun hook ne peut vivre. Cette forme laisse donc les deux hôtes
 * partager exactement le même code, sans extraction de composant.
 */
export function useTitreDepliable(
  titre: string,
  /**
   * `doubleClic: false` déplie SANS attendre.
   *
   * À utiliser là où le double-clic ne renomme pas — le panneau d'extension, qui
   * renomme par son menu `⋯`. Y garder les 220 ms serait une lenteur payée pour
   * désambiguïser un geste qui n'existe pas.
   */
  { doubleClic = true }: { doubleClic?: boolean } = {},
) {
  const ref = useRef<HTMLSpanElement>(null);
  const [deplie, setDeplie] = useState(false);
  const [tronque, setTronque] = useState(false);

  /**
   * Mesurer la troncature, et la re-mesurer quand la colonne change de largeur.
   *
   * Un effet sur le seul titre ne suffirait pas : la même phrase tient sur une
   * ligne dans une grille large et déborde dans une colonne étroite, et
   * l'utilisateur redimensionne sa fenêtre — ou son panneau latéral.
   */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mesurer = () => setTronque(el.scrollWidth > el.clientWidth + 1);
    mesurer();
    const obs = new ResizeObserver(mesurer);
    obs.observe(el);
    return () => obs.disconnect();
    // `deplie` est volontairement absent des dépendances : déplié, l'élément
    // n'est plus tronqué par construction, et re-mesurer ferait retomber
    // `tronque` à faux — donc disparaître le curseur au moment du clic.
  }, [titre]);

  useEffect(() => {
    const el = ref.current;
    const carte = el?.closest('.task');
    if (!carte) return;

    /** Un glisser a-t-il commencé depuis le dernier appui ? */
    let glisse = false;
    let minuteur: number | null = null;
    const desarmer = () => {
      if (minuteur !== null) window.clearTimeout(minuteur);
      minuteur = null;
    };

    const basculer = () => {
      // Relu au déclenchement, et non capturé : la largeur peut avoir changé
      // entre l'appui et l'échéance du minuteur.
      const cible = ref.current;
      const coupe = !!cible && cible.scrollWidth > cible.clientWidth + 1;
      setDeplie((d) => (d ? false : coupe));
    };

    const ouvrirGeste = () => {
      glisse = false;
    };
    const marquerGlisser = () => {
      glisse = true;
    };
    const surClic = (e: Event) => {
      if (glisse) return;
      const cible = e.target;
      // Les contrôles de la carte (cocher, étape, aujourd'hui, `⋯`) ont leur
      // propre action : elle ne doit pas se doubler d'un dépliage. Et pendant un
      // renommage, le clic sert à placer le curseur dans le champ.
      if (cible instanceof Element && cible.closest('button, input, textarea, form, a')) return;
      desarmer();
      if (!doubleClic) return basculer();
      minuteur = window.setTimeout(() => {
        minuteur = null;
        basculer();
      }, ATTENTE_DOUBLE_CLIC);
    };

    carte.addEventListener('pointerdown', ouvrirGeste);
    carte.addEventListener('dragstart', marquerGlisser);
    carte.addEventListener('click', surClic);
    carte.addEventListener('dblclick', desarmer);
    return () => {
      desarmer();
      carte.removeEventListener('pointerdown', ouvrirGeste);
      carte.removeEventListener('dragstart', marquerGlisser);
      carte.removeEventListener('click', surClic);
      carte.removeEventListener('dblclick', desarmer);
    };
  }, [doubleClic]);

  return { ref, deplie, tronque };
}
