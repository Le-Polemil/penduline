import { useCallback } from 'react';
import { classifyWriteFailure } from '@penduline/shared';
import type { PostgrestError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useToast } from '../components/Toast';
import { setSessionNotice } from '../lib/session-notice';

/**
 * Le déroulé commun à toute écriture optimiste : appliquer, écrire, et en cas
 * d'échec **remettre l'état d'avant** puis le dire à l'utilisateur.
 *
 * Sans ça, chaque méthode du store refaisait le même `if (error) console.error`
 * — c'est-à-dire perdait le geste en silence. Le retour arrière est ciblé
 * (les lignes touchées, remises par id) et non un `reload()` : recharger
 * écraserait une écriture concurrente encore en vol, et échouerait de toute
 * façon quand la cause de l'échec est justement la coupure réseau.
 */

/** La forme du résultat d'un appel PostgREST, réduite à ce qu'on en lit. */
export interface WriteResult<T> {
  data: T | null;
  error: PostgrestError | null;
  status: number;
}

export interface WriteOp<T> {
  /** Le geste, nommé comme le produit le nomme : « Renommer la matrice ». */
  label: string;
  /** La mise à jour optimiste. Rejouée telle quelle au réessai. */
  apply?: () => void;
  /** Obligatoire dès qu'`apply` mute l'état : c'est le retour arrière. */
  revert?: () => void;
  write: () => PromiseLike<WriteResult<T>>;
  /**
   * Ce qui reste à faire de la ligne renvoyée par le serveur — les créations
   * n'ont rien à appliquer d'avance, elles insèrent leur résultat après coup.
   *
   * Il vit ici et non chez l'appelant parce qu'un réessai doit rejouer le geste
   * **entier** : sinon la deuxième tentative écrirait bien en base, sans que
   * rien n'apparaisse à l'écran.
   */
  commit?: (data: T) => void;
}

/**
 * Le verdict d'une écriture. `ok` et non le seul `data` : les `update` et les
 * `delete` renvoient légitimement `data: null` quand ils réussissent, et
 * l'appelant doit pouvoir distinguer les deux — c'est ce qui permet à
 * `useCompletion` d'annuler l'archivage d'une tâche dont le cochage n'a pas
 * tenu.
 */
export interface WriteOutcome<T> {
  ok: boolean;
  data: T | null;
}

export type Persist = <T>(op: WriteOp<T>) => Promise<WriteOutcome<T>>;

export function usePersist(): Persist {
  const { show } = useToast();

  // Expression de fonction *nommée* : elle a besoin de se rappeler elle-même
  // pour le « Réessayer », qui rejoue exactement le même `op`.
  return useCallback(
    async function persist<T>(op: WriteOp<T>): Promise<WriteOutcome<T>> {
      op.apply?.();
      const { data, error, status } = await op.write();

      if (!error) {
        if (data !== null) op.commit?.(data);
        return { ok: true, data };
      }

      op.revert?.();
      const failure = classifyWriteFailure(error, status, op.label);
      // La trace technique reste : le message affiché est délibérément muet sur
      // le code d'erreur, et un refus de policy est un bug à diagnostiquer.
      console.error(`[penduline] ${op.label}`, status, error.code, error.message);

      if (failure.kind === 'session') {
        // Le toast ci-dessous ne sera pas lu : la déconnexion démonte l'hôte de
        // toasts dans la milliseconde. Le message est donc aussi déposé pour
        // l'écran de connexion, qui le reprend à l'arrivée.
        setSessionNotice(failure.message);
        // `local` et non `global` : le scope dit au serveur QUELLES sessions
        // révoquer, et une session morte sur cet onglet n'est pas une raison de
        // déconnecter l'utilisateur de ses autres appareils.
        //
        // À noter : `signOut` appelle le serveur quel que soit le scope, et cet
        // appel échoue ici (403 — le jeton est justement invalide). C'est sans
        // conséquence : auth-js tolère explicitement les 401/403/404 et vide la
        // session locale quand même. Le `SIGNED_OUT` part, `onAuthStateChange`
        // fait retomber `App` sur `SignIn`, et la vue courante est déjà
        // mémorisée par `Workspace`.
        void supabase.auth.signOut({ scope: 'local' });
      }

      show({
        message: failure.message,
        tone: 'error',
        // Pas de « Réessayer » sur un refus de policy ni sur une session morte :
        // rejouer à l'identique échouerait à l'identique.
        action: failure.retryable
          ? { label: 'Réessayer', onClick: () => void persist(op) }
          : undefined,
      });
      return { ok: false, data: null };
    },
    [show],
  );
}
