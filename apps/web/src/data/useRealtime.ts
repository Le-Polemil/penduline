import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeRealtime, type RealtimeHandle, type RealtimeSink } from '@penduline/shared';
import { supabase } from '../lib/supabase';

export type { RealtimeSink };

/**
 * Branche le temps réel sur le cycle de vie React.
 *
 * ⚠️ **Tout le fond a déménagé** dans `packages/shared/src/realtime.ts` : la
 * fusion des lignes, la neutralisation de l'écho, le rechargement à la
 * reconnexion, et la forme du filtre serveur y sont documentés avec leurs
 * raisons. Ce fichier ne garde que ce qui est propre à React — et il doit rester
 * à cette taille.
 *
 * Le déménagement n'est pas de l'esthétique : le panneau d'extension est un
 * second consommateur (#117), et c'est exactement la duplication qui a coûté #61
 * sur les paires. La règle vit à un seul endroit avant d'être appelée d'un second.
 *
 * ⚠️ Le `sink` passe par une **ref tenue à jour**, jamais par les dépendances de
 * l'effet : il est reconstruit à chaque rendu du store, et le capturer figerait
 * `reload` et `admits` au premier. `subscribeRealtime` prend d'ailleurs un
 * GETTER, pas un objet : le piège est inatteignable, et cette ref n'est plus
 * qu'une commodité locale.
 */
export function useRealtime(userId: string, boardIds: string[], sink: RealtimeSink) {
  const courant = useRef(sink);
  courant.current = sink;

  /**
   * La clé qui décide d'un réabonnement — **triée**, donc insensible à l'ordre.
   *
   * Le filtre serveur porte le jeu de matrices accessibles (#53), et un jeu qui
   * change impose de rouvrir le canal. Mais `boards` est trié par position :
   * sans ce tri, ranger une matrice dans un univers rouvrirait un WebSocket
   * **et** déclencherait le rechargement complet qui suit tout réabonnement — à
   * chaque glisser-déposer.
   */
  const cle = useMemo(() => [...boardIds].sort().join(','), [boardIds]);

  /**
   * Le tour de l'abonnement. L'incrémenter en reconstruit un neuf.
   *
   * C'est le seul levier de reprise dont l'hôte a besoin : un réabonnement
   * rouvre le canal ET recharge derrière (`rechargerDesLAbonnement`). On
   * réemploie ainsi la mécanique de #53 au lieu d'en inventer une seconde.
   */
  const [tour, setTour] = useState(0);

  /**
   * Le tout premier abonnement ne recharge pas : il doublerait le chargement
   * initial. Tous les suivants, si — ce sont eux qui referment la fenêtre
   * d'événements perdus entre l'ancien canal et le nouveau, que Realtime ne
   * rejoue jamais.
   */
  const premier = useRef(true);
  const abonnement = useRef<RealtimeHandle | null>(null);

  // Seuls `userId`, le JEU et le TOUR provoquent une nouvelle connexion — `sink`
  // passe par la ref, précisément pour ne pas figurer ici.
  useEffect(() => {
    const ids = cle ? cle.split(',') : [];
    const rechargerDesLAbonnement = !premier.current;
    premier.current = false;
    const h = subscribeRealtime(supabase, userId, ids, () => courant.current, {
      rechargerDesLAbonnement,
    });
    abonnement.current = h;
    return () => {
      abonnement.current = null;
      h.stop();
    };
  }, [userId, cle, tour]);

  /**
   * ⚠️ **LE FILET, ET POURQUOI IL NE PEUT PAS CROIRE UN DRAPEAU.**
   *
   * Un onglet laissé en arrière-plan voit ses minuteurs bridés. Le battement de
   * cœur s'espace, le serveur ferme la connexion, et le client ne le détecte pas
   * — c'est ce même minuteur qui devait le détecter. Aucun statut n'est donc
   * rapporté : un drapeau nourri par `onLive` resterait `true` sur un flux mort.
   *
   * Le battement en Web Worker (`heartbeatWorkerUrl`) traite la cause. Ce filet
   * traite le résidu : une mise en veille, un changement de réseau, un socket
   * mort sans fermeture propre. Il INTERROGE l'état réel au retour sur l'onglet,
   * et reconstruit l'abonnement si le flux ne tient plus.
   *
   * `visibilitychange` plutôt que `focus` : on veut le retour sur l'ONGLET, pas
   * sur la fenêtre — même choix que `useNow`.
   */
  const verifier = useCallback(() => {
    if (abonnement.current?.vivant()) return;
    setTour((n) => n + 1);
  }, []);

  useEffect(() => {
    function auRetour() {
      if (document.visibilityState !== 'visible') return;
      verifier();
    }
    document.addEventListener('visibilitychange', auRetour);
    return () => document.removeEventListener('visibilitychange', auRetour);
  }, [verifier]);
}
