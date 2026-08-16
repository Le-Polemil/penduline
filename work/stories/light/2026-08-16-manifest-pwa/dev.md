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
| 1. Générer le jeu d'icônes PNG (192/512, any + maskable) depuis `icon.svg` | En attente | |
| 2. Créer `apps/web/public/manifest.webmanifest` | En attente | |
| 3. Créer `apps/web/public/sw.js` (service worker minimal, sans cache) | En attente | |
| 4. Enregistrer le service worker dans `apps/web/src/main.tsx` | En attente | |
| 5. Lier le manifeste depuis `apps/web/index.html` | En attente | |
| 6. `apps/web/nginx.conf` : MIME `.webmanifest` + `no-cache` sur `sw.js` | En attente | |
| 7. Test de non-régression du manifeste (Vitest sur `apps/web`) | En attente | |
| 8. Vérifications qualité (typecheck / test / build) et contrôle DevTools | En attente | |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->
