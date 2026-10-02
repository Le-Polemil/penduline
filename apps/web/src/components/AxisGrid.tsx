import type { ReactNode } from 'react';

/**
 * La grille 2×2 et ses axes — ce qui fait d'elle une matrice d'Eisenhower.
 *
 * Les quatre cases portent déjà leur nom et leur sous-titre (« Faire — urgent +
 * important »). Les axes disent la MÊME chose autrement : urgence en abscisse,
 * importance en ordonnée. Pour qui connaît la matrice, c'est le repère qui
 * manquait ; pour qui la découvre, c'est la clé de lecture.
 *
 * ⚠️ `aria-hidden` sur les quatre libellés, délibérément. Au lecteur d'écran,
 * l'information est déjà dans le nom de chaque case — la répéter sous forme de
 * quatre mots flottants (« Urgent », « Pas urgent », « Important »…) sans la
 * géométrie qui leur donne un sens ajouterait du bruit, pas du contexte.
 *
 * Les enfants sont les cases elles-mêmes, dans l'ordre faire / planifier /
 * déléguer / éliminer : ils doivent rester des ENFANTS DIRECTS de la grille,
 * sinon ils ne sont plus des éléments de grille et la colonne des axes s'effondre.
 * « À trier » ne passe pas par ici : elle n'a pas de place sur les axes, et se
 * range sous la grille, décalée de la gouttière.
 */
export function AxisGrid({
  faire,
  planifier,
  deleguer,
  eliminer,
}: {
  faire: ReactNode;
  planifier: ReactNode;
  deleguer: ReactNode;
  eliminer: ReactNode;
}) {
  return (
    <div className="axes">
      <span className="axes__corner" />
      <span className="axes__top" aria-hidden="true">Urgent</span>
      <span className="axes__top" aria-hidden="true">Pas urgent</span>
      <span className="axes__side" aria-hidden="true">Important</span>
      {faire}
      {planifier}
      <span className="axes__side" aria-hidden="true">Pas important</span>
      {deleguer}
      {eliminer}
    </div>
  );
}
