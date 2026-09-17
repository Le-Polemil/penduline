---
story: "Serveur MCP Penduline"
story_code: "serveur-mcp"
created: 2026-09-17
status: "In Progress"
---

# #23 — Serveur MCP Penduline

## Contexte

Permettre à un assistant IA de travailler dans le Penduline de l'utilisateur : créer un
univers, y poser des matrices et des tâches, reclasser, cocher. L'issue livre un serveur
MCP classique en transport HTTP streamable, et range « MCP Apps » ailleurs.

Deux écarts assumés par rapport au texte de l'issue, décidés en amont du plan :

**1. OAuth 2.1 au lieu du jeton d'accès personnel.** L'issue proposait un PAT collé à la
main dans la configuration du client, et renvoyait OAuth à un ticket séparé. Décision
inverse : le client découvre tout seul qu'il lui faut un jeton, ouvre un navigateur, et
l'utilisateur approuve — zéro copier-coller, et c'est ce que la spec MCP attend d'un
serveur distant. La note est contenue en **déléguant la connexion à l'app web**, qui sait
déjà connecter quelqu'un : le serveur d'autorisation n'écrit aucun formulaire de login.
Conséquence : pas de table `api_tokens` ; des clients OAuth et des autorisations.

**2. Une seule notion, un seul nom.** L'issue écrivait `universes.origin` et
`tasks.created_by`. Ce sera `origin` sur les trois niveaux — univers, matrices, tâches.

**Un seul service déployé.** `apps/mcp` porte à la fois le serveur d'autorisation et le
serveur MCP : un process, une image, un domaine. La spec l'autorise, et c'est le cas
nominal pour un serveur personnel. Ce n'est pas une Edge Function : le service
`edge-functions` a été retiré du compose au dégraissage (`work/coolify-deploy.md:201-205`,
~1 Go récupéré sur une machine de 4 Go). Ce n'est pas non plus l'app web : en production
elle est un nginx qui sert des fichiers statiques.

**Taille.** L'issue chiffrait la base à ~3 j et OAuth à +2-3 j. Ce plan fait les deux. Il
dépasse franchement le calibre d'une story light — c'est dit ici pour que la décision de
le scinder, si elle vient, se prenne en connaissance de cause.

---

## Architecture

```
Claude Code ──POST /mcp sans jeton──> mcp.penduline.polemil.dev
            <── 401 + WWW-Authenticate: resource_metadata=… ──┘
            ── /.well-known/oauth-protected-resource, /.well-known/oauth-authorization-server
            ── POST /register (RFC 7591, client public, pas de secret)
navigateur  ── GET /authorize?…PKCE S256… ──> 302 ──> penduline.polemil.dev/autoriser?demande=…
                                                        │ app web : connexion si besoin,
                                                        │ puis « Autoriser Claude Code »
            ┌── POST /authorize/decision ───────────────┘
            │   Authorization: Bearer <JWT Supabase de l'utilisateur>  (vérifié par le secret partagé)
            └── 302 vers redirect_uri?code=…
            ── POST /token (code + verifier) ──> jeton d'accès MCP (1 h) + jeton de rafraîchissement
            ── POST /mcp  Authorization: Bearer <jeton d'accès MCP>
```

**Trois jetons, trois secrets distincts — c'est la décision de sécurité du ticket.**

| Jeton | Signé avec | Durée | Rôle |
|---|---|---|---|
| Jeton d'accès MCP | `MCP_TOKEN_SECRET` | 1 h | `aud: penduline-mcp`. **Sans valeur contre PostgREST** : un client ne peut pas court-circuiter le serveur pour taper la base. |
| JWT Supabase `authenticated` | `SUPABASE_JWT_SECRET` | **60 s** | Signé à la volée, `sub` = l'utilisateur. Les policies RLS existantes s'appliquent telles quelles, aucune règle d'isolation dupliquée en TS. |
| JWT Supabase `service_role` | `SUPABASE_JWT_SECRET` | 60 s | Un seul usage : lire `oauth_clients` / `oauth_grants`, invisibles sous RLS. Ne touche jamais une donnée métier. |

Les 60 s reprennent le raisonnement déjà écrit dans `config.toml:56-61` et
`work/coolify-deploy.md:176-182` : PostgREST valide un JWT **hors ligne**, il ne peut pas
savoir qu'il a été révoqué — sa durée de vie est exactement la fenêtre pendant laquelle
une révocation reste sans effet. Ici on la réduit à un appel.

**La révocation mord immédiatement** : chaque appel MCP relit `oauth_grants` (index sur
`user_id`) pour vérifier `revoked_at is null`, avant de signer quoi que ce soit. Un appel
fait de toute façon des requêtes ; ce `select` de plus est négligeable, et il évite qu'une
application révoquée continue d'écrire pendant une heure.

---

## Lot 1 — Migration

`apps/supabase/migrations/20260917<HHMMSS>_mcp_oauth.sql` — en-tête et prose à la manière
des migrations existantes (`20260829160000_subtasks.sql` pour le ton).

1. `create type origin as enum ('user','agent');` puis
   `alter table universes|boards|tasks add column origin origin not null default 'user';`
   + `comment on column` sur les trois. Ajout d'une colonne avec défaut : pas de réécriture
   de table. `replica identity full` est déjà posé, le temps réel suit tout seul.

2. **`oauth_clients`** — enregistrements dynamiques, pas de propriétaire utilisateur.
   `client_id text unique`, `client_name`, `redirect_uris text[]`, `created_at`,
   `last_used_at`. Suit le modèle `job_runs` (`20260906120000_scheduler.sql:64-81`) :
   `enable row level security` **sans aucune policy** + `revoke all … from anon,
   authenticated`. Seul le `service_role` la voit.

3. **`oauth_grants`** — une autorisation = un couple (utilisateur, client).
   `user_id → auth.users on delete cascade`, `client_id → oauth_clients(client_id) on
   delete cascade`, `client_name` dénormalisé (le nom au moment de l'autorisation),
   `refresh_token_hash text unique`, `created_at`, `last_used_at`, `revoked_at`.
   Index `oauth_grants_user_idx (user_id, created_at desc)`. RLS + policy
   `"oauth_grants: owner"` `for all using (user_id = auth.uid()) with check (…)` —
   c'est elle qui permet à l'app web de lister et de révoquer **sans passer par le
   serveur MCP**.

Aucun `grant` : ils s'héritent de la propriété `supabase_admin`, et le `verify` du script
de déploiement contrôle précisément ce point.

## Lot 2 — `apps/mcp`

Nouveau workspace (`apps/*` est déjà dans `workspaces`). Dépendances :
`@modelcontextprotocol/sdk@^1.30`, `jose`, `zod@^4`, `@penduline/shared`, `tsx`.

**Exécution par `tsx`, sans étape de build.** `packages/shared` se consomme en *source*
(`main: ./src/index.ts`) : un bundler devrait être configuré pour l'y suivre, alors que
`tsx` le fait nativement. Coût : une dépendance de production de plus. Gain : aucune
décision de bundling à maintenir, et le même mode de démarrage en local et en image.

```
apps/mcp/
  src/env.ts          variables lues et validées au démarrage (échec franc, pas de valeur par défaut muette)
  src/jwt.ts          jose : signature des trois jetons, vérification du JWT Supabase entrant
  src/db.ts           client PostgREST par `fetch` — en-têtes `apikey` (anon) + `Authorization`
  src/oauth/*.ts      métadonnées, /register, /authorize + /authorize/decision, /token
  src/oauth/store.ts  demandes en attente et codes d'autorisation : en mémoire, TTL court
  src/mcp/server.ts   McpServer + les 9 outils, transport HTTP streamable sans session
  src/mcp/tools.ts    les 9 outils
  src/quota.ts        fenêtre glissante par autorisation
  src/*.test.ts
  Dockerfile  README.md  package.json  tsconfig.json  vitest.config.ts
```

Env : `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Kong exige l'en-tête `apikey`),
`SUPABASE_JWT_SECRET`, `MCP_TOKEN_SECRET`, `MCP_PUBLIC_URL`, `WEB_APP_URL`, `PORT`,
et deux réglages de quota.

**Transport** : `StreamableHTTPServerTransport({ sessionIdGenerator: undefined })` (sans
état — chaque appel porte son jeton). Un middleware valide le `Bearer`, relit l'autorisation
en base et pose `req.auth` ; le handler d'outil le relit dans `extra.authInfo`.

**Les 9 outils, et l'invariant que chacun doit tenir.** Toute écriture passe par
`packages/shared/src/layout.ts` — c'est là que vivent les règles, et les dupliquer côté
serveur est exactement ce que la story doit éviter.

| Outil | Règle |
|---|---|
| `list_universes` / `list_boards` | tri `position`. |
| `list_tasks` | ⚠️ `max_rows = 1000` côté PostgREST **tronque en silence** — pagination explicite comme `store.ts:39,248-261`. Par défaut les tâches ouvertes (`isOpenRow`). |
| `create_universe` / `create_board` | `position = endPosition(…)`, `origin: 'agent'`, `user_id` explicite. |
| `create_task` | `quadrant` par défaut `parking`, `position = endPosition(visibles de (board, quadrant))`, `origin: 'agent'`. Une sous-tâche hérite de la case du parent ; le `tasks_depth_guard` refuse un parent qui en a déjà un — l'outil le dit avant, pour rendre une erreur lisible. |
| `update_task` | titre et échéance **uniquement sur la tâche visée**. Surtout pas `planPairPatch`, qui applique le même patch aux deux — il est fait pour les attributs de la paire, pas pour un titre. |
| `move_task` | `planPairMove(tasks, task, {quadrant, board_id}, endPosition(destination))`, la partenaire suit. **Ne jamais écrire `quadrant_changed_at`** : le trigger le tient, et l'écrire le ferait mentir à la revue. |
| `complete_task` | `planPairDetach(tasks, task, {done:true, archived:true})` — un seul write portant l'état final, `done` et `archived` ensemble, sur quoi les statistiques s'appuient. |

Outils de lecture annotés `readOnlyHint`.

**Quota** : fenêtre glissante en mémoire par autorisation (appels/minute et écritures/jour,
réglables), `429` avant d'atteindre le transport. Limite assumée et documentée : une seule
instance. Une deuxième demanderait un compteur en base.

## Lot 3 — App web

- **Écran de consentement.** `readAuthorizeRequest()`, fonction pure lisant
  `location.pathname === '/autoriser'` + `?demande=`, consommée par un `useState`
  paresseux dans `App.tsx` — exactement le motif de `recovering` (`App.tsx:60-115`), et
  placé **après** `!session` pour qu'un visiteur déconnecté se connecte d'abord et retombe
  sur l'écran. `nginx.conf` retombe déjà sur `index.html` pour toute route.
  L'écran affiche le nom du client et l'hôte de redirection, puis « Autoriser » /
  « Refuser » → `POST {VITE_MCP_URL}/authorize/decision` avec le jeton Supabase courant →
  `window.location.replace(redirect_to)`.
- **Modale « Applications connectées »**, ouverte depuis `.userbar__right` (à côté de
  Déconnexion) : bâtie sur `useDialog` + `.bin-backdrop` comme la corbeille, donc aucune
  chirurgie sur la navigation (`View`, `readView`, sessionStorage intacts). Liste des
  `oauth_grants` non révoquées via un hook autonome façon `useBinCount`/`useStats`, et
  « Révoquer » derrière un `Confirm`.
- **Marque « créé par l'agent »** : une pastille sur le modèle de `.due`
  (`TaskCard.tsx:536-543`, `styles.css:647-669`) — **avec son propre texte**, la couleur
  seule exclut les daltoniens (`styles.css:651-653`). Sur la carte de tâche, sur la ligne
  de matrice (près de `.board-card__pills`) et sur l'en-tête d'univers.
- `types.ts` : `origin: 'user' | 'agent'` sur `Universe`, `Board`, `Task` — et
  `test-fixtures.ts` **doit** suivre, sinon tous les tests tombent au typecheck. Les
  insertions de l'app ne changent pas : le défaut serveur vaut `user`.
- `VITE_MCP_URL` : variable de build (Vite l'inline), donc `ARG` dans le Dockerfile, entrée
  dans `.env.example`. Absente → l'écran de consentement le dit franchement plutôt que
  d'échouer en silence.

⚠️ `styles.test.ts` verrouille trois choses que tout CSS ajouté doit respecter : pas de
`@keyframes` orpheline, le plancher `prefers-reduced-motion` global, et **aucun `:hover`
hors `@media (hover: hover)`** (l'assertion est une égalité stricte sur une seule exception).

## Lot 4 — Extension

Même pastille dans la liste du popup (`apps/extension/src`), alimentée par la même colonne.
Vérifier `npm run build:ext`.

## Lot 5 — Monorepo, image, documentation

- ⚠️ **`apps/web/Dockerfile` doit copier `apps/mcp/package.json`.** Il copie les manifestes
  un à un, et `npm ci` échoue si un workspace déclaré n'a pas le sien — le piège déjà
  documenté pour `apps/extension`. Sans ça, **ajouter `apps/mcp` casse le build de l'app
  web**, pas celui du serveur.
- `apps/mcp/Dockerfile`, contexte = racine du monorepo (mêmes raisons que le web).
- `.github/workflows/ci.yml` : second `build-push` dans le job `image` →
  `ghcr.io/le-polemil/penduline-mcp`. Aucun build arg (tout est runtime ici).
- `apps/mcp/README.md` : variables, démarrage local, `claude mcp add`.
- `work/coolify-deploy.md` : section ressource MCP (domaine, variables, secrets) + le
  nouveau build arg `VITE_MCP_URL` à poser sur la ressource web.
- `README.md` racine : structure et état.

---

## Tests (Vitest, logique pure — ni DOM ni E2E, conformément au parti pris du dépôt)

- `apps/mcp` — forme des claims des trois jetons et **preuve qu'un jeton d'accès MCP est
  refusé comme jeton Supabase** (secrets distincts) ; PKCE S256 : mauvais `verifier`, code
  rejoué, code expiré, `redirect_uri` non enregistrée ; quota en fenêtre glissante ;
  traduction arguments d'outil → `TaskWrite[]` pour `create` / `move` / `complete`, y
  compris sur une tâche appairée.
- `apps/web` — `readAuthorizeRequest()` : URL valide, URL sans paramètre, route quelconque.
- ⚠️ `test-fixtures.ts` n'est **pas** exporté depuis `packages/shared/src/index.ts`, et
  c'est délibéré. `apps/mcp` définit ses propres fabriques locales plutôt que d'élargir la
  surface publique de `shared`.

## Plan de test manuel

1. `npm run start -w @penduline/supabase` puis `npm run reset` — la migration passe, le
   seed reste valide.
2. `npm run dev` (app web) et `npm run dev -w @penduline/mcp` (serveur, 127.0.0.1).
3. `claude mcp add --transport http penduline-local http://127.0.0.1:8787/mcp` dans un
   projet quelconque → le navigateur s'ouvre, l'écran « Autoriser » apparaît, l'approbation
   ramène au client. **Aucun jeton copié à la main.**
4. `/mcp` dans Claude Code : le serveur est connecté et liste ses 9 outils.
5. Demander à l'agent de créer un univers, une matrice, trois tâches, d'en déplacer une en
   « Faire » et d'en cocher une. Recharger l'app web : tout est là, **marqué**.
6. Déplacer une tâche **appairée** par `move_task` → la partenaire suit, les deux restent
   adjacentes. Cocher une tâche appairée → le lien se rompt **des deux côtés**.
7. Révoquer l'application depuis la modale → l'appel d'outil suivant échoue
   **immédiatement**, sans attendre l'expiration du jeton.
8. Isolation : créer un second compte, refaire le flux, vérifier qu'aucun outil ne voit les
   matrices de l'autre.
9. Quota : boucler des appels jusqu'au `429`.
10. `npm run build:ext` et charger l'extension → la pastille est là aussi.

## Contrôles qualité

`npm run typecheck` (couvre `apps/mcp` par `--workspaces --if-present`), `npm test`,
`npm run build`. Pas de linter dans ce dépôt. La CI ajoute le contrôle d'unicité des
horodatages de migration.

## Ce qui reste dehors

MCP Apps (l'UI servie par le serveur), les portées de jeton (lecture seule / écriture), et
un compteur de quota partagé entre instances.
