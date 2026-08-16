---
story: "Manifest PWA : rendre l'app installable"
story_code: "manifest-pwa"
issue: 41
milestone: "Vague 3 — Le temps"
created: 2026-08-16
status: "In Progress"
---

# #41 — Manifest PWA : rendre l'app installable

## Contexte

`apps/web/public/` ne contient aucun `.webmanifest`. `index.html` déclare bien une
`apple-touch-icon` et un `theme-color`, mais sans manifeste ni Android ni iOS ne
proposent l'ajout à l'écran d'accueil. Le produit se consulte plusieurs fois par jour
sur mobile et repasse par le navigateur à chaque fois.

C'est aussi un **prérequis technique de #30** (notifications push) : sur iOS, le Web Push
n'existe que pour une PWA installée.

### La décision structurante : le service worker

Chrome a retiré l'exigence de service worker pour l'installation **via le menu ⋮**
(v108 mobile, v112 desktop). Mais l'**invite automatique** — `beforeinstallprompt`, la
bannière que le ticket demande de vérifier — exige toujours que la page soit contrôlée
par un service worker écoutant `fetch`.

→ **On pose un service worker minimal, sans aucun cache.** Il n'existe que pour rendre
l'invite disponible. Mettre l'app shell en cache ferait cohabiter deux versions du bundle
et rendrait un déploiement invisible aux onglets ouverts : hors périmètre de ce ticket.

## Périmètre

Web uniquement (`apps/web`). L'extension n'est pas touchée.

---

## 1. Jeu d'icônes PNG

Dérivées de `apps/web/public/icon.svg` (nid terracotta, viewBox `11.75 5.5 88.5 88.5`).
Rasterisation avec `sips` (déjà présent, macOS) — pas de nouvelle dépendance npm.

**Fichiers produits, commités** dans `apps/web/public/` :

| Fichier | Taille | Fond | Usage |
|---|---|---|---|
| `icon-192.png` | 192 | transparent | `purpose: any` |
| `icon-512.png` | 512 | transparent | `purpose: any` |
| `icon-maskable-192.png` | 192 | `#f5ead8` | `purpose: maskable` |
| `icon-maskable-512.png` | 512 | `#f5ead8` | `purpose: maskable` |

`icon.svg` et `apple-touch-icon.png` (180×180, fond crème, déjà au bon format) sont
conservés tels quels.

**Recette maskable** — `sips` ne sait ni composer un fond ni ajouter une marge. On écrit
un SVG intermédiaire dans le scratchpad : `<rect>` plein `#f5ead8` + le SVG d'origine
imbriqué, centré, à **~66 % du canevas**. La zone sûre d'Android est un cercle de 80 % du
côté ; le nid mesure 56×88,5 dans son viewBox (haut et étroit), sa diagonale à 66 %
reste sous les 80 %. Rendu vérifié à l'œil avant de commiter.

Les commandes exactes sont consignées dans le `dev.md` de la story — pas de script
commité, `sips` étant macOS-only et l'existant (icônes extension, apple-touch-icon)
suivant déjà la convention « PNG commités ».

## 2. `apps/web/public/manifest.webmanifest`

```jsonc
{
  "id": "/",
  "name": "Penduline",
  "short_name": "Penduline",
  "description": "Matrices d'Eisenhower par contexte",
  "lang": "fr",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "theme_color": "#f5ead8",      // aligné sur --color-bg / le <meta> existant
  "background_color": "#f5ead8",
  "categories": ["productivity"],
  "icons": [ /* svg any + les 4 PNG ci-dessus */ ]
}
```

Pas de `screenshots` : ils débloquent la « richer install UI » d'Android mais demandent
des captures produit dédiées — hors calibre.

## 3. `apps/web/public/sw.js`

Service worker en JavaScript brut dans `public/` (copié verbatim par Vite, servi à `/sw.js`,
scope `/`). Une quinzaine de lignes ne justifie pas une seconde entrée de build TS.

```js
// Commentaire d'en-tête expliquant POURQUOI ce handler quasi vide existe,
// sinon il sera supprimé comme code mort à la première relecture.

self.addEventListener('install',  () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  // Passe-plat limité aux navigations. `respondWith` conditionnel, et non un
  // handler au corps vide : Chrome détecte et ignore les handlers no-op, ce qui
  // invaliderait le critère d'installabilité. Restreint aux navigations pour que
  // le trafic Supabase ne traverse pas le service worker.
  if (event.request.mode === 'navigate') event.respondWith(fetch(event.request));
});
```

`skipWaiting` + `clients.claim` : un service worker est collant. Sans eux, une version
corrigée de ce fichier resterait bloquée en attente derrière l'ancienne.

**Repli** si l'invite Android ne se déclenche pas au test réel : `respondWith` sur toutes
les requêtes.

## 4. Enregistrement — `apps/web/src/main.tsx`

Après le `createRoot(...)`, gardé par `import.meta.env.PROD && 'serviceWorker' in navigator`,
sur l'évènement `load`. Prod uniquement : en dev il perturberait le HMR de Vite.

## 5. `apps/web/index.html`

Ajout de `<link rel="manifest" href="/manifest.webmanifest" />` à côté des `<link rel="icon">`
existants.

## 6. `apps/web/nginx.conf`

Deux `location` exactes à ajouter :

- `= /manifest.webmanifest` → `default_type application/manifest+json` (l'image
  `nginx:alpine` ne garantit pas le mapping MIME de `.webmanifest`) + `Cache-Control: no-cache`.
- `= /sw.js` → `Cache-Control: no-cache`.

**Critique** : le bloc `location /assets/` actuel ne les couvre pas, mais un service worker
mis en cache longtemps est impossible à corriger à distance. On rend la non-mise-en-cache
explicite, comme c'est déjà fait pour `index.html`.

## 7. Test de non-régression (optionnel, à couper si tu préfères)

Un manifeste cassé n'échoue à aucun build : l'app cesse simplement d'être installable, en
silence. Le harnais Vitest posé en #31 vit aujourd'hui uniquement sur `packages/shared`.

- `apps/web/vitest.config.ts` — `mergeConfig(base, { test: { name: 'web' } })`, sur le
  modèle de `packages/shared/vitest.config.ts`.
- Script `test` dans `apps/web/package.json` (récupéré par `npm test --workspaces`, donc
  par la CI).
- `apps/web/src/pwa/manifest.test.ts` — JSON valide, champs requis présents
  (`name`, `start_url`, `display: standalone`, icônes 192 et 512, une `maskable`), et
  **chaque fichier d'icône référencé existe sur le disque**.

---

## Vérifications

**Automatiques** (aucun linter dans ce dépôt) :
```
npm run typecheck    # tsc --noEmit sur les 3 workspaces
npm test             # Vitest — shared + web
npm run build
```

**Locales, sur le build de prod** (`npm run build -w @penduline/web && npm run preview -w @penduline/web`,
`localhost` est un contexte sécurisé, le service worker s'y enregistre) :
- DevTools › Application › Manifest : aucune erreur, les 5 icônes se chargent, aperçu
  maskable correct.
- DevTools › Application › Service workers : `sw.js` activé et *running*.
- Menu Chrome : l'entrée « Installer Penduline… » est présente.

**Sur appareil réel** — nécessite un déploiement, à faire après merge :
- Android Chrome : bannière/invite d'installation, icône non rognée dans son cercle,
  lancement depuis l'écran d'accueil sans barre d'adresse.
- iOS Safari : Partager › « Sur l'écran d'accueil », icône correcte, lancement sans
  barre d'adresse.

## Hors périmètre

Cache offline / app shell · bouton d'installation in-app (`beforeinstallprompt` capturé) ·
captures `screenshots` du manifeste · Web Push (#30) · l'extension.
