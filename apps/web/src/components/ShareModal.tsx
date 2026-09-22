import { useCallback, useEffect, useState } from 'react';
import type { BoardRange, BoardRole, Invitation, Membre } from '@penduline/shared';
import { useDialog } from '../a11y/useDialog';
import { useAnnounce } from '../a11y/announce';
import type { Store } from '../data/store';
import { explicationRole, libelleRole, lienInvitation } from '../lib/partage';
import { Confirm } from './Confirm';

/**
 * « Partager une matrice » (#53).
 *
 * Bâtie sur `useDialog` et `.bin-backdrop`, comme `ConnectedApps` — et pour la
 * même raison : révoquer l'accès de quelqu'un et révoquer celui d'une
 * application connectée sont le même geste, ils doivent se présenter de la même
 * façon. Le contrat clavier complet — focus pris, `Échap`, `Tab` confiné, focus
 * rendu — vient avec le hook sans avoir à y penser.
 *
 * La seule pièce neuve est la création du lien. Le lien se partage à la main,
 * par décision : l'écran doit donc ASSUMER cette étape — un champ, un bouton
 * « Copier » — au lieu de la déguiser en envoi d'e-mail qui n'a pas lieu.
 */
export function ShareModal({
  board,
  store,
  userId,
  onClose,
}: {
  board: BoardRange;
  store: Store;
  userId: string;
  onClose: () => void;
}) {
  const dialog = useDialog(onClose);
  const announce = useAnnounce();
  const [membres, setMembres] = useState<Membre[] | null>(null);
  const [liens, setLiens] = useState<Invitation[]>([]);
  const [role, setRole] = useState<BoardRole>('lecture');
  const [email, setEmail] = useState('');
  /**
   * Le jeton CLAIR du dernier lien créé.
   *
   * ⚠️ Il ne vit qu'ici, le temps de la modale. La base n'en garde que le
   * hachage — précisément pour qu'une fuite ne rende aucun lien rejouable — et
   * le mettre ailleurs (stockage local, journal) annulerait cette propriété.
   */
  const [nouveau, setNouveau] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [aRetirer, setARetirer] = useState<Membre | null>(null);
  const [occupe, setOccupe] = useState(false);

  const recharger = useCallback(async () => {
    const [m, i] = await Promise.all([store.membres(board.id), store.invitations(board.id)]);
    setMembres(m);
    setLiens(i);
  }, [board.id, store]);

  useEffect(() => {
    void recharger();
  }, [recharger]);

  async function creerLien() {
    setOccupe(true);
    const jeton = await store.inviter(board.id, role, email);
    setOccupe(false);
    if (!jeton) return;
    setNouveau(jeton);
    setCopie(false);
    setEmail('');
    announce('Lien d’invitation créé.');
    void recharger();
  }

  async function copier() {
    if (!nouveau) return;
    try {
      await navigator.clipboard.writeText(lienInvitation(nouveau));
      setCopie(true);
      announce('Lien copié.');
    } catch {
      // Presse-papiers refusé (contexte non sécurisé, permission) : le champ
      // reste sélectionnable à la main. Un échec silencieux laisserait croire
      // que le lien est copié alors qu'il ne l'est pas.
      setCopie(false);
    }
  }

  async function retirer(m: Membre) {
    await store.retirer(board.id, m.user_id);
    announce(`Accès retiré à ${m.email ?? 'cette personne'}.`);
    void recharger();
  }

  return (
    <div className="bin-backdrop" onClick={onClose}>
      <div
        className="bin-panel"
        {...dialog.surface}
        aria-label={`Partager ${board.name}`}
        ref={dialog.ref}
        onKeyDown={dialog.onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bin-head">
          <span className="bin-title">Partager « {board.name} »</span>
          <button className="bin-close" aria-label="Fermer" onClick={onClose}>
            ✕
          </button>
        </div>

        {membres === null ? (
          <div className="bin-empty">Chargement…</div>
        ) : (
          <div className="bin-list">
            {membres.map((m) => (
              <div className="app-row" key={m.user_id}>
                <span className="app-row__nom">{m.email ?? 'compte supprimé'}</span>
                {m.proprietaire ? (
                  <span className="app-row__meta">propriétaire</span>
                ) : (
                  <>
                    <label className="sr-only" htmlFor={`role-${m.user_id}`}>
                      Rôle de {m.email ?? 'cette personne'}
                    </label>
                    <select
                      id={`role-${m.user_id}`}
                      className="share-role"
                      value={m.role ?? 'lecture'}
                      onChange={(e) => {
                        const r = e.target.value as BoardRole;
                        void store.changerRole(board.id, m.user_id, r).then(recharger);
                        announce(`${m.email ?? 'Cette personne'} est maintenant en ${libelleRole(r)}.`);
                      }}
                    >
                      <option value="lecture">lecture</option>
                      <option value="ecriture">écriture</option>
                    </select>
                    <button className="app-row__revoke" onClick={() => setARetirer(m)}>
                      {m.user_id === userId ? 'Quitter' : 'Révoquer'}
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Le propriétaire seul invite — la base le refuserait de toute façon,
            mais un formulaire mort se lit comme un bug. */}
        {!board.partagee && (
          <div className="share-invite">
            <p className="share-invite__titre">Inviter</p>
            <div className="share-invite__champs">
              <label className="sr-only" htmlFor="share-email">
                Adresse (facultatif, sert seulement de repère)
              </label>
              <input
                id="share-email"
                className="share-invite__email"
                type="email"
                placeholder="adresse (facultatif)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label className="sr-only" htmlFor="share-role-neuf">
                Rôle du lien
              </label>
              <select
                id="share-role-neuf"
                className="share-role"
                value={role}
                onChange={(e) => setRole(e.target.value as BoardRole)}
              >
                <option value="lecture">lecture</option>
                <option value="ecriture">écriture</option>
              </select>
              <button className="btn-primary" onClick={() => void creerLien()} disabled={occupe}>
                {occupe ? '…' : 'Créer un lien'}
              </button>
            </div>
            <p className="muted">{explicationRole(role)}</p>

            {nouveau && (
              <div className="share-lien">
                <label className="sr-only" htmlFor="share-lien-url">
                  Lien d’invitation
                </label>
                <input
                  id="share-lien-url"
                  className="share-lien__url"
                  readOnly
                  value={lienInvitation(nouveau)}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button className="btn-primary" onClick={() => void copier()}>
                  {copie ? 'Copié' : 'Copier'}
                </button>
                <p className="muted">
                  Ce lien donne l’accès à qui l’ouvre, une seule fois, et expire dans sept
                  jours. Envoyez-le vous-même : Penduline n’envoie aucun e-mail.
                </p>
              </div>
            )}

            {liens.length > 0 && (
              <div className="share-attente">
                <p className="share-invite__titre">Liens en attente</p>
                {liens.map((i) => (
                  <div className="app-row" key={i.id}>
                    <span className="app-row__nom">{i.email ?? 'sans adresse'}</span>
                    <span className="app-row__meta">
                      {libelleRole(i.role)} · expire le{' '}
                      {new Date(i.expires_at).toLocaleDateString('fr-FR')}
                    </span>
                    <button
                      className="app-row__revoke"
                      onClick={() => void store.annulerInvitation(i.id).then(recharger)}
                    >
                      Annuler
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {aRetirer && (
        <Confirm
          title={
            aRetirer.user_id === userId
              ? `Quitter « ${board.name} » ?`
              : `Retirer l’accès de ${aRetirer.email ?? 'cette personne'} ?`
          }
          body={
            aRetirer.user_id === userId
              ? 'La matrice disparaîtra de votre accueil. Elle reste intacte pour les autres, et les tâches que vous y avez créées y restent.'
              : 'La matrice disparaîtra de son accueil en quelques secondes. Les tâches qu’elle y a créées restent en place.'
          }
          confirmLabel={aRetirer.user_id === userId ? 'Quitter' : 'Révoquer'}
          onConfirm={() => {
            void retirer(aRetirer);
            setARetirer(null);
            if (aRetirer.user_id === userId) onClose();
          }}
          onCancel={() => setARetirer(null)}
        />
      )}
    </div>
  );
}
