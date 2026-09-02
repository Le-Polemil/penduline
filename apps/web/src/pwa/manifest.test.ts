import { describe, expect, it } from 'vitest';
import manifestRaw from '../../public/manifest.webmanifest?raw';

/**
 * Le manifeste est la seule pièce de l'app dont la rupture est totalement silencieuse :
 * un JSON invalide, un champ manquant ou une icône renommée ne font échouer ni `tsc`, ni
 * le build, ni le rendu. L'app cesse simplement d'être installable, et personne ne le
 * voit avant qu'un utilisateur ne le signale.
 *
 * Les fichiers sont lus par les mécanismes de Vite (`?raw`, `import.meta.glob`) plutôt
 * que par `node:fs` : cela évite d'ajouter `@types/node` aux dépendances de l'app web
 * pour un seul test.
 */

type Icon = { src: string; sizes: string; type: string; purpose: string };
type Manifest = {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  theme_color: string;
  background_color: string;
  icons: Icon[];
};

// Les clés sont les chemins relatifs des fichiers réellement présents dans `public/`.
const publicFiles = new Set(
  Object.keys(import.meta.glob('../../public/**/*')).map((path) =>
    path.replace('../../public', ''),
  ),
);

describe('manifest.webmanifest', () => {
  const manifest = JSON.parse(manifestRaw) as Manifest;

  it('est un JSON valide', () => {
    expect(manifest).toBeTypeOf('object');
  });

  describe('critères d’installabilité', () => {
    // Sans l'un de ces quatre champs, aucun navigateur ne propose l'installation.
    it('déclare un nom, un nom court, une portée et une URL de départ', () => {
      expect(manifest.name).toBeTruthy();
      expect(manifest.short_name).toBeTruthy();
      expect(manifest.start_url).toBe('/');
      expect(manifest.scope).toBe('/');
    });

    // `browser` (la valeur par défaut) laisserait la barre d'adresse : l'app serait
    // installable et ressemblerait toujours à un onglet.
    it('s’ouvre en mode autonome', () => {
      expect(manifest.display).toBe('standalone');
    });

    // Chrome exige ces deux tailles précises.
    it('fournit une icône 192 et une icône 512', () => {
      const sizes = manifest.icons.map((icon) => icon.sizes);
      expect(sizes).toContain('192x192');
      expect(sizes).toContain('512x512');
    });

    // Le décodeur d'icônes de manifeste de Chrome ne gère pas le SVG : déclaré ici, il
    // remonte « Icon failed to load » dans DevTools et peut faire échouer l'installation
    // (chromium 40925759). Le `<link rel="icon">` d'index.html, lui, sert bien le SVG.
    it('ne déclare aucune icône SVG', () => {
      const svg = manifest.icons.filter((icon) => icon.type === 'image/svg+xml');
      expect(svg).toEqual([]);
    });

    // Sans variante masquée, Android rogne l'icône dans un cercle et décapite le nid.
    //
    // Les fichiers `maskable` respectent la zone de sécurité des icônes adaptatives :
    // l'art est réduit aux **2/3 centraux** du canevas (72 dp visibles sur 108 dp) et
    // posé sur un fond opaque `#f5ead8`, là où les `any` sont transparents avec l'art
    // à pleine hauteur. Toute nouvelle taille doit reprendre cette géométrie, sinon
    // l'icône change d'aspect d'une densité d'écran à l'autre.
    it('fournit une variante masquée', () => {
      const maskable = manifest.icons.filter((icon) => icon.purpose === 'maskable');
      expect(maskable.map((icon) => icon.sizes)).toEqual(
        expect.arrayContaining(['192x192', '512x512', '1024x1024']),
      );
    });

    // Le 1024 n'est pas du zèle : c'est ce qui rend le splash net. Google forge un
    // WebAPK à l'installation et y grave une icône adaptative dérivée du `maskable`,
    // dont seuls les 2/3 centraux sont visibles — sur un 512, il ne reste que ~341 px
    // d'art. Le splash Android 12+ les dessine à ~160 dp, soit 480 px sur un écran à
    // DPR 3 : un agrandissement de 1,4× qui fait baver les aplats. Le 1024 double la
    // source et absorbe l'agrandissement.
    //
    // Corollaire : le WebAPK est gravé une fois pour toutes. Vérifier le correctif
    // demande de désinstaller puis réinstaller l'app — modifier ce manifeste ne
    // touche pas l'icône déjà posée sur l'écran d'accueil.
    it('fournit une source 1024 dans les deux variantes', () => {
      const sizes1024 = manifest.icons.filter((icon) => icon.sizes === '1024x1024');
      expect(sizes1024.map((icon) => icon.purpose).sort()).toEqual(['any', 'maskable']);
    });
  });

  // Le cas de rupture le plus probable : renommer ou déplacer un fichier de `public/`
  // sans toucher au manifeste.
  it('ne référence que des icônes présentes dans public/', () => {
    const missing = manifest.icons
      .map((icon) => icon.src)
      .filter((src) => !publicFiles.has(src));

    expect(missing).toEqual([]);
  });

  // Une divergence produirait un flash d'une autre couleur au lancement, à l'endroit le
  // plus visible du parcours. `--color-bg` dans src/styles.css et le `<meta name=
  // "theme-color">` d'index.html portent la même valeur.
  it('reprend la couleur de fond de l’app', () => {
    expect(manifest.theme_color).toBe('#f5ead8');
    expect(manifest.background_color).toBe('#f5ead8');
  });
});
