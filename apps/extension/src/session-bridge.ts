import { BRIDGE_SIGNOUT, parseBridgeMessage } from '@penduline/shared';
import { supabase, isConfigured } from './supabase';
import { WEB_APP_ORIGIN } from './web-app';

/**
 * Le bout récepteur du canal app web → extension. Contrat et protections :
 * `packages/shared/src/extension-bridge.ts`.
 *
 * DEUX CONTEXTES L'INSTALLENT, et c'est voulu :
 *
 * - le **service worker**, parce qu'il est réveillé par l'événement — c'est lui
 *   qui couvre le cas courant, panneau fermé ;
 * - le **panneau**, quand il se trouve déjà ouvert. Chrome délivre
 *   `onMessageExternal` à tous les contextes qui écoutent, et le client du
 *   panneau est une instance distincte de celle du worker : sans écouteur ici,
 *   il resterait sur son écran de connexion jusqu'au prochain montage.
 *
 * Les deux appellent donc `setSession` avec les mêmes jetons, presque en même
 * temps. C'est idempotent **parce que la rotation des refresh tokens est
 * désactivée** (`apps/supabase/config.toml`) : deux échanges du même jeton y
 * sont sans conséquence. Réactiver la rotation casserait ceci en premier.
 *
 * La fonction vit dans son propre module plutôt que d'être recopiée des deux
 * côtés : elle porte un contrôle d'origine, et une vérification de sécurité en
 * double exemplaire est une vérification qui finit par diverger.
 */
export function listenForSharedSession(): () => void {
  const onExternal = (raw: unknown, sender: chrome.runtime.MessageSender): void => {
    if (!isConfigured) return;

    // `!==` sur l'origine ENTIÈRE, jamais un `startsWith` :
    // `https://penduline.polemil.dev` est un préfixe de
    // `https://penduline.polemil.dev.attaquant.example`.
    //
    // Redondant avec `externally_connectable` du manifeste, et gardé pour deux
    // raisons. D'abord parce qu'une vérification de sécurité qui repose sur un
    // fichier voisin est une vérification qu'un jour on déplacera sans la voir.
    // Ensuite parce que le manifeste est ÉLARGI À LA MAIN pendant le
    // développement (voir work/publication-extension.md, « Tester en local ») :
    // ce contrôle-ci suit `VITE_WEB_APP_URL`, donc un paquet construit pour la
    // production refuse un serveur local même si le manifeste l'autorisait.
    if (!sender.origin || sender.origin !== WEB_APP_ORIGIN) return;

    const msg = parseBridgeMessage(raw);
    if (!msg) return;

    void (async () => {
      if (msg.type === BRIDGE_SIGNOUT) {
        // `local` : l'app web vient de révoquer les jetons côté serveur, en
        // portée globale. Rappeler le serveur ne ferait qu'échouer en 403.
        await supabase.auth.signOut({ scope: 'local' });
        return;
      }

      const { error } = await supabase.auth.setSession({
        access_token: msg.access_token,
        refresh_token: msg.refresh_token,
      });
      // Muet côté utilisateur : personne n'a rien demandé ICI, et l'extension
      // reste parfaitement utilisable avec sa propre connexion.
      if (error) console.error('[penduline] session partagée', error.message);
    })();
  };

  // Optionnel dans la chaîne : le panneau est aussi ouvrable dans un onglet
  // normal pour l'aperçu, où les API `chrome` sont absentes (cf. `storage.ts`).
  chrome.runtime?.onMessageExternal?.addListener(onExternal);
  return () => chrome.runtime?.onMessageExternal?.removeListener(onExternal);
}
