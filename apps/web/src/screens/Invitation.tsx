import { useEffect, useState } from 'react';
import { Loader } from '../components/Loader';
import {
  accepterInvitation,
  explicationRole,
  libelleRole,
  lireInvitation,
  INVITATION_PATH,
} from '../lib/partage';
import type { InvitationLue } from '@penduline/shared';

/**
 * L'écran d'acceptation d'un lien d'invitation (#53).
 *
 * Bâti sur `AuthorizeScreen` de bout en bout — même `.auth-card`, même
 * structure, même règle de fond : **ce qui s'affiche est ce que le SERVEUR
 * rend, jamais ce que l'URL porte**. Un lien forgé afficherait sinon un nom de
 * matrice rassurant au-dessus du partage de quelqu'un d'autre.
 *
 * Il est rendu par `App` APRÈS le test de session, exactement comme l'écran de
 * consentement : un visiteur déconnecté s'inscrit d'abord et retombe ici, l'URL
 * n'ayant pas bougé. C'est ce qui fait tenir le cas « invitation d'une adresse
 * sans compte » sans un seul chemin de plus.
 */
export function InvitationScreen({ jeton }: { jeton: string }) {
  const [details, setDetails] = useState<InvitationLue | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let vivant = true;
    void lireInvitation(jeton).then((d) => {
      if (!vivant) return;
      setDetails(d);
      setChargement(false);
    });
    return () => {
      vivant = false;
    };
  }, [jeton]);

  /**
   * Quitter l'écran pour l'accueil.
   *
   * `replace` et non `assign` : une invitation consommée n'a pas à rester dans
   * l'historique. Y revenir par « Précédent » présenterait un lien qui ne vaut
   * plus rien, donc un écran qui ne peut que se solder par un refus.
   */
  function versAccueil() {
    window.location.replace('/');
  }

  async function rejoindre() {
    setEnvoi(true);
    setErreur(null);
    try {
      await accepterInvitation(jeton);
      versAccueil();
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(false);
    }
  }

  if (chargement) return <Loader label="Vérification de l’invitation…" />;

  // Les trois cas — inconnu, expiré, déjà utilisé — se présentent ENSEMBLE, et
  // c'est délibéré : les distinguer ferait de cet écran un oracle permettant de
  // tester des jetons au hasard. La phrase dit quoi faire, ce qui est le seul
  // service utile ici.
  if (!details) {
    return (
      <main className="auth">
        <div className="auth-card">
          <h1>Penduline</h1>
          <p className="error">Ce lien d’invitation n’est plus valable.</p>
          <p className="muted">
            Il a peut-être déjà servi, ou expiré. Demandez-en un nouveau à la personne qui
            partage la matrice.
          </p>
          <button className="btn-primary" onClick={versAccueil}>
            Aller à mes matrices
          </button>
        </div>
      </main>
    );
  }

  // Un lien rouvert, ou reçu deux fois. Rien à accepter — et surtout pas de
  // bouton « Rejoindre » qui laisserait croire qu'il manque un geste.
  if (details.deja_accessible) {
    return (
      <main className="auth">
        <div className="auth-card">
          <h1>Penduline</h1>
          <p>
            Vous avez déjà accès à <strong>{details.board_name}</strong>.
          </p>
          <button className="btn-primary" onClick={versAccueil}>
            Aller à mes matrices
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <div className="auth-card">
        <h1>Penduline</h1>
        <p className="muted">Quelqu’un partage une matrice avec vous.</p>

        <p className="consent-cible">
          <strong>{details.board_name}</strong>
          {details.invited_by && <span className="muted">partagée par {details.invited_by}</span>}
        </p>

        <p className="consent-portee">
          Vous y aurez accès en <strong>{libelleRole(details.role)}</strong>.{' '}
          {explicationRole(details.role)}
        </p>

        <p className="muted">
          Vous pourrez quitter ce partage à tout moment ; la matrice restera intacte pour les
          autres.
        </p>

        {erreur && <p className="error">{erreur}</p>}

        <button className="btn-primary" onClick={() => void rejoindre()} disabled={envoi}>
          {envoi ? '…' : 'Rejoindre'}
        </button>
        <button className="btn-link" onClick={versAccueil} disabled={envoi}>
          Pas maintenant
        </button>
      </div>
    </main>
  );
}

export { INVITATION_PATH };
