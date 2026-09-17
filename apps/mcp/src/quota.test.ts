import { describe, expect, it } from 'vitest';
import { QuotaError, createQuota } from './quota';
import { envDeTest } from './test-doubles';

const env = { ...envDeTest, MCP_QUOTA_CALLS_PER_MINUTE: 3, MCP_QUOTA_WRITES_PER_DAY: 2 };

function horloge(depart = 1_700_000_000_000) {
  let t = depart;
  return { now: () => t, avance: (ms: number) => (t += ms) };
}

describe('appels par minute', () => {
  it('laisse passer jusqu’à la limite, puis refuse', () => {
    const quota = createQuota(env, horloge().now);

    for (const _ of [1, 2, 3]) quota.verifieAppel('g1');
    expect(() => quota.verifieAppel('g1')).toThrow(QuotaError);
  });

  it('libère une place à mesure que la fenêtre GLISSE, pas d’un coup', () => {
    const h = horloge();
    const quota = createQuota(env, h.now);

    quota.verifieAppel('g1');
    h.avance(20_000);
    quota.verifieAppel('g1');
    h.avance(20_000);
    quota.verifieAppel('g1');
    expect(() => quota.verifieAppel('g1')).toThrow(QuotaError);

    // Le premier appel sort de la fenêtre : une place, et une seule.
    h.avance(20_001);
    quota.verifieAppel('g1');
    expect(() => quota.verifieAppel('g1')).toThrow(QuotaError);
  });

  it('dit combien de temps attendre', () => {
    const h = horloge();
    const quota = createQuota(env, h.now);

    for (const _ of [1, 2, 3]) quota.verifieAppel('g1');
    h.avance(45_000);

    try {
      quota.verifieAppel('g1');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(QuotaError);
      expect((e as QuotaError).retryAfter).toBe(15);
    }
  });

  it('compte par AUTORISATION : une application emballée ne coupe pas les autres', () => {
    const quota = createQuota(env, horloge().now);

    for (const _ of [1, 2, 3]) quota.verifieAppel('g1');
    expect(() => quota.verifieAppel('g1')).toThrow(QuotaError);
    expect(() => quota.verifieAppel('g2')).not.toThrow();
  });
});

describe('écritures par jour', () => {
  it('a son propre compteur, indépendant des appels', () => {
    const quota = createQuota(env, horloge().now);

    quota.verifieAppel('g1');
    quota.verifieEcriture('g1');
    quota.verifieEcriture('g1');
    expect(() => quota.verifieEcriture('g1')).toThrow(/écritures par jour/);
    // Le compteur d'appels, lui, a encore de la marge.
    expect(() => quota.verifieAppel('g1')).not.toThrow();
  });

  it('se libère au bout de 24 h, pas au changement de date', () => {
    const h = horloge();
    const quota = createQuota(env, h.now);

    quota.verifieEcriture('g1');
    quota.verifieEcriture('g1');
    h.avance(24 * 60 * 60 * 1000 + 1);
    expect(() => quota.verifieEcriture('g1')).not.toThrow();
  });
});
