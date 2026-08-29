import { useEffect, useState } from 'react';
import type { Store } from './store';

/**
 * Combien d'éléments la corbeille contient, pour une portée donnée.
 *
 * Depuis #40, son contenu n'est plus chargé au démarrage : il faut compter sans
 * charger. **Une seule source à la fois**, jamais une somme :
 *
 *   corbeille de la portée chargée  →  la mémoire, qui contient tout
 *   sinon                           →  un compte serveur, redemandé quand il vieillit
 *
 * ⚠️ Une version antérieure additionnait les deux, en croyant les ensembles
 * disjoints. Ils ne le sont pas : une corbeille chargée depuis un écran met ses
 * tâches en mémoire, et le compte serveur d'une portée plus large les compte
 * aussi. La vue globale affichait alors le double.
 *
 * `store.binVersion` change à chaque écriture qui fait entrer ou sortir une tâche
 * de la corbeille — c'est ce qui garde le compte serveur frais sans le mêler à la
 * mémoire. Il est bumpé APRÈS la persistance : la requête lit donc l'état réel,
 * au prix d'un décalage de quelques dizaines de millisecondes après le clic.
 */
export function useBinCount(store: Store, boardIds: string[]): number {
  const [serverCount, setServerCount] = useState(0);
  // Les tableaux littéraux changent d'identité à chaque rendu : on dépend de leur
  // CONTENU, sinon la requête repartirait indéfiniment.
  const key = boardIds.join(',');
  const charge = store.binLoaded(boardIds);
  const { countBin, binVersion } = store;

  useEffect(() => {
    // Chargée : la mémoire fait autorité, inutile de demander quoi que ce soit.
    if (charge) return;
    let vivant = true;
    void countBin(key ? key.split(',') : []).then((n) => {
      if (vivant) setServerCount(n);
    });
    // Un écran démonté ne doit pas écrire dans un état disparu.
    return () => {
      vivant = false;
    };
  }, [key, charge, countBin, binVersion]);

  if (!charge) return serverCount;
  const portee = new Set(boardIds);
  return store.tasks.filter((t) => portee.has(t.board_id) && (t.done || t.deleted)).length;
}
