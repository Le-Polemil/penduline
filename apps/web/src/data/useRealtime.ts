import { useEffect, useRef } from 'react';
import { subscribeRealtime, type RealtimeSink } from '@penduline/shared';
import { supabase } from '../lib/supabase';

export type { RealtimeSink };

/**
 * Branche le temps réel sur le cycle de vie React.
 *
 * ⚠️ **Tout le fond a déménagé** dans `packages/shared/src/realtime.ts` : la
 * fusion des lignes, la neutralisation de l'écho, le rechargement à la
 * reconnexion, et le choix de ne déclarer AUCUN filtre serveur y sont documentés
 * avec leurs raisons. Ce fichier ne garde que ce qui est propre à React — et il
 * doit rester à cette taille.
 *
 * Le déménagement n'est pas de l'esthétique : le panneau d'extension devient un
 * second consommateur (#117), et c'est exactement la duplication qui a coûté #61
 * sur les paires. La règle vit à un seul endroit avant d'être appelée d'un second.
 *
 * ⚠️ Le `sink` passe par une **ref tenue à jour**, jamais par les dépendances de
 * l'effet : il est reconstruit à chaque rendu du store, et le capturer figerait
 * `reload` et `admits` au premier — le rechargement de reconnexion rappellerait
 * une fonction périmée. C'était un des deux défauts du premier jet de #39.
 * `subscribeRealtime` prend d'ailleurs un GETTER, pas un objet : le piège est
 * désormais inatteignable, et cette ref n'est plus qu'une commodité locale.
 */
export function useRealtime(userId: string, sink: RealtimeSink) {
  const courant = useRef(sink);
  courant.current = sink;

  // Seul `userId` provoque une nouvelle connexion — `sink` passe par la ref,
  // précisément pour ne pas figurer ici.
  useEffect(() => subscribeRealtime(supabase, userId, () => courant.current), [userId]);
}
