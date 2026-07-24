# Penduline — décisions

## Contexte

Matrices d'Eisenhower par pièce de la maison. Web multi-device + extension Chrome
compagnon. Comptes utilisateurs, matrices privées et isolées par compte.

## Décisions (2026-07-24)

- **Couleurs : 1 couleur par case, pas 5 niveaux.** La palette annoncée
  (vert, bleu, jaune, orange doré, rouge) se réduit à 4 teintes — jaune et orange
  doré désignent la même couleur. Mapping : rouge = urgent+important (*Faire*),
  bleu = important pas urgent (*Planifier*), doré = urgent pas important
  (*Déléguer*), vert = ni/ni (*Éliminer/plus tard*). Défini dans
  `packages/shared/src/quadrants.ts`.
- **Backend : Supabase.** Auth intégrée + Postgres + RLS + temps réel. L'isolation
  multi-compte repose **entièrement sur les policies RLS** (`user_id = auth.uid()`),
  pas sur le code client. Clés `anon` publiques, embarquées côté web et extension.
- **Monorepo npm workspaces** : `shared` porte le modèle de domaine et le client
  Supabase, réutilisés par `web` et `extension` (le web persiste la session en
  localStorage, l'extension via un adaptateur `chrome.storage`).
- **Design : anti-« look IA ».** Palette sobre (papier/encre), serif, pas de
  gradient/blur/emoji. Le bleu est autorisé **comme couleur fonctionnelle d'une
  case** (demandé explicitement), pas comme couleur de marque.
- **Nom du projet : Penduline** (rémiz penduline — série d'oiseaux du user).

## Décisions (2026-07-24, impl. maquette « Matrice Maison.dc.html »)

La maquette Claude Design (importée via le MCP `DesignSync`, projet
`570d9089-…`) fait foi pour l'UX et le visuel. Elle **remplace** deux décisions
antérieures :

- **Couleurs : on suit la maquette.** Inversion du mapping heat : `faire`=**vert**
  (`#5c6b45`), `planifier`=**bleu** (`#38607f`), `deleguer`=**doré** (`#8f6a14`),
  `eliminer`=**rouge** (`#a63d2a`), + zone `parking` (« À trier ») neutre. Palette
  terracotta/sauge du design system « Organic ». Fontes **Caprasimo** (titres) +
  **Figtree** (corps).
- **Une pièce = une matrice.** La maquette n'a pas de niveau `matrices`
  intermédiaire : le schéma est `rooms → tasks` directement. Le multi-matrices par
  pièce est abandonné pour l'instant (réintroductible plus tard si besoin).
- **Persistance : Supabase direct** (pas de phase localStorage). État optimiste en
  mémoire, écritures immédiates. Seed automatique (Cuisine/Salle de bain/Salon/
  Garage) au premier login d'un compte vide.
- **Modèle des tâches enrichi** : `pinned` (épinglage), `done` + `archived`
  (corbeille « Terminées », archivage 4 s après le toast), `deleted` (corbeille
  « Supprimées »), `position` (double, fractionnaire pour insérer entre deux
  lignes), `pair_id` (deux tâches côte à côte sur une ligne). Voir
  `apps/supabase/migrations/20260724090000_init.sql`.
- **Layout appairé** dérivé à la volée depuis `position` + `pair_id`
  (`apps/web/src/data/layout.ts`), pas de table de layout. Le drag & drop calcule
  des positions fractionnaires ; l'appairage partage un `pair_id`.
- **Animations** via l'API View Transitions (`document.startViewTransition` +
  `flushSync`), dégradation gracieuse si non supportée.

## Décisions (2026-07-25, impl. « Extension Prototype.dc.html »)

- **Popup en React + Supabase** (mêmes données que le web, par compte). Le popup a
  sa **propre session** (`chrome.storage` via l'adaptateur) → **connexion embarquée**
  (email/mdp) plutôt que délégation à l'onglet web. Ça tranche le point « auth
  extension » qui était ouvert.
- **Modèle + layout remontés dans `@penduline/shared`** (`layout.ts`) pour être
  partagés web/extension. Le `apps/web/src/data/layout.ts` a été supprimé.
- **`.env` unique à la racine** : les deux `vite.config.ts` pointent leur `envDir`
  vers la racine du monorepo (fini le `apps/web/.env`).
- **Manifest dans `apps/extension/public/`** → copié tel quel dans `dist/` par Vite.
- **Popup 400×600** (la maquette est en 640, mais Chrome plafonne la hauteur du
  popup à 600).
- **Simplifications assumées côté extension vs web** : pas de zone « À trier »
  (parking) ni d'appairage (les 4 quadrants empilés) ; cocher une tâche fait
  directement `done + archived` (pas de toast/undo dans le popup) → elle atterrit
  dans la corbeille « Terminées » du web. Le drag & drop pose `pair_id: null`.
- **Adaptateur `chromeStorage`** : repli sur `localStorage` si les API `chrome`
  sont absentes (aperçu hors extension, tests).
- `WEB_APP_URL` (bouton « Ouvrir l'app ») est un **placeholder** (`localhost:5173`)
  à remplacer par l'URL de prod. Liens GitHub/BuyMeACoffee repris de la maquette.

## Ouvert (à trancher après la recherche UX « Claude Design »)

- Responsive fin de la grille sur mobile (empilement actuel < 720px — le drag &
  drop tactile reste à éprouver).
- Flow d'auth dans l'extension : formulaire embarqué vs délégation à l'onglet web.
- Rappels/notifications : PWA Web Push vs autre canal ; quoi rappeler, quand.
- Temps réel Supabase (sync multi-onglets/devices) : non branché, à ajouter.

## État

App fonctionnelle : accueil (pièces + pastilles), matrice 2×2 + « À trier »,
drag & drop (déplacement, insertion, appairage), épinglage, complétion + toast
undo, corbeille, ajout inline, sélecteur de pièce. Typecheck + build OK.
Non couvert : édition du titre d'une tâche, renommage de pièce, temps réel,
notifications, extension (reste un squelette lisant `rooms`).
