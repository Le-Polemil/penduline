import { describe, expect, it } from 'vitest';
import { classifyWriteFailure } from './write';

/**
 * Ce que ces tests protègent, ce n'est pas le libellé des messages — c'est le
 * champ `retryable`. Proposer « Réessayer » sur un refus de policy fait tourner
 * l'utilisateur en rond ; l'omettre sur une coupure réseau lui fait perdre son
 * geste. Les deux régressions sont silencieuses en production.
 *
 * Les couples (status, code) reproduits ici sont ceux que `postgrest-js` émet
 * réellement (2.110.8, `dist/index.mjs:326-368`).
 */
describe('classifyWriteFailure', () => {
  it('traite un status 0 comme une coupure réseau, rejouable', () => {
    // postgrest-js convertit l'échec de `fetch` en erreur sans code.
    const f = classifyWriteFailure({ code: '', message: 'TypeError: Failed to fetch' }, 0, 'Renommer la matrice');
    expect(f.kind).toBe('offline');
    expect(f.retryable).toBe(true);
    expect(f.message).toContain('« Renommer la matrice »');
  });

  it('traite un 401 comme une session expirée, non rejouable', () => {
    const f = classifyWriteFailure({ code: 'PGRST301', message: 'JWT expired' }, 401, 'Cocher la tâche');
    expect(f.kind).toBe('session');
    expect(f.retryable).toBe(false);
  });

  it('reconnaît la famille PGRST3xx même sans 401', () => {
    // Un proxy peut réécrire le statut ; le code reste la signature fiable.
    expect(classifyWriteFailure({ code: 'PGRST303' }, 500, 'Cocher la tâche').kind).toBe('session');
  });

  it('traite un 403 comme un refus, jamais rejouable', () => {
    const f = classifyWriteFailure({ code: '42501', message: 'new row violates row-level security policy' }, 403, 'Supprimer la matrice');
    expect(f.kind).toBe('denied');
    expect(f.retryable).toBe(false);
  });

  it('reconnaît le 42501 de PostgreSQL même sans 403', () => {
    expect(classifyWriteFailure({ code: '42501' }, 400, 'Supprimer la matrice').retryable).toBe(false);
  });

  it('range tout le reste en inconnu rejouable', () => {
    // Un 5xx ou une contrainte violée : on ne sait pas, donc on laisse une chance.
    expect(classifyWriteFailure({ code: '23505' }, 409, 'Créer la matrice').kind).toBe('unknown');
    expect(classifyWriteFailure(null, 500, 'Créer la matrice').retryable).toBe(true);
  });

  it('accepte une erreur absente', () => {
    // `error: null` avec `data: null` arrive sur les chemins qui exigent une ligne
    // en retour : il n'y a pas d'erreur à classer, mais il faut un message.
    const f = classifyWriteFailure(null, 200, 'Créer la tâche');
    expect(f.kind).toBe('unknown');
    expect(f.message).toContain('« Créer la tâche »');
  });
});
