import { describe, expect, it } from 'vitest';
import {
  BRIDGE_SIGNIN,
  BRIDGE_SIGNOUT,
  parseBridgeMessage,
} from './extension-bridge';

/**
 * Ce que ces tests protègent : `parseBridgeMessage` est le SEUL filtre entre une
 * page web et `supabase.auth.setSession()` de l'extension. Le typage TypeScript
 * n'y peut rien — `chrome.runtime` transporte du JSON arbitraire, et le contrôle
 * d'origine du récepteur (`session-bridge.ts`) dit d'où vient le message, pas ce
 * qu'il contient.
 *
 * Les deux régressions à empêcher sont silencieuses en production :
 * - laisser passer une chaîne vide détruirait la session en place ;
 * - laisser passer une forme inconnue ferait échouer `setSession` sans que rien
 *   ne le dise à l'utilisateur, qui verrait juste l'extension rester déconnectée.
 */
describe('parseBridgeMessage', () => {
  const valide = {
    type: BRIDGE_SIGNIN,
    access_token: 'eyJhbGciOi.access',
    refresh_token: 'v1.refresh',
  };

  it('accepte une connexion complète et ne retient QUE les deux jetons', () => {
    const msg = parseBridgeMessage({ ...valide, user: { id: 'u1' }, expires_in: 3600 });
    // La session entière ne doit pas transiter : le récepteur n'en a pas l'usage,
    // et un objet large invite à s'en servir comme source de vérité.
    expect(msg).toEqual(valide);
  });

  it('accepte une déconnexion, qui ne porte aucun jeton', () => {
    expect(parseBridgeMessage({ type: BRIDGE_SIGNOUT })).toEqual({ type: BRIDGE_SIGNOUT });
  });

  it('refuse un jeton vide plutôt que de le transmettre', () => {
    // `setSession('')` ne lève pas : il écrase la session existante. C'est le cas
    // le plus dangereux du lot, et le moins visible.
    expect(parseBridgeMessage({ ...valide, access_token: '' })).toBeNull();
    expect(parseBridgeMessage({ ...valide, refresh_token: '' })).toBeNull();
  });

  it('refuse un jeton absent ou d’un autre type', () => {
    expect(parseBridgeMessage({ type: BRIDGE_SIGNIN, refresh_token: 'r' })).toBeNull();
    expect(parseBridgeMessage({ ...valide, access_token: 42 })).toBeNull();
    expect(parseBridgeMessage({ ...valide, refresh_token: null })).toBeNull();
  });

  it('refuse tout ce qui ne porte pas un type connu', () => {
    // Le préfixe `penduline:` existe pour ça : `chrome.runtime` est partagé avec
    // tout ce que la page peut vouloir envoyer à d'autres extensions.
    expect(parseBridgeMessage({ type: 'boards', boards: [] })).toBeNull();
    expect(parseBridgeMessage({ type: 'session' })).toBeNull();
    expect(parseBridgeMessage({})).toBeNull();
  });

  it('encaisse une entrée qui n’est pas un objet', () => {
    // Une page peut émettre n'importe quoi ; aucun de ces cas ne doit lever.
    for (const raw of [null, undefined, 'penduline:session', 0, [], true]) {
      expect(parseBridgeMessage(raw)).toBeNull();
    }
  });
});
