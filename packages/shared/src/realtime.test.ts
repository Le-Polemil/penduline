import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeRealtime } from './realtime';
import {
  MAX_FILTRE_IN,
  fusionner,
  fusionnerMembre,
  fusionnerPlacement,
  identiques,
  memeJeu,
  retirer,
  retirerMembre,
  retirerPlacement,
  tranches,
} from './realtime';
import type { BoardMember, BoardPlacement } from './types';

/**
 * Ce que ces tests protègent, c'est **l'identité de référence** — pas le contenu
 * des listes.
 *
 * Rendre la même référence quand rien ne change est ce qui empêche React de
 * re-rendre, et donc ce qui garde texte ET focus dans un champ pendant qu'une
 * écriture distante arrive. Cette propriété était la conclusion la plus fine de
 * #39, et jusqu'ici elle n'était pas testable : la mécanique vivait dans un hook.
 * Une régression y serait invisible en test unitaire classique et se
 * manifesterait en production par un champ qui se vide sous les doigts.
 */

interface Ligne {
  id: string;
  titre: string;
  rang?: number;
}

const a: Ligne = { id: 'a', titre: 'Alpha' };
const b: Ligne = { id: 'b', titre: 'Beta' };

describe('identiques', () => {
  it('reconnaît deux lignes de mêmes valeurs', () => {
    expect(identiques({ id: 'a', titre: 'Alpha' }, { id: 'a', titre: 'Alpha' })).toBe(true);
  });

  it('détecte une seule valeur qui diffère', () => {
    expect(identiques({ id: 'a', titre: 'Alpha' }, { id: 'a', titre: 'Alpha bis' })).toBe(false);
  });

  it('distingue null de undefined — deux échéances différentes en base', () => {
    // `due_at` passe de `null` à une date, ou l'inverse : la comparaison stricte
    // doit trancher, sinon retirer une échéance ne se propagerait pas.
    expect(identiques({ id: 'a', due: null }, { id: 'a', due: undefined })).toBe(false);
  });

  it('ne compare QUE les clés de la ligne reçue', () => {
    // Comportement voulu et non accidentel : la ligne reçue par le canal fait
    // foi. Une clé présente seulement côté local — un champ dérivé — ne doit pas
    // faire croire à un changement à chaque événement.
    expect(identiques({ id: 'a', titre: 'Alpha', rang: 3 }, { id: 'a', titre: 'Alpha' })).toBe(true);
  });
});

describe('fusionner', () => {
  it('ajoute une ligne inconnue à la fin', () => {
    const avant = [a];
    const apres = fusionner(avant, b);
    expect(apres).toHaveLength(2);
    expect(apres[1]).toBe(b);
    expect(apres).not.toBe(avant);
  });

  it('rend LA MÊME référence quand la ligne reçue ne change rien', () => {
    // ⚠️ Le test central. C'est cette égalité de référence qui supprime le
    // scintillement et protège une saisie en cours.
    const avant = [a, b];
    expect(fusionner(avant, { id: 'a', titre: 'Alpha' })).toBe(avant);
  });

  it('remplace la ligne modifiée sans toucher aux références voisines', () => {
    const avant = [a, b];
    const apres = fusionner(avant, { id: 'a', titre: 'Alpha bis' });
    expect(apres).not.toBe(avant);
    expect(apres[0].titre).toBe('Alpha bis');
    // La voisine n'est pas recopiée : elle ne doit pas se re-rendre pour rien.
    expect(apres[1]).toBe(b);
  });

  it('remplace en place, sans réordonner', () => {
    // Le rang dans la liste porte du sens à l'affichage : une modification ne
    // doit pas faire sauter la ligne en fin de liste.
    const apres = fusionner([a, b], { id: 'a', titre: 'Alpha bis' });
    expect(apres.map((l) => l.id)).toEqual(['a', 'b']);
  });

  it('part d’une liste vide sans cas particulier', () => {
    expect(fusionner([], a)).toEqual([a]);
  });
});

describe('retirer', () => {
  it('rend LA MÊME référence quand l’identifiant est absent', () => {
    // Un DELETE reçu pour une ligne qu'on n'a jamais chargée est le cas NORMAL,
    // pas une anomalie : le panneau ne garde ni tâches cochées ni archivées. Il
    // ne doit provoquer aucun re-rendu.
    const avant = [a, b];
    expect(retirer(avant, 'zzz')).toBe(avant);
  });

  it('retire la ligne demandée et laisse les autres', () => {
    const apres = retirer([a, b], 'a');
    expect(apres).toHaveLength(1);
    expect(apres[0]).toBe(b);
  });

  it('supporte une liste vide', () => {
    const vide: Ligne[] = [];
    expect(retirer(vide, 'a')).toBe(vide);
  });
});


describe('tranches — le plafond de 100 du filtre `in`', () => {
  it('rend une seule tranche en dessous du plafond', () => {
    expect(tranches(['a', 'b', 'c'])).toEqual([['a', 'b', 'c']]);
  });

  it('découpe EXACTEMENT au plafond, et pas un de plus', () => {
    // ⚠️ Le test qui compte. Au-delà de 100 valeurs,
    // `realtime.subscription_check_filters` LÈVE et l'abonnement échoue en
    // ENTIER — plus aucun temps réel, pas seulement les matrices en trop.
    const ids = Array.from({ length: MAX_FILTRE_IN + 1 }, (_, i) => `b${i}`);
    const lots = tranches(ids);
    expect(lots).toHaveLength(2);
    expect(lots[0]).toHaveLength(MAX_FILTRE_IN);
    expect(lots[1]).toHaveLength(1);
    expect(lots.every((l) => l.length <= MAX_FILTRE_IN)).toBe(true);
  });

  it('rend une liste vide pour un jeu vide — aucun filtre `in.()` ne sera produit', () => {
    // `in.()` n'est pas un filtre valable. Le cas existe vraiment : un compte
    // neuf, une seconde avant son premier chargement.
    expect(tranches([])).toEqual([]);
  });
});

describe('memeJeu — ce qui justifie un réabonnement, et ce qui n’en justifie pas', () => {
  it('ignore l’ORDRE', () => {
    // `load` trie par position : déplacer une matrice dans un univers change
    // l'ordre sans rien changer à l'accès. Sans cette insensibilité, chaque
    // glisser-déposer rouvrirait un WebSocket ET déclencherait le rechargement
    // complet qui suit un réabonnement.
    expect(memeJeu(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true);
  });

  it('détecte une matrice qui ARRIVE', () => {
    expect(memeJeu(['a', 'b'], ['a', 'b', 'c'])).toBe(false);
  });

  it('détecte une matrice qui PART', () => {
    expect(memeJeu(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });

  it('deux jeux vides sont le même jeu', () => {
    expect(memeJeu([], [])).toBe(true);
  });
});

describe('placements — la clé est composée, il n’y a pas d’`id`', () => {
  const p = (board_id: string, position = 0): BoardPlacement => ({
    board_id,
    user_id: 'moi',
    universe_id: null,
    position,
  });

  it('ajoute un placement inconnu — une matrice vient d’être partagée', () => {
    const avant = [p('a')];
    const apres = fusionnerPlacement(avant, p('b'));
    expect(apres).toHaveLength(2);
    expect(apres).not.toBe(avant);
  });

  it('rend LA MÊME référence quand rien ne change', () => {
    const avant = [p('a'), p('b')];
    expect(fusionnerPlacement(avant, p('a'))).toBe(avant);
  });

  it('remplace le placement modifié — la matrice a changé d’univers', () => {
    const avant = [p('a'), p('b')];
    const apres = fusionnerPlacement(avant, { ...p('a'), universe_id: 'u1' });
    expect(apres).not.toBe(avant);
    expect(apres[0].universe_id).toBe('u1');
    expect(apres[1]).toBe(avant[1]);
  });

  it('retire par `board_id` — un accès vient d’être révoqué', () => {
    const avant = [p('a'), p('b')];
    expect(retirerPlacement(avant, 'a')).toEqual([p('b')]);
    expect(retirerPlacement(avant, 'inconnu')).toBe(avant);
  });
});

describe('adhésions — voir son rôle changer sans recharger', () => {
  const m = (board_id: string, role: 'lecture' | 'ecriture' = 'lecture'): BoardMember => ({
    board_id,
    user_id: 'moi',
    role,
    invited_by: 'elle',
    created_at: '2026-01-01T00:00:00.000Z',
  });

  it('promeut en place, sans toucher aux voisines', () => {
    // ⚠️ Le test qui compte. Sans cette propagation, un invité promu en écriture
    // continuerait de lire « Vous avez accès en lecture » sur des champs que la
    // base, elle, accepterait : un refus motivé mais FAUX.
    const avant = [m('a'), m('b')];
    const apres = fusionnerMembre(avant, m('a', 'ecriture'));
    expect(apres).not.toBe(avant);
    expect(apres[0].role).toBe('ecriture');
    expect(apres[1]).toBe(avant[1]);
  });

  it('rend LA MÊME référence quand rien ne change', () => {
    const avant = [m('a')];
    expect(fusionnerMembre(avant, m('a'))).toBe(avant);
  });

  it('retire sur les DEUX composantes de la clé', () => {
    // Une adhésion s'identifie par `(board_id, user_id)` : retirer sur la seule
    // matrice effacerait aussi celle d'un homonyme sur une autre ligne.
    const autre: BoardMember = { ...m('a'), user_id: 'elle' };
    const avant = [m('a'), autre];
    expect(retirerMembre(avant, 'a', 'moi')).toEqual([autre]);
    expect(retirerMembre(avant, 'a', 'inconnu')).toBe(avant);
  });
});

/**
 * Une doublure de client Supabase réduite à ce que `subscribeRealtime` touche :
 * ouvrir un canal, y accrocher des écoutes, s'abonner. L'état du canal et celui
 * du socket sont pilotés depuis le test — c'est tout l'objet.
 */
function fauxClient() {
  const canal = {
    state: 'closed' as string,
    on() {
      return canal;
    },
    subscribe(cb?: (statut: string) => void) {
      canal.state = 'joined';
      cb?.('SUBSCRIBED');
      return canal;
    },
  };
  const client = {
    channel: () => canal,
    removeChannel: () => Promise.resolve('ok'),
    realtime: { connecte: true, isConnected: () => client.realtime.connecte },
  };
  return { client: client as unknown as SupabaseClient, canal, socket: client.realtime };
}

const sinkNul = () => ({
  setTasks: () => {},
  setBoards: () => {},
  setUniverses: () => {},
  admits: () => true,
  reload: async () => {},
});

describe('vivant() — l’état RÉEL du flux, pas le dernier statut rapporté', () => {
  it('dit vrai quand le canal est joint et le socket connecté', () => {
    const { client } = fauxClient();
    const h = subscribeRealtime(client, 'moi', ['b1'], sinkNul);
    expect(h.vivant()).toBe(true);
  });

  it('⚠️ dit FAUX sur un socket mort, même après un SUBSCRIBED rapporté', () => {
    // LE TEST DE RÉGRESSION DU 28 SEPTEMBRE.
    //
    // Le panneau gardait un drapeau nourri par `onLive`. Sur un poste au repos,
    // le battement de cœur bridé cessait, le serveur fermait la connexion, et
    // AUCUN statut n'était rapporté : le drapeau restait `true`, et tous les
    // rattrapages — gardés par `if (live) return` — sortaient sans rien faire.
    //
    // On reproduit exactement ça : un `SUBSCRIBED` a bien été rapporté, puis le
    // socket meurt en silence. `onLive` n'en saura jamais rien ; `vivant()`, si.
    const { client, socket } = fauxClient();
    let dernierStatut: boolean | null = null;
    const h = subscribeRealtime(client, 'moi', ['b1'], sinkNul, {
      onLive: (l) => {
        dernierStatut = l;
      },
    });

    socket.connecte = false; // le socket meurt, sans fermeture propre

    expect(dernierStatut).toBe(true); // le drapeau ment, et c'est normal
    expect(h.vivant()).toBe(false); // l'interrogation, elle, ne ment pas
  });

  it('dit faux quand le canal est tombé en erreur', () => {
    const { client, canal } = fauxClient();
    const h = subscribeRealtime(client, 'moi', ['b1'], sinkNul);
    canal.state = 'errored';
    expect(h.vivant()).toBe(false);
  });

  it('dit faux sur un jeu de matrices vide — aucune table scopée abonnée', () => {
    // Un compte neuf, une seconde avant son premier chargement : le canal
    // s'ouvre quand même (universes et placements y sont abonnés), donc il est
    // vivant. Le test fixe le comportement plutôt que de le laisser au hasard.
    const { client, canal } = fauxClient();
    const h = subscribeRealtime(client, 'moi', [], sinkNul);
    expect(h.vivant()).toBe(true);
    canal.state = 'closed';
    expect(h.vivant()).toBe(false);
  });
});