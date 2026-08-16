import { defineConfig } from 'vitest/config';

/**
 * Configuration Vitest commune aux workspaces.
 *
 * Elle vit à la racine et non dans `packages/shared` : une base partagée ne doit
 * pas appartenir à l'un de ses consommateurs. Le jour où l'app web voudra tester
 * sa logique non-React, elle n'aura pas à importer un fichier depuis un paquet
 * qui n'a rien à voir avec elle.
 */
export default defineConfig({
  test: {
    // `node` et non `jsdom` : ce qu'on teste ici est de la logique pure. Imposer
    // un environnement de navigateur ferait payer un DOM complet à des tests qui
    // n'en ont aucun usage. Web et extension pourront le surcharger.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Un workspace qui déclare un script `test` mais n'a aucun test est une
    // erreur de configuration, pas un succès.
    passWithNoTests: false,
  },
});
