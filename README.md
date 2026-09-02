# Penduline

Matrices d'Eisenhower (urgent/important) par contexte, accessibles sur
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

- **Une matrice = un contexte, au choix de l'utilisateur** (un lieu, un moment,
  un projet). `boards` → `tasks` directement.
- **Une tâche porte des liens** (`task_attachments`), plusieurs s'il le faut —
  une issue et sa PR, un article et sa discussion. Le schéma `http(s)` est
  contraint **en base** et pas seulement à la saisie : un `javascript:` entré par
  l'API finirait cliquable dans l'app web.
- **Une tâche peut avoir des étapes, sur UN SEUL niveau** (`tasks.parent_id`).
  C'était la seule entorse à la platitude du modèle, et elle est tenue par trois
  règles sans lesquelles la matrice deviendrait un gestionnaire de projet :
  une étape ne peut pas en avoir *(garantie par un trigger, pas par l'interface)*,
  elle n'a pas de case à elle *(elle hérite de celle du parent)*, et elle ne
  compte dans aucun compteur. Elle ne se déplace pas, ne s'épingle pas, ne
  s'appaire pas : elle se coche et se supprime, rien d'autre.
- **Une tâche peut porter une échéance** (`tasks.due_at`, en UTC). Une seule, d'où
  une colonne et pas une table. Aucun statut n'est stocké : « bientôt » (moins de
  24 h) et « dans le rouge » sont **dérivés** de `due_at` et de l'heure courante à
  chaque rendu, sans quoi il faudrait quelqu'un pour les réécrire au fil du temps.
  Une tâche dépassée remonte en tête de sa case, dans une zone à elle — son rang
  y appartient à son échéance, plus à l'ordre manuel.
- **Les matrices peuvent être regroupées en univers** (Perso, Boulot, Maison…),
  et ce niveau est **facultatif de bout en bout** : on peut n'en créer aucun, et
  une matrice peut n'appartenir à aucun. Supprimer un univers ne supprime pas ses
  matrices — `on delete set null` les délie, il ne les emporte pas. Le
  regroupement est une vue sur les matrices, pas leur propriétaire.
- **4 cases + « À trier »**, 1 couleur par case (palette de la maquette Claude
  Design) : `faire`=vert, `planifier`=bleu, `deleguer`=doré, `eliminer`=rouge,
  `parking`=neutre.
- Tâches : `pinned` (épinglage), `done`+`archived` (corbeille « Terminées »),
  `deleted` (corbeille « Supprimées »), `position` (ordre fractionnaire),
  `pair_id` (appairage). Modèle + layout partagés dans `packages/shared`
  (`quadrants.ts`, `types.ts`, `layout.ts`), réutilisés par le web ET
  l'extension.
- **L'appairage est un lien, pas une mise en page.** Deux tâches qui partagent un
  `pair_id` s'affichent côte à côte, mais surtout elles **restent ensemble** :
  elles changent de case, s'épinglent et se déplacent d'un bloc. Le lien ne se
  défait que volontairement (« Dissocier »), ou quand il perd son sens — l'une des
  deux supprimée ou terminée.
- **Cette règle vit dans `layout.ts`, et nulle part ailleurs** : `planPairMove`,
  `planPairPatch` et `planPairDetach` rendent les écritures à appliquer, sans rien
  persister. C'est ce qui les rend testables — et ce qui évite qu'elles divergent
  entre le web et l'extension, ce qui s'était déjà produit une fois.
- L'ordre des matrices (`boards.position`) et celui des tâches partagent la même
  logique de position fractionnaire : `positionBefore()`, dans `layout.ts`.

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
matrices d'exemple aux découpages variés (un lieu, une semaine, un projet).
Ailleurs, un compte vide **reste vide** : le découpage appartient à
l'utilisateur, l'app n'en impose aucun.

Extension : `npm run build:ext` (lit le même `.env` racine), puis charge le dossier
`apps/extension/dist` dans `chrome://extensions` (mode développeur, « Charger
l'extension non empaquetée »). Le popup a sa propre connexion (session dans
`chrome.storage`).

## Qualité

```bash
npm run typecheck      # tsc --noEmit sur chaque workspace
npm test               # Vitest, sur les workspaces qui en ont
npm run build
```

Les deux tournent en CI et bloquent une PR qui échoue.

**Ce que les tests couvrent, et pourquoi ceux-là.** Vitest est configuré sur
`packages/shared`, où vit la logique pure — celle dont les défaillances sont
**silencieuses** : un ordre qui dérive ou une paire cassée ne lèvent aucune erreur
et ne se voient pas à l'écran, ils produisent juste un résultat faux. Le rendu, lui,
se vérifie à l'œil ; il n'y a donc ni test de composant React ni E2E, délibérément.

À noter, mesuré par ces tests : les positions fractionnaires supportent **53
insertions consécutives au même interstice** avant que deux positions ne
deviennent égales et que l'ordre ne se perde. Confortable, mais fini.

La configuration commune est `vitest.base.mts`, à la racine — pour qu'`apps/web` et
`apps/extension` puissent l'étendre sans dépendre de `packages/shared`.

## État

**App web** (maquette « Matrice Maison.dc.html ») : accueil matrices, matrice 2×2 +
« À trier », drag & drop (déplacement / insertion / appairage), épinglage,
complétion + toast d'annulation, corbeille, ajout inline, sélecteur de matrice,
création nommée d'une matrice.

**Extension** (maquette « Extension Prototype.dc.html ») : popup 400×600, liste des
matrices (actives + « calmes » repliables), détail d'une matrice (4 quadrants empilés),
drag & drop vertical, filtres par quadrant, épinglage, complétion, ajout ciblé,
reprise de la dernière matrice ouverte (2 h), connexion embarquée. Typecheck + build OK.

À faire : édition du titre d'une tâche, renommage de matrice, temps réel Supabase,
notifications. Détails dans `work/architecture.md`.

## Production

Déployée sur Coolify : app web sur https://penduline.polemil.dev, Supabase
auto-hébergé sur https://api.penduline.polemil.dev. Voir
[work/coolify-deploy.md](work/coolify-deploy.md) pour les décisions et les pièges.
