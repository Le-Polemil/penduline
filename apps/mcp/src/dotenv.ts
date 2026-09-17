import { readFileSync } from 'node:fs';

/**
 * Le `.env` de la racine, lu au démarrage — comme le font déjà l'app web et
 * l'extension par l'`envDir` commun de Vite.
 *
 * Sans lui, `apps/mcp` était le SEUL workspace à exiger six variables recopiées
 * sur la ligne de commande à chaque `npm run dev`. Le reste du dépôt marche
 * depuis un fichier ; il n'y avait aucune raison que celui-ci fasse exception.
 *
 * ⚠️ **L'environnement réel gagne TOUJOURS.** On ne remplit que ce qui manque.
 * `process.loadEnvFile()` de Node ferait l'inverse — il écrase — et un `.env`
 * oublié dans une image écraserait alors les variables posées par Coolify, en
 * silence et avec les valeurs d'une machine de développement.
 *
 * Analyseur volontairement minimal : `CLÉ=valeur`, guillemets optionnels,
 * `#` en commentaire. Pas d'interpolation, pas de multi-lignes — un `.env` qui
 * en aurait besoin serait un fichier de configuration déguisé.
 */
export function analyseEnv(contenu: string): Record<string, string> {
  const lu: Record<string, string> = {};
  for (const brute of contenu.split('\n')) {
    const ligne = brute.trim();
    if (!ligne || ligne.startsWith('#')) continue;

    const coupe = ligne.indexOf('=');
    if (coupe <= 0) continue;

    const cle = ligne.slice(0, coupe).trim().replace(/^export\s+/, '');
    let valeur = ligne.slice(coupe + 1).trim();
    if (
      (valeur.startsWith('"') && valeur.endsWith('"') && valeur.length >= 2) ||
      (valeur.startsWith("'") && valeur.endsWith("'") && valeur.length >= 2)
    ) {
      valeur = valeur.slice(1, -1);
    }
    lu[cle] = valeur;
  }
  return lu;
}

/**
 * Remplit `cible` avec ce que le fichier apporte ET qui manque encore.
 *
 * Un fichier absent n'est pas une erreur : c'est le cas normal en production,
 * où tout vient de l'environnement du conteneur.
 */
export function chargeEnvFile(chemin: string, cible: Record<string, string | undefined>): void {
  let contenu: string;
  try {
    contenu = readFileSync(chemin, 'utf8');
  } catch {
    return;
  }
  for (const [cle, valeur] of Object.entries(analyseEnv(contenu))) {
    cible[cle] ??= valeur;
  }
}
