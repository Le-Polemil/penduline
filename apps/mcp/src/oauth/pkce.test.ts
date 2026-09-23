import { describe, expect, it } from 'vitest';
import { defi, verifiePkce } from './pkce';

/** Le vecteur de test de la RFC 7636 §4.6, recopié tel quel. */
const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const DEFI = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

describe('PKCE S256', () => {
  it('reproduit le vecteur de test de la RFC', () => {
    expect(defi(VERIFIER)).toBe(DEFI);
  });

  it('accepte le vérifieur qui a servi à fabriquer le défi', () => {
    expect(verifiePkce(DEFI, VERIFIER)).toBe(true);
  });

  it('refuse un AUTRE vérifieur — c’est tout l’objet de PKCE', () => {
    expect(verifiePkce(DEFI, 'x'.repeat(43))).toBe(false);
  });

  it('refuse un vérifieur absent', () => {
    expect(verifiePkce(DEFI, undefined)).toBe(false);
  });

  it('refuse un vérifieur hors des bornes de la RFC (43 à 128)', () => {
    const court = 'a'.repeat(42);
    const long = 'a'.repeat(129);
    expect(verifiePkce(defi(court), court)).toBe(false);
    expect(verifiePkce(defi(long), long)).toBe(false);
  });

  it('refuse un défi vide plutôt que de tout accepter', () => {
    expect(verifiePkce('', VERIFIER)).toBe(false);
  });
});
