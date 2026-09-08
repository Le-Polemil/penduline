import { useTitreDepliable } from './useTitreDepliable';

/**
 * Le titre d'une tâche du panneau, dépliable au clic sur la carte (#95).
 *
 * Un composant pour une seule ligne de rendu, et c'est nécessaire : `Detail`
 * rend ses cartes DANS UNE BOUCLE, où aucun hook ne peut vivre. Extraire le titre
 * suffit — le hook pose lui-même ses écouteurs sur la carte englobante, il n'a
 * donc pas besoin que celle-ci soit un composant.
 *
 * `doubleClic: false` : le panneau renomme par son menu `⋯`, pas au double-clic.
 * Il n'y a donc rien à désambiguïser, et attendre 220 ms serait une lenteur
 * gratuite. ⚠️ Si le double-clic devient un renommage ici (c'est le point 3 de
 * #95, non livré), il faudra repasser cette option à `true` — sinon les deux
 * gestes se déclencheront ensemble.
 */
export function TaskTitle({ title }: { title: string }) {
  const titre = useTitreDepliable(title, { doubleClic: false });
  return (
    <span
      ref={titre.ref}
      className={[
        'task__title',
        titre.deplie ? 'task__title--deplie' : '',
        titre.tronque ? 'task__title--tronque' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      /* L'infobulle native ne sert QUE quand le titre est coupé : la poser sur
         tous les titres doublerait un texte déjà lisible, et le ferait énoncer
         deux fois par un lecteur d'écran. */
      title={titre.tronque && !titre.deplie ? title : undefined}
    >
      {title}
    </span>
  );
}
