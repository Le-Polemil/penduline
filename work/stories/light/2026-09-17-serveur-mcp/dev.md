---
story: "Serveur MCP Penduline"
story_code: "serveur-mcp"
created: 2026-09-17
status: "In Progress"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1 — Migration : enum `origin` + colonnes sur `universes`, `boards`, `tasks` | Terminé | 2026-09-17 |
| 2 — Migration : tables `oauth_clients` et `oauth_grants` (RLS, index) | Terminé | 2026-09-17 |
| 3 — Workspace `apps/mcp` : manifeste, tsconfig, vitest, lecture d'environnement | Terminé | 2026-09-17 |
| 4 — `jwt.ts` : signature des trois jetons, vérification du JWT Supabase entrant (+ tests) | Terminé | 2026-09-17 |
| 5 — `db.ts` : client PostgREST par `fetch`, pagination explicite | Terminé | 2026-09-17 |
| 6 — OAuth : métadonnées de découverte + enregistrement dynamique (`/register`) | Terminé | 2026-09-17 |
| 7 — OAuth : `/authorize` et `/authorize/decision`, PKCE S256 (+ tests) | Terminé | 2026-09-17 |
| 8 — OAuth : `/token`, échange de code et rafraîchissement avec rotation (+ tests) | Terminé | 2026-09-17 |
| 9 — Quota par autorisation, fenêtre glissante (+ tests) | Terminé | 2026-09-17 |
| 10 — Serveur MCP : transport, authentification, les 9 outils (+ tests) | Terminé | 2026-09-17 |
| 11 — App web : écran de consentement `/autoriser` + `readAuthorizeRequest()` (+ tests) | Terminé | 2026-09-17 |
| 12 — App web : modale « Applications connectées », liste et révocation | Terminé | 2026-09-17 |
| 13 — App web : `origin` dans les types et les fixtures, pastille sur tâches, matrices, univers | Terminé | 2026-09-17 |
| 14 — Extension : pastille d'origine dans le popup | Terminé | 2026-09-17 |
| 15 — Monorepo : Dockerfile MCP, manifeste copié dans le Dockerfile web, image GHCR en CI | Terminé | 2026-09-17 |
| 16 — Documentation : README MCP, `work/coolify-deploy.md`, README racine, `.env.example` | Terminé | 2026-09-17 |
| 17 — Contrôles qualité : typecheck, tests, build | Terminé | 2026-09-17 |
| 18 — Validation manuelle | En attente | |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->

### 2026-09-17 : Migration — enum `origin` + colonnes sur `universes`, `boards`, `tasks`

**Statut** : Terminé

**Actions réalisées** :
- Création de `apps/supabase/migrations/20260917160000_mcp_oauth.sql` (fichier unique pour tout le lot 1, comme prévu au plan)
- `create type public.origin as enum ('user', 'agent')`
- Trois `alter table … add column origin public.origin not null default 'user'` + `comment on column` sur chacune

**Fichiers modifiés** :
- `apps/supabase/migrations/20260917160000_mcp_oauth.sql` (nouveau)

**Notes** :
- Horodatage du fichier : `20260917160000`, postérieur à la dernière migration existante (`20260906120000_scheduler.sql`).
- `replica identity full` vérifié sur les trois tables (`20260829140000_realtime.sql:27-29`) : la colonne est portée par le temps réel sans une ligne de plus.
- Pas d'index sur `origin` : marque d'affichage, jamais critère de recherche, et deux valeurs dont l'une écrase l'autre.
- Qualification `public.` retenue (convention des migrations récentes), là où `init.sql` laissait les tables nues.

### 2026-09-17 : Migration — tables `oauth_clients` et `oauth_grants`

**Statut** : Terminé

**Actions réalisées** :
- `public.oauth_clients` : `client_id` en **clé primaire** (c'est l'unicité dont dépend la référence de `oauth_grants`), `client_name`, `redirect_uris text[]`, `created_at`, `last_used_at`. RLS activée **sans policy** + `revoke all … from anon, authenticated` (modèle `job_runs`, `20260906120000_scheduler.sql:66-78`)
- `public.oauth_grants` : `user_id` → `auth.users` (cascade), `client_id` → `oauth_clients` (cascade), `client_name` dénormalisé, `refresh_token_hash text unique`, `created_at`, `last_used_at`, `revoked_at`. Index `oauth_grants_user_idx (user_id, created_at desc)`, policy `"oauth_grants: owner"`, aucun `grant` explicite
- `comment on table` / `comment on column` sur les deux
- Migration appliquée en local (`npm run reset -w @penduline/supabase`) : les 14 migrations passent, seed compris

**Fichiers modifiés** :
- `apps/supabase/migrations/20260917160000_mcp_oauth.sql`

**Notes** :
- ⚠️ **Collision de nom avec `auth.oauth_clients`**, que GoTrue crée lui-même dans les versions récentes. Sans conséquence ici — tout est qualifié `public.` dans la migration, et PostgREST n'expose que `public` — mais une fonction `security definer` au `search_path` mutable résoudrait le mauvais nom. Règle : ne jamais écrire `oauth_clients` nu.
- `client_id` en clé primaire plutôt qu'`id uuid` + `unique` : aucun parcours ne part d'autre chose que du `client_id`, c'est lui que le client présente. Écart cosmétique au plan, qui disait « `client_id text unique` » — une PK *est* cette contrainte d'unicité.
- Droits vérifiés après application (la requête même de `penduline-migrate.sh verify`) : `oauth_clients` n'apparaît que pour `service_role`, `oauth_grants` pour `anon`/`authenticated`/`service_role` comme `tasks`. Conforme.
- Le port 54322 était pris par un autre projet Supabase (`pcb-fidfe`) : ports décalés en 5532x le temps du `reset`, puis `config.toml` **restauré** par `git checkout` (procédure du README).

### 2026-09-17 : Workspace `apps/mcp` — manifeste, tsconfig, vitest, environnement

**Statut** : Terminé

**Actions réalisées** :
- `apps/mcp/package.json` (`@penduline/mcp`), `tsconfig.json`, `vitest.config.ts` sur le modèle des workspaces existants
- `src/env.ts` : schéma zod des 8 variables, `readEnv(source)` **pure**, `loadEnv()` mémoïsé sur `process.env`
- `src/env.test.ts` : 6 tests — défauts de réglage, cumul des erreurs, secret trop court, secrets identiques, protocole d'URL
- `npm install`, puis `npm run typecheck` (monorepo) et `npm run test -w @penduline/mcp` : verts

**Fichiers modifiés** :
- `apps/mcp/package.json`, `apps/mcp/tsconfig.json`, `apps/mcp/vitest.config.ts` (nouveaux)
- `apps/mcp/src/env.ts`, `apps/mcp/src/env.test.ts` (nouveaux)
- `package-lock.json`

**Notes** :
- **Aucun framework HTTP.** Le plan ne liste que 5 dépendances, sans express ni hono : le transport du SDK prend des `req`/`res` Node bruts, et OAuth n'ajoute que six routes. `node:http` suffit, et c'est une dépendance de moins à suivre.
- `readEnv` prend sa source en **paramètre** plutôt que de lire `process.env` : même raison que `p_now` dans `penduline_tick()` — c'est ce qui la rend testable sans toucher à l'environnement du processus de test.
- Deux contrôles que le plan n'imposait pas explicitement mais qui tombent de sa décision de sécurité : **plancher de 32 caractères** sur les secrets, et **refus de `MCP_TOKEN_SECRET == SUPABASE_JWT_SECRET`** — deux secrets égaux annulent exactement la séparation qu'ils portent.
- `PORT` et les deux quotas ont un défaut (8787 / 60 / 500) : ils règlent un comportement, ils ne gardent aucun secret. Les URL et les secrets n'en ont aucun.
- Versions installées : SDK `1.30.0`, zod `4.6.5`, jose `5.10.0`, tsx `4.23.13`.
- Rien à ajouter au `build` racine : `apps/mcp` n'a pas d'étape de build (exécution par `tsx`), et `typecheck`/`test` passent déjà par `--workspaces --if-present`.

### 2026-09-17 : `jwt.ts` — les trois jetons, et l'étanchéité des deux secrets

**Statut** : Terminé

**Actions réalisées** :
- `src/jwt.ts` : fabrique `createTokens(env)` liant les secrets une fois pour toutes — `signMcpAccess` / `verifyMcpAccess` (1 h, `aud: penduline-mcp`, `iss` = URL publique), `signSupabaseUser` et `signSupabaseService` (60 s, `aud: authenticated`), `verifySupabaseUser`
- `src/jwt.test.ts` : 8 tests — forme des claims des trois jetons, durées (3600 / 60 / 60), round-trip, jeton expiré, `service_role` refusé comme utilisateur, et **les deux sens de l'étanchéité**
- Sonde manuelle contre le PostgREST local (script jeté dans le scratchpad, non versionné)

**Fichiers modifiés** :
- `apps/mcp/src/jwt.ts`, `apps/mcp/src/jwt.test.ts` (nouveaux)

**Notes** :
- **Éprouvé contre le vrai PostgREST**, pas seulement en test unitaire. Six requêtes sur l'instance locale :

  | Requête | Résultat |
  |---|---|
  | `boards` avec le jeton utilisateur de `demo@` | `200`, ses trois matrices, `origin: "user"` |
  | `boards` avec le jeton utilisateur d'`intrus@` | `200 []` — **la RLS mord sur un jeton que nous avons signé nous-mêmes** |
  | `oauth_grants` avec un jeton utilisateur | `200 []` — visible, filtrée par la policy |
  | `oauth_clients` avec un jeton utilisateur | **`403 permission denied`** — le `revoke` tient |
  | `oauth_clients` avec le jeton `service_role` | `200` |
  | `boards` avec le **jeton d'accès MCP** | **`401 PGRST301` « None of the keys was able to decode the JWT »** |

  La dernière ligne est la décision de sécurité du ticket, vérifiée contre la vraie
  implémentation et pas contre notre idée de celle-ci.
- Une **fabrique** plutôt que des fonctions libres prenant `env` en premier argument : l'appelant ne manipule aucun secret, donc il ne peut pas se tromper de secret.
- `verifySupabaseUser` contrôle explicitement `role === 'authenticated'` : c'est le seul jeton que le serveur n'a pas signé lui-même, et un `service_role` égaré ne doit pas pouvoir s'y faire passer pour un utilisateur.
- Le jeton de rafraîchissement n'est **pas** un JWT : il reste opaque, stocké en SHA-256 (`oauth_grants.refresh_token_hash`). Il arrive avec la tâche 8.

### 2026-09-17 : `db.ts` — client PostgREST par `fetch`, pagination explicite

**Statut** : Terminé

**Actions réalisées** :
- `src/db.ts` : `createDb(env, tokens)` → `asUser(userId)` / `asService()`, chacun exposant `select`, `selectAll`, `insert`, `update`
- Pagination par `limit`/`offset`, page de 1000, boucle jusqu'à une page courte
- `DbError` portant le **statut HTTP** et le message brut de PostgREST
- `src/db.test.ts` : 9 tests (pagination, en-têtes, rôle du jeton, `Prefer`, erreurs)

**Fichiers modifiés** :
- `apps/mcp/src/db.ts`, `apps/mcp/src/db.test.ts` (nouveaux)

**Notes** :
- **Pas de `@supabase/supabase-js`.** Le SDK est bâti pour un navigateur portant UNE session : un client par clé, des jetons rafraîchis, une écoute temps réel. Ici chaque requête part avec un jeton signé à la volée, valable 60 s, pour un utilisateur qui change d'un appel à l'autre — il n'y a rien à réutiliser, et `fetch` dit exactement ce qui part sur le fil.
- Le cas qui piège dans la pagination, et qui a son test : une dernière page **exactement pleine** est indistinguable d'une suite. S'arrêter là retomberait dans la troncature silencieuse de #40.
- `limit`/`offset` en paramètres d'URL plutôt que l'en-tête `Range` de `.range()` : même sémantique, une requête lisible dans un journal.
- Le message d'erreur de PostgREST est repris **tel quel** : il nomme la contrainte ou la policy qui a refusé. C'est ce qu'un agent doit lire pour corriger son appel au lieu de le rejouer à l'identique.

### 2026-09-17 : OAuth — métadonnées de découverte et enregistrement dynamique

**Statut** : Terminé

**Actions réalisées** :
- `src/http.ts` : couche HTTP minimale sur `node:http` — `lireCorps` plafonné à 1 Mo, `lireJson`, `lireFormulaire`, `json`, `redirige`, `cors`, `HttpError` (statut + code OAuth), `trouveRoute`
- `src/oauth/metadata.ts` : RFC 8414 (serveur d'autorisation) et RFC 9728 (ressource protégée)
- `src/oauth/clients.ts` : `redirectionValide`, `enregistrerClient` (RFC 7591), `lireClient`
- `src/oauth/clients.test.ts` (9 tests) et `src/oauth/metadata.test.ts` (4 tests)

**Fichiers modifiés** :
- `apps/mcp/src/http.ts`, `apps/mcp/src/oauth/metadata.ts`, `apps/mcp/src/oauth/clients.ts` (nouveaux)
- `apps/mcp/src/oauth/clients.test.ts`, `apps/mcp/src/oauth/metadata.test.ts` (nouveaux)

**Notes** :
- `http.ts` ne figurait pas dans l'arborescence du plan : il tombe de la décision « pas de framework HTTP », et sept routes fixes ne méritent pas mieux qu'un `switch`.
- **`S256` seul est annoncé.** `plain` est encore dans la RFC 7636 mais ne protège de rien — un `code_verifier` transmis en clair est exactement ce que PKCE existe pour éviter, et OAuth 2.1 l'a retiré.
- **Clients publics, aucun `client_secret`.** Un secret d'application recopié dans chaque installation n'est pas un secret ; c'est PKCE qui lie le code à celui qui l'a demandé.
- **La sévérité est concentrée sur `redirect_uri`**, pas sur l'enregistrement. S'enregistrer ne donne aucun accès — il faut qu'un utilisateur dise oui. Mais l'URI de redirection reçoit le code : `https` partout, `http` seulement sur `127.0.0.1`/`localhost` (le cas majoritaire d'un client MCP local), jamais de fragment.
- Le test du **préfixe trompeur** (`http://localhost.attaquant.test`) est là parce qu'une comparaison par `startsWith` l'aurait laissé passer ; `URL.hostname` et une égalité stricte, pas autre chose.
- `CORS` volontairement étroit sur l'origine de l'app web : `/authorize/decision` lit un jeton de session dans un en-tête, une origine `*` laisserait n'importe quelle page l'appeler.

### 2026-09-17 : OAuth — `/authorize`, `/authorize/decision`, PKCE S256

**Statut** : Terminé

**Actions réalisées** :
- `src/oauth/pkce.ts` : `defi()` (base64url(sha256)), `verifiePkce()` en comparaison **à temps constant**, bornes 43-128 de la RFC
- `src/oauth/store.ts` : demandes en attente (TTL 10 min) et codes d'autorisation (TTL 2 min), tous deux **consommés** à la lecture ; horloge injectable
- `src/oauth/authorize.ts` : `demarrerAutorisation`, `lireDemandePublique`, `deciderAutorisation`
- `src/test-doubles.ts` : `fausseDb` (filtres `eq.`/`is.null`, `limit`, représentation en écriture) et `envDeTest`
- Tests : `pkce.test.ts` (6), `store.test.ts` (6), `authorize.test.ts` (15). **62 tests au total sur `apps/mcp`**

**Fichiers modifiés** :
- `apps/mcp/src/oauth/pkce.ts`, `store.ts`, `authorize.ts` (nouveaux)
- `apps/mcp/src/test-doubles.ts` (nouveau)
- `apps/mcp/src/oauth/pkce.test.ts`, `store.test.ts`, `authorize.test.ts` (nouveaux)

**Notes** :
- **La frontière qui structure `/authorize`** : tant que `client_id` et `redirect_uri` ne sont pas vérifiés contre l'enregistrement, le serveur refuse **en dur**, sans rediriger — rediriger reviendrait à renvoyer l'utilisateur, et l'erreur, vers une adresse choisie par l'appelant. Une fois l'URI vérifiée, les autres refus (`response_type`, PKCE absent) repartent vers le client, `state` compris, comme la RFC le demande.
- **Le nom du client est rendu par le serveur, pas porté par l'URL.** Si `/autoriser` recevait `?application=…`, un lien forgé afficherait « Penduline » au-dessus de la demande de quelqu'un d'autre. L'écran ne reçoit qu'un identifiant de demande et interroge le serveur.
- L'écran n'affiche que **l'hôte** de redirection : c'est la seule partie qui dise quelque chose à un humain (« ce code part vers claude.ai »).
- `deciderAutorisation` vérifie le jeton de session **avant** de consommer la demande — un jeton invalide ne doit pas détruire un parcours légitime. Le test le verrouille.
- Une autorisation existante est **réutilisée** (pas d'empilement à chaque reconnexion) ; une autorisation **révoquée** n'est jamais ressuscitée, une nouvelle ligne est créée. La trace de la révocation reste.
- Le vecteur de test de la RFC 7636 §4.6 est recopié tel quel : si notre `defi()` dérive, c'est la RFC qui tranche, pas notre propre sortie.
- `verifiePkce` compare en **temps constant** (`timingSafeEqual`) : une comparaison naïve fuit par sa durée le nombre de caractères devinés. C'est peu, ça se mesure, et la version sûre coûte une ligne.

### 2026-09-17 : OAuth — `/token`, échange de code et rafraîchissement avec rotation

**Statut** : Terminé

**Actions réalisées** :
- `src/oauth/token.ts` : `echangerJetons` (`authorization_code` et `refresh_token`), `empreinte()` SHA-256, rotation systématique
- `src/oauth/token.test.ts` : 12 tests déroulant le parcours COMPLET (`/authorize` → consentement → code → `/token`), pas des états fabriqués à la main
- 73 tests verts sur `apps/mcp`

**Fichiers modifiés** :
- `apps/mcp/src/oauth/token.ts`, `apps/mcp/src/oauth/token.test.ts` (nouveaux)

**Notes** :
- **Le jeton de rafraîchissement n'est pas un JWT.** Il est opaque, tiré au hasard sur 32 octets, et seul son SHA-256 est en base. Un JWT serait vérifiable hors ligne, donc irrévocable avant échéance — soit exactement ce qu'un jeton de longue durée ne doit pas être.
- ⚠️ **La rotation est activée ici, alors qu'elle est DÉSACTIVÉE pour les sessions Supabase** (`config.toml`, `work/session.md`). Les deux choix sont justes et ne se contredisent pas : côté app, le même jeton vit dans deux stockages qui dérivent l'un de l'autre (PWA et onglet, puis web et extension), et la rotation les fait se révoquer mutuellement. Ici, un seul client détient le jeton et personne ne le partage — la rotation retrouve ce qu'elle apporte.
- **Limite assumée sur le rejeu** : sans garder les empreintes précédentes, le serveur ne distingue pas un jeton *rejoué* d'un jeton simplement faux, et ne peut donc pas révoquer la famille par précaution. Le bénéfice principal de la rotation reste : un jeton volé cesse de servir au premier rafraîchissement du client légitime.
- **Un seul message pour trois refus** (code inconnu / expiré / déjà échangé). Les distinguer renseignerait un attaquant sur ce qu'il a trouvé.
- L'autorisation est **relue au moment de l'échange**, pas au moment du consentement : deux minutes suffisent à changer d'avis, et le test le vérifie.

### 2026-09-17 : Quota par autorisation, en fenêtre glissante

**Statut** : Terminé

**Actions réalisées** :
- `src/quota.ts` : `createQuota(env, now)` → `verifieAppel` (par minute) et `verifieEcriture` (par jour), `QuotaError` portant un `retryAfter` en secondes
- `src/quota.test.ts` : 6 tests, horloge injectée

**Fichiers modifiés** :
- `apps/mcp/src/quota.ts`, `apps/mcp/src/quota.test.ts` (nouveaux)

**Notes** :
- **Par autorisation, pas par utilisateur** : le grain de la limite est celui de la révocation. Deux applications d'un même utilisateur ne se gênent pas, et une application emballée ne coupe pas les autres.
- **Fenêtre glissante, pas seau horaire.** Un seau se vide d'un coup au changement d'heure, ce qui autorise *deux fois* la limite à cheval sur la frontière. Le test « libère une place à mesure que la fenêtre glisse » verrouille précisément ce comportement.
- `QuotaError.retryAfter` est calculé depuis le plus ancien horodatage encore dans la fenêtre : le client sait quand réessayer au lieu de marteler.
- ⚠️ **Une seule instance**, comme pour `oauth/store.ts`. Le compteur vit en mémoire ; une seconde instance doublerait la limite effective. En sortir demanderait une écriture en base par appel — un coût réel contre un besoin qui n'existe pas.

### 2026-09-17 : Serveur MCP — transport, authentification, les neuf outils

**Statut** : Terminé

**Actions réalisées** :
- `src/mcp/tools.ts` : les neuf outils, TOUTE écriture passant par `packages/shared/src/layout.ts`
- `src/mcp/server.ts` : `McpServer` + schémas zod + `readOnlyHint` sur les trois lectures, quota d'écriture par outil
- `src/index.ts` : serveur `node:http`, huit routes, middleware d'authentification, transport sans session
- `src/mcp/tools.test.ts` : 18 tests. **97 tests verts sur `apps/mcp`**
- Sonde de bout en bout contre le Supabase LOCAL : parcours OAuth complet + appels d'outils + révocation

**Fichiers modifiés** :
- `apps/mcp/src/mcp/tools.ts`, `apps/mcp/src/mcp/server.ts`, `apps/mcp/src/index.ts` (nouveaux)
- `apps/mcp/src/mcp/tools.test.ts` (nouveau)
- `apps/mcp/src/test-doubles.ts` (signature `Record<string, object[]>`, cf. note)

**Notes** :
- **La sonde de bout en bout a validé 18 points** contre l'instance locale : découverte, `401` + `WWW-Authenticate` pointant les métadonnées, enregistrement, redirection vers `/autoriser`, écran de consentement, code + `state`, échange, code rejoué refusé, `initialize`, **les 9 outils listés**, `list_boards`, `create_task` (`origin: agent`, `quadrant: parking`), `move_task`, `complete_task`, erreur lisible sur parent inconnu, rotation, ancien jeton périmé. La base le confirme : une seule ligne `origin='agent'`, `quadrant='faire'`, `done` **et** `archived`.
- **La révocation mord immédiatement, vérifié** : appel accepté, `update oauth_grants set revoked_at = now()`, appel suivant `401` — sans attendre l'heure d'expiration du jeton d'accès. Le rafraîchissement est refusé lui aussi.
- ⚠️ **`z.guid()` et non `z.uuid()`**, et c'est la sonde qui l'a trouvé. `z.uuid()` (zod 4) impose les bits de version et de variante de la RFC 9562 ; une colonne `uuid` de Postgres accepte n'importe quel entier de 128 bits — **le seed du dépôt en contient** (`a1111111-0000-0000-0000-000000000001`), et l'outil refusait donc des identifiants parfaitement valides. La forme n'est qu'un garde-fou de frappe : c'est la RLS qui décide de l'accès.
- **Un `McpServer` et un transport NEUFS par requête.** En mode sans session, deux appels concurrents partageraient sinon leurs identifiants de requête.
- Le quota d'**appels** mord dans le middleware, avant le transport ; celui d'**écritures** dans chaque outil qui écrit. Un client emballé ne coûte donc pas un aller-retour de base par appel refusé.
- Une erreur d'outil est **rendue** (`isError`), pas levée : l'agent doit la lire pour corriger son appel. Le message de PostgREST arrive tel quel — il nomme la contrainte qui a refusé.
- `move_task` refuse de déplacer une **étape** : son classement appartient à son parent (#50), et la déplacer seule n'aurait aucun sens.
- `test-doubles.ts` prend `Record<string, object[]>` : une *interface* comme `Task` n'est pas assignable à `Record<string, unknown>` faute de signature d'index, et exiger l'un forçait un `as never` chez chaque appelant — qui aurait masqué de vraies erreurs de type.

### 2026-09-17 : App web — écran de consentement `/autoriser`

**Statut** : Terminé

**Actions réalisées** :
- `apps/web/src/lib/mcp.ts` : `MCP_URL`, `readAuthorizeRequest()` (pure), `lireDemande`, `repondreDemande`, `McpIndisponible`
- `apps/web/src/lib/mcp.test.ts` : 4 tests
- `apps/web/src/screens/Authorize.tsx` : l'écran
- `App.tsx` : `useState` paresseux sur `readAuthorizeRequest()`, branche placée **après** `!session`
- `styles.css` : `.consent-cible` et `.consent-portee` (ni animation ni survol)
- `vite-env.d.ts` et `.env.example` : `VITE_MCP_URL`

**Fichiers modifiés** :
- `apps/web/src/lib/mcp.ts`, `apps/web/src/lib/mcp.test.ts`, `apps/web/src/screens/Authorize.tsx` (nouveaux)
- `apps/web/src/App.tsx`, `apps/web/src/styles.css`, `apps/web/src/vite-env.d.ts`, `.env.example`

**Notes** :
- La branche est **après `!session`** : un visiteur déconnecté se connecte d'abord et retombe sur l'écran, l'URL n'ayant pas bougé. L'inverse lui ferait autoriser une application au nom d'une session inexistante.
- `readAuthorizeRequest` prend sa source **en paramètre** (défaut `window.location`) : les tests du dépôt tournent en environnement `node`, une lecture directe de `window` les aurait rendus impossibles sans jsdom.
- `?demande=` **vide** rend `null`, sinon l'écran s'afficherait sans pouvoir mener nulle part.
- `MCP_URL` absente ne **lève pas** à l'import : une exception y casserait toute l'application pour une fonctionnalité que l'immense majorité des chargements n'utilise pas. L'écran le dit franchement le moment venu.
- `window.location.replace` et non `assign` : revenir par « Précédent » présenterait une demande déjà tranchée, donc un écran qui ne peut que produire une erreur.
- L'écran énonce la **portée réelle** (lire ; créer, déplacer, terminer ; ni suppression définitive ni accès au compte) plutôt qu'un « accès à vos données » qui ne veut rien dire.
- CSS sans `:hover` ni `@keyframes` : les trois conventions verrouillées par `styles.test.ts` restent vertes.

### 2026-09-17 : App web — modale « Applications connectées »

**Statut** : Terminé

**Actions réalisées** :
- `apps/web/src/data/useAutorisations.ts` : hook autonome, liste les `oauth_grants` non révoquées et révoque
- `apps/web/src/components/ConnectedApps.tsx` : modale sur `useDialog` + `.bin-backdrop`, révocation derrière un `Confirm`
- `App.tsx` : bouton « Applications » dans `.userbar__right`, à côté de « Déconnexion »
- `styles.css` : `.app-row`, `.app-row__nom`, `.app-row__meta`, `.app-row__revoke`

**Fichiers modifiés** :
- `apps/web/src/data/useAutorisations.ts`, `apps/web/src/components/ConnectedApps.tsx` (nouveaux)
- `apps/web/src/App.tsx`, `apps/web/src/styles.css`

**Notes** :
- **Le hook tape PostgREST directement, sans passer par le serveur MCP**, et c'est délibéré : un serveur en panne ne doit pas empêcher de lui couper l'accès. C'est exactement ce que la policy `"oauth_grants: owner"` rend possible — et c'est pour ça qu'elle existe.
- Hook **autonome**, façon `useBinCount` / `useStats` : ces lignes ne sont ni chargées au démarrage, ni écoutées en temps réel, ni touchées par l'annulation. Les faire entrer dans `useStore` ferait payer tout le monde pour une modale ouverte trois fois par an.
- Bâtie sur `useDialog` + `.bin-backdrop` : **aucune chirurgie sur la navigation** (`View`, `readView`, `sessionStorage` intacts), et le contrat clavier complet (focus pris, `Échap`, `Tab` confiné, focus rendu) vient avec le hook.
- Révocation **optimiste** : la ligne part tout de suite, un échec la ramène avec le message. Attendre le serveur ferait paraître le clic sans effet sur une liaison lente.
- Les autorisations révoquées ne sont pas affichées mais **pas effacées** : la trace qu'un accès a existé reste en base.
- Le `Confirm` annonce ce qui compte : l'accès tombe **immédiatement**, et les tâches déjà créées restent.

### 2026-09-17 : `origin` dans les types, et la pastille « agent »

**Statut** : Terminé

**Actions réalisées** :
- `packages/shared/src/types.ts` : type `Origin`, champ `origin` sur `Universe`, `Board` et `Task`
- `packages/shared/src/test-fixtures.ts` : `origin: 'user'` dans les trois fabriques
- `apps/web/src/data/store.ts` : `origin` ajoutée à `TASK_COLS` — sans quoi la colonne n'aurait jamais été lue
- `apps/web/src/components/OriginBadge.tsx` : la pastille
- `TaskCard.tsx` (à côté de l'échéance), `Home.tsx` (pastilles de matrice, en-tête d'univers)
- `styles.css` : `.agent-badge`

**Fichiers modifiés** :
- `packages/shared/src/types.ts`, `packages/shared/src/test-fixtures.ts`
- `apps/web/src/components/OriginBadge.tsx` (nouveau)
- `apps/web/src/data/store.ts`, `apps/web/src/components/TaskCard.tsx`, `apps/web/src/screens/Home.tsx`, `apps/web/src/styles.css`

**Notes** :
- ⚠️ **`TASK_COLS` du store est une liste explicite** : ajouter la colonne aux types sans l'ajouter là aurait donné un `origin: undefined` à l'exécution, typé `Origin` à la compilation — une pastille qui ne s'affiche jamais, sans aucune erreur. Le commentaire du fichier disait déjà que cette liste avait déjà silencieusement raté `due_at` et `quadrant_changed_at`.
- Le badge **porte son texte**, il ne se distingue pas par la seule couleur : c'est déjà la règle posée pour `.due`, et la couleur seule exclut les daltoniens.
- Un violet neutre, distinct de l'accent (« bientôt ») et du rouge (« en retard ») : l'origine n'est ni un rappel ni une alerte, c'est une **provenance**.
- **Rien n'est affiché pour `'user'`** : décorer 99 % des lignes pour signaler le 1 % restant ne signalerait plus rien.
- Le groupe « Sans univers » n'a pas de pastille — ce n'est pas une ligne en base.
- Les fixtures **devaient** suivre, sinon tous les tests de `packages/shared` tombaient au typecheck. 371 tests verts sur les trois workspaces après coup.

### 2026-09-17 : Extension — pastille d'origine dans le popup

**Statut** : Terminé

**Actions réalisées** :
- `apps/extension/src/store.ts` : `origin` ajoutée à `TASK_COLS`
- `apps/extension/src/App.tsx` : la pastille, juste après le badge d'échéance
- `apps/extension/src/styles.css` : `.agent-badge`, au gabarit du popup
- `npm run build:ext` : vert

**Fichiers modifiés** :
- `apps/extension/src/store.ts`, `apps/extension/src/App.tsx`, `apps/extension/src/styles.css`

**Notes** :
- Le `TASK_COLS` de l'extension est **plus court** que celui du web (il ignore `quadrant_changed_at`, dont le popup n'a pas l'usage). Ajouter `origin` là aussi était donc nécessaire — et facile à manquer, les deux listes ne se ressemblant pas assez pour qu'on pense à la seconde.
- La pastille est **écrite en dur** plutôt qu'extraite dans un composant partagé : `packages/shared` ne contient aucun composant React, et en introduire un pour six lignes de JSX déplacerait une frontière du dépôt pour un gain nul.
- Les deux feuilles de style sont distinctes **par construction** — le popup n'hérite pas de celle du web. Les garder alignées à la main est le prix déjà payé pour `.due` ; le badge suit le gabarit local (9,5 px), pas celui du web (10,5 px), le popup ne faisant que 376 px de large.

### 2026-09-17 : Monorepo — image MCP, manifeste web, CI

**Statut** : Terminé

**Actions réalisées** :
- `apps/mcp/Dockerfile` (contexte = racine, `npm ci --omit=dev`, `tsx`, aucun build arg)
- `apps/web/Dockerfile` : `COPY apps/mcp/package.json`, plus `ARG`/`ENV VITE_MCP_URL`
- `.github/workflows/ci.yml` : second `build-push` → `ghcr.io/le-polemil/penduline-mcp`
- Image **construite et exécutée en local** : démarre, répond, échoue franchement sur configuration incomplète

**Fichiers modifiés** :
- `apps/mcp/Dockerfile` (nouveau)
- `apps/web/Dockerfile`, `.github/workflows/ci.yml`

**Notes** :
- ⚠️ **`COPY apps/mcp/package.json` dans le Dockerfile WEB** : `npm ci` échoue si un workspace déclaré à la racine n'a pas son manifeste. L'oublier casse le build de l'**app web**, pas celui du MCP — le piège déjà rencontré avec `apps/extension`.
- **`.dockerignore` laissé intact.** Il est partagé par les deux builds (même contexte) : y exclure `apps/mcp` comme on exclut `apps/extension` rendrait l'image MCP impossible à construire. Les sources MCP partent donc aussi dans l'étage de build web, où elles pèsent quelques kilo-octets et sont jetées à l'étage nginx.
- ⚠️ **Node 22 pour l'image MCP, contre Node 20 pour l'image web** — trouvé au premier `docker run` : `@penduline/shared` réexporte `./supabase`, le serveur charge donc `@supabase/supabase-js`, qui imprime au démarrage que Node ≤ 20 cessera d'être supporté. L'image web ne fait que *builder* (nginx sert le résultat, Node n'y tourne jamais) ; ici Node **est** le runtime, la distinction compte.
- **Aucun build arg sur l'image MCP** : rien n'est inliné, tout se lit au démarrage. Une image MCP est donc identique quelle que soit l'instance qui la fera tourner — changer une variable est un redémarrage, pas un rebuild. L'inverse exact de l'image web.
- Vérifié en conteneur : configuration incomplète ⇒ **sortie immédiate** listant les quatre variables manquantes d'un coup. Image : 215 Mo.
- ⚠️ **Écart à signaler, hors périmètre de la story** : `VITE_EXTENSION_ID` avait son `ARG` dans le Dockerfile web mais n'était **pas** passé en `build-args` par la CI — l'image GHCR partait donc sans, et le partage de session web → extension s'y désactive en silence. La ligne a été ajoutée en même temps que `VITE_MCP_URL`, qui souffrirait du même trou. À retirer si ce n'était pas voulu.

### 2026-09-17 : Documentation

**Statut** : Terminé

**Actions réalisées** :
- `apps/mcp/README.md` : décisions, tableau des trois jetons, les neuf outils, variables, démarrage local, `claude mcp add`, exécution par `tsx`, limites assumées
- `work/coolify-deploy.md` : section « La ressource MCP (#23) » — type de ressource, domaine et DNS, variables, build arg web, mémoire
- `README.md` racine : `apps/mcp/` dans la structure, paragraphe d'état, URL de prod
- `.env.example` : `VITE_MCP_URL` (fait en tâche 11)

**Fichiers modifiés** :
- `apps/mcp/README.md` (nouveau), `work/coolify-deploy.md`, `README.md`

**Notes** :
- Le README MCP dit aussi ce que l'agent **ne peut pas** faire (supprimer, vider la corbeille, toucher au compte, voir les matrices d'un autre) — et d'où vient chaque garantie. La dernière ne vient pas du code de ce dossier mais des policies RLS, et il vaut mieux l'écrire que de laisser croire l'inverse.
- Les deux limites assumées sont documentées **là où on les cherchera** : une seule instance (mémoire partagée), et l'absence de détection de rejeu sur le jeton de rafraîchissement.
- La section Coolify tranche le **type de ressource** : « Docker Image ». La bascule n'avait jamais été faite pour le web parce qu'elle imposait de recréer la ressource et de transférer le domaine ; ici la ressource n'existe pas encore, donc le bon choix ne coûte rien — et la machine s'est effondrée deux fois pendant un build.

### 2026-09-17 : Contrôles qualité

**Statut** : Terminé

**Résultats** :

| Contrôle | Résultat |
|---|---|
| Horodatages de migration uniques (garde-fou CI) | ✅ aucun doublon |
| `npm run typecheck` (4 workspaces) | ✅ |
| `npm test` — `@penduline/shared` | ✅ 233 passés, 5 ignorés (`realtime.live`, préexistant) |
| `npm test` — `@penduline/mcp` | ✅ **97 passés** |
| `npm test` — `@penduline/web` | ✅ 41 passés |
| `npm run build` (shared + web + extension) | ✅ |
| `docker build` image MCP + démarrage | ✅ (tâche 15) |

**Notes** :
- Le dépôt n'a **pas de linter** : la qualité y tient au typecheck strict (`noUnusedLocals`, `noUnusedParameters`) et aux tests. Rien à lancer de plus, et rien n'a été ajouté pour l'occasion.
- 371 tests au total, dont 97 nouveaux sur `apps/mcp` et 4 sur `apps/web`.
- Les trois conventions verrouillées par `styles.test.ts` (aucune `@keyframes` orpheline, plancher `prefers-reduced-motion`, aucun `:hover` hors garde) restent vertes avec le CSS ajouté.
