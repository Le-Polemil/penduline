---
story: "Manifest PWA : rendre l'app installable"
story_code: "manifest-pwa"
issues: [41]
created: 2026-08-16
completed: 2026-08-17
status: "Done"
---

# Synthèse

## Résumé

Penduline s'installe depuis le navigateur, sur mobile comme sur ordinateur :
manifeste, jeu d'icônes, service worker minimal, et la configuration serveur qui
va avec.

## Décisions et leur raison

**Un service worker qui ne met rien en cache.** Chrome n'affiche l'invite
d'installation automatique que si la page est contrôlée par un service worker
écoutant `fetch`. Le fichier existe pour ça, et rien d'autre : mettre l'app shell
en cache ferait cohabiter deux versions du bundle et rendrait un déploiement
invisible aux onglets ouverts. Le hors-ligne est un sujet à part entière (#28),
pas un effet de bord de l'installabilité.

**En JavaScript brut dans `public/`.** Quinze lignes ne justifient pas une
seconde entrée de build TypeScript.

**`no-cache` sur `sw.js`, côté nginx.** Un service worker mis en cache longtemps
est impossible à corriger à distance.

**Pas de `screenshots`.** Ils débloquent la richer install UI d'Android mais
demandent des captures produit dédiées — hors calibre, reporté sur un ticket
dédié plutôt que de retenir une fonctionnalité finie.

## Ce que le travail a mis au jour

**🐛 Chrome ne sait pas décoder une icône SVG de manifeste.** DevTools affichait
`Icon /icon.svg failed to load` alors que le fichier était servi correctement
(`200`, `image/svg+xml`, vérifié au curl). Pire : une icône SVG en `sizes: "any"`
peut faire **échouer l'installation**
([chromium 40925759](https://issues.chromium.org/issues/40925759)).

La déclarer « en plus, ça ne coûte rien » était faux. Dans un manifeste, une
icône que le navigateur ne sait pas décoder n'est pas ignorée poliment. Un test
la refuse désormais, avec la raison en commentaire, pour que personne ne la
remette par réflexe de complétude.

Le `<link rel="icon" type="image/svg+xml">` d'`index.html` n'est pas concerné et
reste en place : autre chemin de code, qui lui gère le SVG.

**Le type MIME de `.webmanifest` n'est pas connu de nginx par défaut.** Servi en
`application/octet-stream`, le manifeste est purement et simplement ignoré. Le
ticket aurait été livré, testé sous `vite preview` — qui, lui, connaît le type —
et cassé en production.

**Les dimensions réelles des PNG méritent un contrôle.** Un `sizes` qui ment sur
le contenu du fichier fait échouer l'installation sans que rien ne le signale au
build : les tests ne lisent que le JSON. Vérifiées ici sur les quatre fichiers.

## Fichiers modifiés

- `apps/web/public/manifest.webmanifest`, `sw.js`, `icon-{192,512}.png`,
  `icon-maskable-{192,512}.png` *(nouveaux)*
- `apps/web/src/pwa/manifest.test.ts`, `apps/web/vitest.config.ts` *(nouveaux)*
- `apps/web/index.html`, `nginx.conf`, `package.json`, `src/main.tsx`

## Tests et validation

- **Tests automatiques** : ✅ 60 (52 partagés + **8 web, nouveaux ici** — c'est
  cette story qui dote `apps/web` d'une suite)
- **Typecheck / build** : ✅ trois workspaces
- **Sur le build réel** (`vite preview`) : manifeste en
  `application/manifest+json`, `sw.js` servi, les quatre PNG en `image/png` avec
  des **dimensions réelles conformes** aux `sizes` déclarées, icône `maskable`
  opaque et dans la zone de sécurité
- **Panneau Application de DevTools** : ⛔ Chrome refuse de s'attacher au profil
  du serveur MCP. L'enregistrement du service worker et le parsing du manifeste
  par Chrome restent à confirmer à la main.

## Avant de déployer

`nginx.conf` porte le type MIME de `.webmanifest` et le `no-cache` sur `sw.js`.
Sans ce fichier en production, le manifeste est ignoré et l'app n'est pas
installable — la configuration serveur fait partie de la fonctionnalité, pas de
son décor.

## Et après

Les `screenshots` du manifeste, sur un ticket dédié. Puis Web Push (#30), qui
s'appuiera sur ce service worker — il n'est vide qu'aujourd'hui.
