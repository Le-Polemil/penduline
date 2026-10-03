/**
 * Régénère les icônes matricielles depuis un tracé vectoriel.
 *
 * ⚠️ C'EST LE SUJET DE L'ISSUE #151, et le script compte plus que les fichiers
 * qu'il produit. La PR #143 a fait pencher le col du nid de 8° dans les trois
 * fichiers qui portent un tracé, et aucun des onze PNG dérivés n'a suivi : le
 * dessin était incohérent avec lui-même en production, et personne ne pouvait
 * le voir sans comparer onze fichiers à la main. Sans ce script, la prochaine
 * retouche reproduira exactement la même chose.
 *
 * Rasteriseur : `@resvg/resvg-js`, pur Rust, sans dépendance système — ni
 * ImageMagick, ni Inkscape, ni cairo à installer. C'est ce qui rend la commande
 * reproductible sur une machine neuve, et c'est pour ça qu'on n'est pas passé
 * par `npx` (cf. l'issue : « il faut passer par npx, donc une installation
 * réseau »).
 *
 * Usage : `npm run icons`
 */
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = new URL('..', import.meta.url);
const chemin = (p) => fileURLToPath(new URL(p, racine));

/**
 * Ce qu'on régénère, et depuis quoi.
 *
 * ⚠️ LES ICÔNES PWA NE SONT PAS LÀ, ET C'EST VOULU. `apps/web/public/icon.svg`
 * porte le nid plein, un dessin plus ancien que la marque de l'en-tête ; le
 * vecteur de cette marque (`logo.svg`) a été obtenu par vectorisation et ne
 * tient qu'en petite taille. Les aligner demande un vecteur propre — et tant
 * qu'on ne l'a pas, régénérer les 192/512/1024 depuis un tracé approximatif
 * serait reculer. Le jour où il arrive : une entrée de plus ci-dessous.
 */
const LOTS = [
  {
    source: 'apps/web/public/logo.svg',
    /** Transparent : une icône de barre d'outils se pose sur le thème du navigateur. */
    fond: null,
    sorties: [
      ['apps/extension/public/icon16.png', 16],
      ['apps/extension/public/icon32.png', 32],
      ['apps/extension/public/icon48.png', 48],
      ['apps/extension/public/icon128.png', 128],
    ],
  },
];

for (const lot of LOTS) {
  const svg = readFileSync(chemin(lot.source), 'utf8');
  for (const [sortie, taille] of lot.sorties) {
    const resvg = new Resvg(svg, {
      // `width` ET non `zoom` : le rendu part du tracé, pas d'un agrandissement
      // de l'étape précédente, donc chaque taille est nette pour elle-même.
      fitTo: { mode: 'width', value: taille },
      background: lot.fond ?? undefined,
    });
    writeFileSync(chemin(sortie), resvg.render().asPng());
    console.log(`✓ ${sortie} — ${taille}px`);
  }
}
