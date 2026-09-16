import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * La feuille de styles est, comme le manifeste, une pièce dont la rupture est
 * SILENCIEUSE : `tsc` ne la lit pas, le build ne la valide pas, et aucun test de
 * rendu ne mesure une durée ni n'évalue une requête média. Trois conventions
 * durement acquises n'y tiennent aujourd'hui qu'à des commentaires.
 *
 * `mm-pinpulse` est la preuve vivante de cet angle mort : des images-clés
 * déclarées et utilisées zéro fois, survivantes de l'épinglage, que personne n'a
 * vues pendant des mois. Ce fichier transforme trois conventions écrites en trois
 * contraintes exécutables.
 *
 * ⚠️ Lu par `node:fs` et NON par `?raw`, contrairement à `pwa/manifest.test.ts`.
 * `?raw` fonctionne pour le manifeste mais renvoie une chaîne VIDE sur un `.css` :
 * le greffon CSS de Vite intercepte l'extension avant que la requête `?raw` ne
 * soit honorée, et le test passerait alors sur un fichier inexistant — c'est-à-dire
 * ne verrouillerait rien. Vérifié : `raw.length === 0`.
 */

const stylesRaw = readFileSync(fileURLToPath(new URL('./styles.css', import.meta.url)), 'utf8');

/** Retire les commentaires : ils parlent DE règles sans en être. */
const css = stylesRaw.replace(/\/\*[\s\S]*?\*\//g, '');

describe('styles.css', () => {
  /* ── Aucune animation morte (#91) ──────────────────────────────────────── */
  it("n'a pas d'images-clés déclarées mais inutilisées", () => {
    const declarees = [...css.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
    expect(declarees.length).toBeGreaterThan(0);

    const orphelines = declarees.filter((nom) => {
      // Un nom peut apparaître dans un raccourci `animation:` ou dans
      // `animation-name:`. On exclut la déclaration elle-même du décompte.
      const usages = [...css.matchAll(new RegExp(`\\b${nom}\\b`, 'g'))].length;
      return usages <= 1;
    });
    expect(orphelines).toEqual([]);
  });

  /* ── « Réduire les animations », couvert par un plancher (#91) ──────────── */
  it('honore `prefers-reduced-motion` par une règle globale et pas seulement au cas par cas', () => {
    // Le plancher : un sélecteur universel dans un bloc `prefers-reduced-motion`.
    const blocs = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g)];
    expect(blocs.length).toBeGreaterThan(0);

    const plancher = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*\s*,\s*\*::before\s*,\s*\*::after\s*\{[^}]*animation-duration:[^}]*transition-duration:[^}]*\}/;
    expect(css).toMatch(plancher);
  });

  /* ── Aucun survol non gardé (#90) ──────────────────────────────────────── */
  it('ne laisse aucune règle `:hover` hors de la garde `(hover: hover)`', () => {
    const lignes = css.split('\n');
    const horsGarde: string[] = [];
    let profondeur = 0;
    /** Profondeur à laquelle la garde a ouvert, ou 0 si l'on n'y est pas. */
    let garde = 0;

    for (const ligne of lignes) {
      if (ligne.includes('@media (hover: hover)')) garde = profondeur + 1;
      if (ligne.includes(':hover') && !ligne.includes('@media') && !garde) {
        horsGarde.push(ligne.trim());
      }
      profondeur += (ligne.match(/\{/g) ?? []).length - (ligne.match(/\}/g) ?? []).length;
      if (garde && profondeur < garde) garde = 0;
    }

    /* `a:hover` est la seule exception, et elle est documentée : un changement de
       couleur de lien ne se colle pas au doigt et ne se lit pas comme un état. */
    expect(horsGarde).toEqual(['a:hover { color: var(--color-accent-800); }']);
  });
});
