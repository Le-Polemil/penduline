import { describe, expect, it } from 'vitest';
import { readAuthorizeRequest } from './mcp';

const loc = (pathname: string, search = '') => ({ pathname, search });

describe('readAuthorizeRequest', () => {
  it('lit la demande sur /autoriser', () => {
    expect(readAuthorizeRequest(loc('/autoriser', '?demande=abc-123'))).toBe('abc-123');
  });

  it('ignore toute autre route — y compris avec le paramètre', () => {
    expect(readAuthorizeRequest(loc('/', '?demande=abc'))).toBeNull();
    expect(readAuthorizeRequest(loc('/autoriser/plus', '?demande=abc'))).toBeNull();
  });

  it('refuse une demande absente ou vide', () => {
    // Sans ça, `/autoriser?demande=` afficherait un écran qui ne mène nulle part.
    expect(readAuthorizeRequest(loc('/autoriser'))).toBeNull();
    expect(readAuthorizeRequest(loc('/autoriser', '?demande='))).toBeNull();
  });

  it('ne se laisse pas troubler par les autres paramètres', () => {
    expect(readAuthorizeRequest(loc('/autoriser', '?autre=1&demande=xyz&encore=2'))).toBe('xyz');
  });
});
