import { describe, expect, it } from 'vitest';
import { createStore } from './store';

/** Une horloge qu'on avance à la main, comme `p_now` dans `penduline_tick()`. */
function horloge(depart = 1_700_000_000_000) {
  let t = depart;
  return { now: () => t, avance: (ms: number) => (t += ms) };
}

const demandeType = {
  clientId: 'c1',
  clientName: 'Claude',
  redirectUri: 'https://claude.ai/cb',
  codeChallenge: 'defi',
  state: 'abc',
};

const codeType = {
  userId: 'u1',
  grantId: 'g1',
  clientId: 'c1',
  redirectUri: 'https://claude.ai/cb',
  codeChallenge: 'defi',
};

describe('demandes en attente', () => {
  it('se relisent tant qu’elles vivent', () => {
    const store = createStore();
    const { id } = store.ouvrirDemande(demandeType);
    expect(store.lireDemande(id)?.clientName).toBe('Claude');
  });

  it('ne se tranchent qu’UNE fois', () => {
    const store = createStore();
    const { id } = store.ouvrirDemande(demandeType);
    expect(store.consommerDemande(id)).toBeDefined();
    expect(store.consommerDemande(id)).toBeUndefined();
  });

  it('expirent au bout de dix minutes', () => {
    const h = horloge();
    const store = createStore(h.now);
    const { id } = store.ouvrirDemande(demandeType);

    h.avance(10 * 60 * 1000 - 1);
    expect(store.lireDemande(id)).toBeDefined();
    h.avance(2);
    expect(store.lireDemande(id)).toBeUndefined();
    expect(store.consommerDemande(id)).toBeUndefined();
  });
});

describe("codes d'autorisation", () => {
  it('sont imprévisibles et distincts', () => {
    const store = createStore();
    const a = store.emettreCode(codeType).code;
    const b = store.emettreCode(codeType).code;
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43);
  });

  it('ne servent qu’une fois — un code rejoué ne donne RIEN', () => {
    const store = createStore();
    const { code } = store.emettreCode(codeType);
    expect(store.consommerCode(code)?.userId).toBe('u1');
    expect(store.consommerCode(code)).toBeUndefined();
  });

  it('expirent au bout de deux minutes', () => {
    const h = horloge();
    const store = createStore(h.now);
    const { code } = store.emettreCode(codeType);

    h.avance(2 * 60 * 1000 + 1);
    expect(store.consommerCode(code)).toBeUndefined();
  });
});
