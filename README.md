# Penduline

Matrices d'Eisenhower (urgent/important) par pièce de la maison, accessibles sur
n'importe quel device en web, avec une extension Chrome compagnon. Chaque
utilisateur a son compte ; les matrices sont privées et isolées.

## Structure (monorepo npm workspaces)

```
penduline/
├── apps/
│   ├── web/          # App web (Vite + React + TS), responsive/PWA-ready
│   ├── extension/    # Extension Chrome MV3 (popup + service worker)
│   └── supabase/     # Projet Supabase : migrations SQL + RLS + seed local
├── packages/
│   └── shared/       # Types, modèle des quadrants + couleurs, client Supabase
└── work/             # Décisions & notes
```

## Modèle

- **Une pièce = une matrice.** `rooms` → `tasks` directement (pas de niveau
  `matrices` intermédiaire).
- **4 cases + « À trier »**, 1 couleur par case (palette de la maquette Claude
  Design) : `faire`=vert, `planifier`=bleu, `deleguer`=doré, `eliminer`=rouge,
  `parking`=neutre.
- Tâches : `pinned` (épinglage), `done`+`archived` (corbeille « Terminées »),
  `deleted` (corbeille « Supprimées »), `position` (ordre fractionnaire),
  `pair_id` (appairage côte à côte). Modèle + layout partagés dans
  `packages/shared` (`quadrants.ts`, `types.ts`, `layout.ts`), réutilisés par le
  web ET l'extension.

## Démarrage

```bash
npm install
cp .env.example .env   # `.env` à la RACINE (partagé web + extension)
```

Backend Supabase (voir [apps/supabase/README.md](apps/supabase/README.md)) —
**local** avec Docker :

```bash
npm run start -w @penduline/supabase   # démarre la stack locale
npm run status -w @penduline/supabase  # copie API URL + anon key dans .env
```

…ou **distant** : `npm run push -w @penduline/supabase` (après `link`), ou colle
`apps/supabase/migrations/*.sql` dans le SQL Editor. Puis :

```bash
npm run dev            # app web (premier port libre à partir de 5173)
```

En local, le seed crée le compte `demo@penduline.test` / `password123` avec des
pièces. Sinon, au premier login d'un compte vide, l'app web **sème** des pièces
d'exemple (Cuisine, Salle de bain, Salon, Garage) comme la maquette.

Extension : `npm run build:ext` (lit le même `.env` racine), puis charge le dossier
`apps/extension/dist` dans `chrome://extensions` (mode développeur, « Charger
l'extension non empaquetée »). Le popup a sa propre connexion (session dans
`chrome.storage`).

## État

**App web** (maquette « Matrice Maison.dc.html ») : accueil pièces, matrice 2×2 +
« À trier », drag & drop (déplacement / insertion / appairage), épinglage,
complétion + toast d'annulation, corbeille, ajout inline, sélecteur de pièce.

**Extension** (maquette « Extension Prototype.dc.html ») : popup 400×600, liste des
pièces (actives + « calmes » repliables), détail d'une pièce (4 quadrants empilés),
drag & drop vertical, filtres par quadrant, épinglage, complétion, ajout ciblé,
reprise de la dernière pièce ouverte (2 h), connexion embarquée. Typecheck + build OK.

À faire : édition du titre d'une tâche, renommage de pièce, temps réel Supabase,
notifications, URL de prod pour « Ouvrir l'app ». Détails dans `work/architecture.md`.
