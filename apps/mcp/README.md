# Serveur MCP — `apps/mcp`

Expose les matrices Penduline à un agent (Claude, ou tout client parlant
[MCP](https://modelcontextprotocol.io)) : neuf outils, derrière un parcours
OAuth 2.1 que l'utilisateur accepte depuis l'application web.

## Ce qui a guidé la conception

**OAuth plutôt qu'un jeton personnel collé à la main.** Un jeton personnel
demande à l'utilisateur de le fabriquer, de le copier dans un fichier de
configuration, et de le refaire à chaque client. Avec OAuth, on donne une URL au
client : il se découvre, s'enregistre, ouvre l'écran de consentement, et c'est
fini. Le prix est ici, dans ce dossier — il n'est payé qu'une fois.

**Trois jetons, deux secrets, et c'est la décision de sécurité du ticket.**

| Jeton | Signé avec | Durée | Rôle |
|---|---|---|---|
| Jeton d'accès MCP | `MCP_TOKEN_SECRET` | 1 h | Ce que le client présente. **Sans aucune valeur contre PostgREST.** |
| JWT `authenticated` | `SUPABASE_JWT_SECRET` | 60 s | Agir au nom de l'utilisateur : les policies RLS existantes s'appliquent telles quelles. |
| JWT `service_role` | `SUPABASE_JWT_SECRET` | 60 s | Un seul usage : lire `oauth_clients` / `oauth_grants`. Ne touche jamais une donnée métier. |

Deux secrets distincts, pas un : sans ça, un client court-circuiterait le serveur
et taperait la base directement, en contournant les outils, le quota et la
révocation. Le serveur refuse d'ailleurs de démarrer si les deux sont égaux.

Les 60 s reprennent le raisonnement déjà écrit dans `apps/supabase/config.toml` :
PostgREST valide un JWT **hors ligne**, il ne peut pas savoir qu'il a été
révoqué. Sa durée de vie est exactement la fenêtre pendant laquelle une
révocation reste sans effet — ici, un appel.

**La révocation mord immédiatement.** Chaque appel relit `oauth_grants` avant de
signer quoi que ce soit. Un appel fait de toute façon des requêtes ; ce `select`
de plus évite qu'une application révoquée continue d'écrire pendant une heure.

**Aucune règle métier n'est réécrite ici.** Positions fractionnaires, appairage,
sortie d'une tâche : tout passe par `packages/shared/src/layout.ts`. Les
dupliquer côté serveur est exactement le défaut que ce dossier doit éviter — il
s'est déjà produit entre le web et le popup, corrigé d'un côté et oublié de
l'autre pendant plusieurs jours.

## Les neuf outils

| Outil | Ce qu'il fait |
|---|---|
| `list_universes`, `list_boards` | Lecture, triée par position. |
| `list_tasks` | Les tâches **ouvertes** d'une matrice. `tout: true` rend aussi terminées, supprimées et étapes. Pagination explicite : PostgREST tronque à 1000 lignes sans rien dire. |
| `create_universe`, `create_board` | En fin de liste, marqués `origin: 'agent'`. |
| `create_task` | En fin de case ; sans `quadrant`, au parking « à trier ». Avec `parent_id`, devient une étape et hérite de la case du parent. |
| `update_task` | Titre et échéance, **sur la tâche visée uniquement** — jamais sur sa partenaire de paire. |
| `move_task` | Change de case ou de matrice ; la partenaire suit. N'écrit jamais `quadrant_changed_at` (le trigger le tient). |
| `complete_task` | Coche **et** archive en une seule écriture ; le lien de paire se défait des deux côtés. |

Les trois lectures portent `readOnlyHint`.

Tout ce que l'agent crée porte `origin = 'agent'`, et l'application web comme
l'extension affichent une pastille « agent » sur ces lignes.

**Ce que l'agent ne peut pas faire** : supprimer (même en douceur), vider la
corbeille, toucher au compte, ou lire les matrices d'un autre utilisateur — cette
dernière garantie ne vient pas du code de ce dossier mais des policies RLS, que
le jeton de 60 s subit comme n'importe quel client.

## Variables d'environnement

Toutes lues et validées **au démarrage** : une configuration incomplète fait
sortir le process en listant d'un coup tout ce qui manque. Aucune valeur par
défaut sur une URL ou un secret.

| Variable | Obligatoire | Rôle |
|---|---|---|
| `SUPABASE_URL` | oui | Kong, pas Postgres — le serveur parle à PostgREST comme n'importe quel client. |
| `SUPABASE_ANON_KEY` | oui | Kong exige l'en-tête `apikey`, même sur une requête déjà porteuse d'un JWT. |
| `SUPABASE_JWT_SECRET` | oui | Vérifie le JWT entrant, signe les deux jetons de 60 s. **≥ 32 caractères.** |
| `MCP_TOKEN_SECRET` | oui | Signe le jeton d'accès MCP. **Distinct du précédent**, ≥ 32 caractères. |
| `MCP_PUBLIC_URL` | oui | L'URL publique, telle que les métadonnées l'annoncent. |
| `WEB_APP_URL` | oui | L'application web, vers laquelle `/authorize` renvoie pour le consentement. |
| `PORT` | non (8787) | |
| `MCP_QUOTA_CALLS_PER_MINUTE` | non (60) | Par autorisation, fenêtre glissante. |
| `MCP_QUOTA_WRITES_PER_DAY` | non (500) | Idem. |

Côté application web, `VITE_MCP_URL` doit pointer ici — **variable de build**,
Vite l'inline (voir `.env.example`).

## Démarrage local

```bash
# Supabase local démarré (voir apps/supabase/README.md), puis :
SUPABASE_URL=http://127.0.0.1:54321 \
SUPABASE_ANON_KEY="$(npm run --silent status -w @penduline/supabase | grep -A1 'anon key' | tail -1)" \
SUPABASE_JWT_SECRET='super-secret-jwt-token-with-at-least-32-characters-long' \
MCP_TOKEN_SECRET='un-autre-secret-de-32-caracteres-au-moins' \
MCP_PUBLIC_URL=http://127.0.0.1:8787 \
WEB_APP_URL=http://localhost:5173 \
npm run dev -w @penduline/mcp
```

Le secret JWT local est celui du CLI Supabase, en clair et identique partout —
il n'a rien à protéger sur une machine de développement.

```bash
npm run test -w @penduline/mcp       # 97 tests
npm run typecheck -w @penduline/mcp
```

## Brancher un client

```bash
claude mcp add --transport http penduline https://mcp.penduline.polemil.dev/mcp
```

Le client découvre le reste tout seul : au premier appel il reçoit un `401`
portant `WWW-Authenticate: Bearer resource_metadata="…"`, lit les métadonnées,
s'enregistre, et ouvre l'écran de consentement dans le navigateur. Rien à copier
à la main.

Les applications autorisées se retrouvent dans l'application web, bouton
**Applications** de la barre du haut — avec un bouton « Révoquer » qui coupe
l'accès sur-le-champ.

## Exécution

`tsx`, sans étape de build. `packages/shared` se consomme en **source**
(`main: ./src/index.ts`) : un bundler devrait être configuré pour l'y suivre,
alors que `tsx` le fait nativement. Coût : une dépendance de production de plus.
Gain : aucune décision de bundling à maintenir, et le même mode de démarrage en
local et en image.

## Limites assumées

**Une seule instance.** Les demandes d'autorisation en cours, les codes
d'autorisation et les compteurs de quota vivent en mémoire. Une seconde instance
doublerait la limite effective et casserait un parcours de consentement à cheval
sur les deux. En sortir demanderait une table et une écriture de plus par appel.

**Pas de détection de rejeu sur le jeton de rafraîchissement.** La rotation est
active — le jeton rendu au précédent échange cesse de valoir — mais faute de
garder les empreintes précédentes, le serveur ne distingue pas un rejeu d'un
jeton simplement faux, et ne révoque donc pas la famille par précaution.

> À noter : c'est l'**inverse** du choix fait pour les sessions Supabase, où la
> rotation est désactivée (`config.toml`, `work/session.md`). Les deux sont
> justes : là-bas le même jeton vit dans deux stockages qui dérivent l'un de
> l'autre et se révoqueraient mutuellement ; ici un seul client le détient.
