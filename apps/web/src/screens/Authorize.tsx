import { useEffect, useState } from 'react';
import { Loader } from '../components/Loader';
import { lireDemande, repondreDemande, type DemandeAutorisation } from '../lib/mcp';

/**
 * L'écran de consentement du serveur MCP (#23).
 *
 * Il vit ICI, dans l'application déjà connectée, et non côté serveur MCP : ce
 * dernier n'a ni session de navigateur ni écran de connexion, et lui en
 * fabriquer un reviendrait à demander le mot de passe Penduline sur un second
 * domaine — l'habitude exacte dont vit l'hameçonnage.
 *
 * Ce qui s'affiche est ce que le SERVEUR rend, jamais ce que l'URL porte : un
 * lien forgé afficherait sinon un nom rassurant au-dessus de la demande de
 * quelqu'un d'autre.
 */
export function AuthorizeScreen({ demande, jeton }: { demande: string; jeton: string }) {
  const [details, setDetails] = useState<DemandeAutorisation | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let vivant = true;
    lireDemande(demande)
      .then((d) => vivant && setDetails(d))
      .catch((e: Error) => vivant && setErreur(e.message));
    return () => {
      vivant = false;
    };
  }, [demande]);

  async function repondre(autorise: boolean) {
    setEnvoi(true);
    setErreur(null);
    try {
      // `replace` et non `assign` : l'écran de consentement n'a pas à rester
      // dans l'historique. Y revenir par « Précédent » présenterait une demande
      // déjà tranchée, donc un écran qui ne peut que se solder par une erreur.
      window.location.replace(await repondreDemande(demande, autorise, jeton));
    } catch (e) {
      setErreur((e as Error).message);
      setEnvoi(false);
    }
  }

  if (erreur && !details) {
    return (
      <main className="auth">
        <div className="auth-card">
          <h1>Penduline</h1>
          <p className="error">{erreur}</p>
        </div>
      </main>
    );
  }

  if (!details) return <Loader label="Vérification de la demande…" />;

  return (
    <main className="auth">
      <div className="auth-card">
        <h1>Penduline</h1>
        <p className="muted">Une application demande l’accès à vos matrices.</p>

        <p className="consent-cible">
          <strong>{details.client_name}</strong>
          <span className="muted">renverra vers {details.redirect_host}</span>
        </p>

        <p className="consent-portee">
          Elle pourra <strong>lire</strong> vos univers, vos matrices et vos tâches, et en{' '}
          <strong>créer, déplacer et terminer</strong>. Elle ne peut ni supprimer définitivement,
          ni toucher à votre compte. Les tâches qu’elle crée portent une marque « agent ».
        </p>

        <p className="muted">
          Vous pourrez retirer cet accès à tout moment depuis « Applications connectées ».
        </p>

        {erreur && <p className="error">{erreur}</p>}

        <button className="btn-primary" onClick={() => repondre(true)} disabled={envoi}>
          {envoi ? '…' : 'Autoriser'}
        </button>
        <button className="btn-link" onClick={() => repondre(false)} disabled={envoi}>
          Refuser
        </button>
      </div>
    </main>
  );
}
