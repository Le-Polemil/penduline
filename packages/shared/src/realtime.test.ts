import { describe, expect, it } from 'vitest';
import { fusionner, identiques, retirer } from './realtime';

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
