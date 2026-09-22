import { useCallback, useEffect, useState } from 'react';
import type { BoardRange, Membre } from '@penduline/shared';
import type { Store } from './store';

/**
 * De quoi NOMMER les gens d'une matrice partagée (#53).
 *
 * `tasks.author_id` et `tasks.completed_by` portent des UUID. Les adresses
 * vivent dans `auth.users`, fermé à l'application : c'est la RPC
 * `membres_matrice` qui les rend, bornée par `peut_lire`.
 *
 * ⚠️ **Rien n'est chargé sur une matrice personnelle**, et c'est le point : sur
 * une matrice à soi, l'auteur est toujours soi. Demander ces noms là-bas serait
 * une requête par ouverture d'écran pour afficher « par moi » sur chaque carte —
 * le même raisonnement que la pastille « agent », qui ne décore pas les 99 %.
 */
export function useMembres(store: Store, board: BoardRange | null) {
  const [membres, setMembres] = useState<Membre[]>([]);
  const partagee = !!board?.partagee;
  const boardId = board?.id ?? null;

  useEffect(() => {
    if (!boardId || !partagee) {
      setMembres([]);
      return;
    }
    let vivant = true;
    void store.membres(boardId).then((m) => vivant && setMembres(m));
    return () => {
      vivant = false;
    };
  }, [boardId, partagee, store]);

  /**
   * L'adresse de quelqu'un, ou `null` si on ne sait pas la dire.
   *
   * `null` plutôt qu'un UUID tronqué ou un « inconnu » : un identifiant affiché
   * à l'écran n'apprend rien à personne, et l'appelant préférera taire la
   * mention plutôt que d'écrire « coché par 8f3a… ».
   */
  const nom = useCallback(
    (userId: string | null): string | null => {
      if (!userId) return null;
      if (userId === store.userId) return 'vous';
      return membres.find((m) => m.user_id === userId)?.email ?? null;
    },
    [membres, store.userId],
  );

  return { membres, nom };
}
