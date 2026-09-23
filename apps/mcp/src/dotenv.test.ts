import { describe, expect, it } from 'vitest';
import { analyseEnv, chargeEnvFile } from './dotenv';

describe('analyseEnv', () => {
  it('lit des paires simples', () => {
    expect(analyseEnv('A=1\nB=deux')).toEqual({ A: '1', B: 'deux' });
  });

  it('ignore les lignes vides et les commentaires', () => {
    expect(analyseEnv('# un mot\n\nA=1\n   # encore\n')).toEqual({ A: '1' });
  });

  it('retire les guillemets, mais pas ceux du milieu', () => {
    expect(analyseEnv(`A="un deux"\nB='trois'\nC=qu"atre`)).toEqual({
      A: 'un deux',
      B: 'trois',
      C: 'qu"atre',
    });
  });

  it('garde les `=` de la valeur — un JWT en contient', () => {
    expect(analyseEnv('JWT=aaa=bbb=')).toEqual({ JWT: 'aaa=bbb=' });
  });

  it('tolère le préfixe `export`', () => {
    expect(analyseEnv('export A=1')).toEqual({ A: '1' });
  });

  it('ignore une ligne sans `=` ou commençant par `=`', () => {
    expect(analyseEnv('bruit\n=vide\nA=1')).toEqual({ A: '1' });
  });
});

describe('chargeEnvFile', () => {
  it('ne fait rien si le fichier est absent — le cas normal en production', () => {
    const cible: Record<string, string | undefined> = { A: 'déjà' };
    chargeEnvFile('/chemin/qui/nexiste/pas/.env', cible);
    expect(cible).toEqual({ A: 'déjà' });
  });

  it("ne remplit QUE ce qui manque : l'environnement réel gagne toujours", () => {
    // Le fichier de ce dépôt sert de matière : il existe et porte des clés.
    const cible: Record<string, string | undefined> = {};
    chargeEnvFile(new URL('../../../.env.example', import.meta.url).pathname, cible);
    expect(cible.VITE_SUPABASE_URL).toBeTruthy();

    const posee = { VITE_SUPABASE_URL: 'https://pose-a-la-main.test' };
    chargeEnvFile(new URL('../../../.env.example', import.meta.url).pathname, posee);
    expect(posee.VITE_SUPABASE_URL).toBe('https://pose-a-la-main.test');
  });
});
