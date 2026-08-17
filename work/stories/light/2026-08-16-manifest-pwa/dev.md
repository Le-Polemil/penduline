---
story: "Manifest PWA : rendre l'app installable"
story_code: "manifest-pwa"
issues: [41]
created: 2026-08-16
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Générer le jeu d'icônes PNG (192/512, any + maskable) depuis `icon.svg` | Terminé | 2026-08-16 |
| 2. Créer `apps/web/public/manifest.webmanifest` | Terminé | 2026-08-16 |
| 3. Créer `apps/web/public/sw.js` (service worker minimal, sans cache) | Terminé | 2026-08-16 |
| 4. Enregistrer le service worker dans `apps/web/src/main.tsx` | Terminé | 2026-08-16 |
| 5. Lier le manifeste depuis `apps/web/index.html` | Terminé | 2026-08-16 |
| 6. `apps/web/nginx.conf` : MIME `.webmanifest` + `no-cache` sur `sw.js` | Terminé | 2026-08-16 |
| 7. Test de non-régression du manifeste (Vitest sur `apps/web`) | Terminé | 2026-08-16 |
| 8. Vérifications qualité (typecheck / test / build) et contrôle DevTools | Terminé | 2026-08-16 |
| 9. Retirer l'icône SVG du manifeste (remontée par la validation manuelle) | Terminé | 2026-08-16 |
| 10. Captures `screenshots` pour la richer install UI | En attente | |

## Journal

### 2026-08-16 : Jeu d'icônes PNG

**Statut** : Terminé

**Actions réalisées** :
- Rasterisation de `icon.svg` en `icon-192.png` et `icon-512.png` (fond transparent,
  `purpose: any`) avec `sips`.
- Écriture d'un SVG intermédiaire pour la variante masquée : `<rect>` plein `#f5ead8`
  plus le nid réduit à 340/512 (66 %) et centré, puis rasterisation en
  `icon-maskable-192.png` et `icon-maskable-512.png`.
- Contrôle visuel du rendu 512 : le nid tient largement dans la zone sûre d'Android
  (cercle de 80 % du côté), point le plus éloigné du centre à ~170 px pour un rayon
  sûr de 205 px.

**Fichiers modifiés** :
- `apps/web/public/icon-192.png` (nouveau)
- `apps/web/public/icon-512.png` (nouveau)
- `apps/web/public/icon-maskable-192.png` (nouveau)
- `apps/web/public/icon-maskable-512.png` (nouveau)

**Notes** — recette reproductible. `sips` (macOS, déjà installé) est le seul outil de
rasterisation disponible sur la machine : ni ImageMagick, ni `rsvg-convert`, ni `sharp`.
Il ne sait en revanche ni composer un fond ni ajouter une marge, d'où le SVG intermédiaire.

```sh
# variantes « any », depuis le SVG d'origine
sips -s format png --resampleHeightWidth 512 512 apps/web/public/icon.svg \
     --out apps/web/public/icon-512.png
sips -s format png --resampleHeightWidth 192 192 apps/web/public/icon.svg \
     --out apps/web/public/icon-192.png

# variantes « maskable », depuis le SVG intermédiaire (fond + nid à 66 %)
sips -s format png --resampleHeightWidth 512 512 icon-maskable.svg \
     --out apps/web/public/icon-maskable-512.png
sips -s format png --resampleHeightWidth 192 192 icon-maskable.svg \
     --out apps/web/public/icon-maskable-192.png
```

Le SVG intermédiaire applique aux tracés d'origine
`translate(40.859, 64.870) scale(3.84181)` — soit le viewBox `11.75 5.5 88.5 88.5` mappé
sur un carré de 340 px centré dans 512. Pas de `<svg>` imbriqué, dont le support par le
rasteriseur CoreGraphics de `sips` n'est pas garanti.

Aucun script commité : `sips` est macOS-only et ferait un outil de build inutilisable en
CI ou pour un contributeur Linux. Les PNG sont commités, comme le sont déjà
`apple-touch-icon.png` et les icônes de l'extension.

### 2026-08-16 : Manifeste

**Statut** : Terminé

**Actions réalisées** :
- `manifest.webmanifest` : identité (`id`, `name`, `short_name`, `description`, `lang`),
  portée (`start_url: /`, `scope: /`), `display: standalone`, `theme_color` et
  `background_color` à `#f5ead8`, `categories: ["productivity"]`.
- Cinq icônes déclarées : le SVG en `sizes: "any"`, puis les deux PNG `any` et les deux
  PNG `maskable`.

**Fichiers modifiés** :
- `apps/web/public/manifest.webmanifest` (nouveau)

**Notes** : le format JSON n'accepte pas de commentaire, donc le « pourquoi » des valeurs
(alignement de `theme_color` sur `--color-bg`, absence de `screenshots`) vit dans
`context.md` et non dans le fichier. `description` reprend en plus court celle du
`package.json` racine.

### 2026-08-16 : Service worker minimal

**Statut** : Terminé

**Actions réalisées** :
- `public/sw.js` en JavaScript brut — Vite copie `public/` verbatim, le fichier est donc
  servi à `/sw.js`, avec le scope `/` qu'il lui faut. Une quinzaine de lignes ne justifie
  pas une seconde entrée de build TypeScript.
- `install` → `skipWaiting()`, `activate` → `clients.claim()`.
- `fetch` → `respondWith(fetch(request))` sur les seules navigations.
- En-tête de fichier expliquant pourquoi il existe et pourquoi il ne cache rien.

**Fichiers modifiés** :
- `apps/web/public/sw.js` (nouveau)

**Notes** — deux pièges évités, tous deux dictés par le comportement de Chrome plutôt que
par un besoin fonctionnel :

1. **Corps de handler vide.** Chrome détecte les handlers `fetch` no-op et les ignore
   (optimisation « skip no-op fetch handler »), ce qui aurait annulé le seul effet
   recherché. D'où un `respondWith` réel, sous condition.
2. **Portée du passe-plat.** Un `respondWith` inconditionnel ferait transiter tout le
   trafic Supabase par le service worker pour rien. La condition
   `request.mode === 'navigate'` limite le passage aux navigations.

Si l'invite Android ne se déclenche pas au test sur appareil réel, le repli documenté est
de passer le `respondWith` sur toutes les requêtes.

### 2026-08-16 : Enregistrement et déclaration

**Statut** : Terminé

**Actions réalisées** :
- `main.tsx` : enregistrement de `/sw.js` après le `createRoot`, gardé par
  `import.meta.env.PROD && 'serviceWorker' in navigator`, sur l'évènement `load`.
- `index.html` : `<link rel="manifest" href="/manifest.webmanifest" />` ajouté à la suite
  des `<link rel="icon">` existants.

**Fichiers modifiés** :
- `apps/web/src/main.tsx`
- `apps/web/index.html`

**Notes** : `import.meta.env.PROD` n'est pas de la prudence de principe — en dev, un
service worker s'interpose entre Vite et la page et perturbe le HMR. `vite preview` sert
le build de prod, donc la vérification locale reste possible. L'échec d'enregistrement est
avalé volontairement : ne pas être installable ne justifie pas de polluer la console d'une
app par ailleurs fonctionnelle.

### 2026-08-16 : Service des deux nouveaux fichiers (nginx)

**Statut** : Terminé

**Actions réalisées** :
- `location = /sw.js` → `Cache-Control: no-cache`.
- `location = /manifest.webmanifest` → `default_type application/manifest+json` et
  `Cache-Control: no-cache`.

**Fichiers modifiés** :
- `apps/web/nginx.conf`

**Notes** : les deux fichiers ne sont pas hashés par Vite, donc `location /assets/` (cache
d'un an) ne les couvre pas — mais l'absence de règle ne vaut pas garantie de fraîcheur
face à un intermédiaire. La règle est rendue explicite, sur le modèle de ce qui existait
déjà pour `index.html`. Le `default_type` n'est pas de la ceinture-bretelles : le
`mime.types` de `nginx:alpine` ne garantit pas `.webmanifest`, et un manifeste servi en
`application/octet-stream` est purement ignoré.

Pas d'ajout à `gzip_types` : le manifeste pèse moins de 1 Ko, sous le `gzip_min_length`
de 1024 déjà configuré.

### 2026-08-16 : Test de non-régression du manifeste

**Statut** : Terminé

**Actions réalisées** :
- `apps/web/vitest.config.ts` sur le modèle de `packages/shared/vitest.config.ts` —
  `mergeConfig(base, { test: { name: 'web' } })`. Le harnais de #31 s'étend à un second
  workspace sans rien changer à sa base.
- Script `test` dans `apps/web/package.json` : ramassé par
  `npm run test --workspaces --if-present`, donc par la CI, sans toucher au workflow.
- `apps/web/src/pwa/manifest.test.ts` — 7 tests : JSON valide, champs d'installabilité
  (`name`, `short_name`, `start_url`, `scope`, `display: standalone`), présence des
  tailles 192 et 512, présence des deux variantes masquées, cohérence de
  `theme_color`/`background_color` avec `--color-bg`, et **existence sur le disque de
  chaque icône référencée**.
- Auto-validation : un `src` volontairement fautif dans le manifeste fait bien échouer la
  suite (code de sortie 1), restauré ensuite. 24 + 7 tests au vert.

**Fichiers modifiés** :
- `apps/web/vitest.config.ts` (nouveau)
- `apps/web/src/pwa/manifest.test.ts` (nouveau)
- `apps/web/package.json`

**Notes** — pourquoi ce test existe : le manifeste est la seule pièce de l'app dont la
rupture est totalement silencieuse. Un JSON invalide ou une icône renommée ne fait échouer
ni `tsc`, ni le build, ni le rendu ; l'app cesse juste d'être installable, et personne ne
le voit avant un signalement d'utilisateur.

Les fichiers sont lus par `?raw` et `import.meta.glob` plutôt que par `node:fs`. Ce n'est
pas de la coquetterie : `apps/web/tsconfig.json` déclare `types: ["vite/client"]` et
`@types/node` n'est installé nulle part dans le dépôt. Passer par `node:fs` aurait imposé
une dépendance de types à toute l'app web pour un unique test.

Le worktree n'avait pas de `node_modules` (les workspaces npm s'installent à la racine du
dépôt principal) : `npm ci` a été lancé une fois, 124 paquets.

### 2026-08-16 : Vérifications

**Statut** : Terminé

**Actions réalisées** :
- `npm run typecheck` — vert sur les trois workspaces.
- `npm test` — 24 (shared) + 7 (web) au vert.
- `npm run build` — vert ; `dist/` contient bien `manifest.webmanifest`, `sw.js` et les
  quatre PNG.
- Bundle de prod inspecté : le garde `import.meta.env.PROD` a été replié par Vite, le
  `navigator.serviceWorker.register("/sw.js")` est présent dans `index-*.js`.
- `vite preview` : manifeste servi en `application/manifest+json`, `sw.js` en 200.
- **`nginx.conf` testé pour de vrai**, `dist/` servi par l'image `nginx:alpine` avec la
  configuration du dépôt : `nginx -t` passe, puis les en-têtes ont été relevés au `curl` —
  manifeste en `application/manifest+json` + `no-cache`, `sw.js` en `no-cache`, icônes en
  `image/png`.

**Notes** — le `default_type` du manifeste n'était pas de la précaution : vérification
faite, `grep webmanifest /etc/nginx/mime.types` dans `nginx:alpine` ne renvoie **rien**.
Sans cette ligne, le manifeste partait en `application/octet-stream` et le navigateur
l'ignorait purement et simplement. Le ticket aurait été livré, testé en local sous
`vite preview` (qui, lui, connaît le type), et cassé en production.

**Non vérifié ici** : le contrôle DevTools (panneau Application) n'a pas pu être fait —
le serveur MCP Chrome ne peut pas s'attacher, un Chrome tourne déjà sur le profil qu'il
utilise. Le contrôle navigateur et le test sur appareil réel passent donc entièrement par
la validation manuelle.

### 2026-08-16 : Retrait de l'icône SVG du manifeste

**Statut** : Terminé

**Actions réalisées** :
- Suppression de l'entrée `/icon.svg` de `manifest.webmanifest`. Il ne reste que les
  quatre PNG.
- Ajout d'un test « ne déclare aucune icône SVG » avec la raison en commentaire, pour que
  personne ne la remette par réflexe de complétude. 8 tests au vert.

**Fichiers modifiés** :
- `apps/web/public/manifest.webmanifest`
- `apps/web/src/pwa/manifest.test.ts`

**Notes** — remonté par la validation manuelle : DevTools affichait
`Icon http://localhost:4173/icon.svg failed to load`. Le fichier était pourtant servi
correctement (`200`, `Content-Type: image/svg+xml`, vérifié au `curl`) : c'est le décodeur
d'icônes de manifeste de Chrome qui ne gère pas le SVG. Une icône SVG en `sizes: "any"`
peut même faire échouer l'installation
([chromium 40925759](https://issues.chromium.org/issues/40925759)).

Le `<link rel="icon" type="image/svg+xml" href="/icon.svg">` d'`index.html` n'est pas
concerné et reste en place : c'est un autre chemin de code, qui lui gère le SVG.

Leçon pour la suite : déclarer le SVG « en plus, ça ne coûte rien » était faux. Dans un
manifeste, une icône que le navigateur ne sait pas décoder n'est pas ignorée poliment,
elle produit une erreur.
