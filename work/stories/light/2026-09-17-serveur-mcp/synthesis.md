---
story: "Serveur MCP Penduline"
story_code: "serveur-mcp"
created: 2026-09-17
completed: 2026-09-22
status: "Done"
---

# Synthèse

## Résumé

Penduline expose ses matrices à un agent : neuf outils MCP derrière un parcours
OAuth 2.1 complet. On donne une URL à un client, il découvre le reste seul —
métadonnées, enregistrement dynamique, PKCE, écran de consentement dans
l'application web, jetons. **Aucun jeton copié à la main nulle part.**

Ce qu'un agent crée porte une marque `origin = 'agent'`, visible dans
l'application web et dans l'extension. L'utilisateur voit ses applications
connectées et leur coupe l'accès d'un clic — l'effet est immédiat.

## Les décisions qui ont structuré le travail

**OAuth plutôt qu'un jeton personnel.** Le ticket envisageait un jeton collé dans
la configuration du client. Le coût d'OAuth est payé une fois, ici ; celui du
jeton personnel se paie à chaque client et à chaque rotation.

**Trois jetons, deux secrets — la décision de sécurité du ticket.** Un jeton
d'accès MCP (1 h, `MCP_TOKEN_SECRET`) n'a *aucune* valeur contre PostgREST ; les
jetons Supabase (60 s, `SUPABASE_JWT_SECRET`) portent l'utilisateur ou le
`service_role`. Sans cette séparation, un client court-circuiterait le serveur —
donc les outils, le quota et la révocation. Le serveur refuse de démarrer si les
deux secrets sont égaux. **Vérifié contre le vrai PostgREST** : un jeton MCP y
reçoit `401 PGRST301`.

**60 secondes, pour la raison déjà écrite dans `config.toml`.** PostgREST valide
hors ligne : la durée d'un JWT est exactement la fenêtre pendant laquelle une
révocation reste sans effet. Chaque appel relit `oauth_grants` avant de signer —
la révocation mord sans attendre l'heure du jeton d'accès, mesuré.

**Aucune règle métier réécrite.** Positions, appairage, sortie d'une tâche :
tout passe par `packages/shared/src/layout.ts`. Les dupliquer côté serveur est le
défaut qui a déjà mordu entre le web et le popup.

**Rotation du jeton de rafraîchissement — l'inverse du choix fait pour les
sessions Supabase**, et les deux sont justes : là-bas le même jeton vit dans deux
stockages qui se révoqueraient mutuellement, ici un seul client le détient.

**Ni express ni hono.** Le transport du SDK prend des `req`/`res` Node bruts et
OAuth n'ajoute que six chemins. Exécution par `tsx`, sans étape de build, pour
suivre `packages/shared` consommé en source.

## Changements réalisés

- **Base** : enum `origin` et colonne sur `universes`/`boards`/`tasks` ; tables
  `oauth_clients` (RLS sans policy + `revoke`, modèle `job_runs`) et
  `oauth_grants` (policy propriétaire — c'est elle qui permet de révoquer sans
  passer par le serveur MCP).
- **`apps/mcp`** : environnement validé au démarrage, JWT, client PostgREST
  paginé, métadonnées, `/register`, `/authorize`, `/authorize/decision`,
  `/token`, quota en fenêtre glissante, serveur MCP et ses neuf outils.
- **App web** : écran de consentement `/autoriser`, modale « Applications
  connectées », pastille « agent » sur tâches, matrices et univers.
- **Extension** : la même pastille dans le popup.
- **Monorepo** : `Dockerfile` MCP, manifeste copié dans le `Dockerfile` web,
  seconde image GHCR en CI, documentation.

## Tests et validation

| | |
|---|---|
| Typecheck (4 workspaces) | ✅ |
| Tests | ✅ **385** — dont 105 nouveaux sur `apps/mcp` |
| Build (shared + web + extension) | ✅ |
| Image Docker MCP | ✅ construite, démarrée, échec franc sur configuration incomplète |
| Sonde de bout en bout (local) | ✅ 18 points, parcours OAuth complet + outils + révocation |
| Validation manuelle | 🟡 **partielle** — voir `dev.md` |

Le parcours a été joué par un vrai client (Claude Code) : enregistrement,
consentement, échange, appels d'outils ayant créé une matrice et une tâche
marquées `agent`. Reste à confirmer visuellement les pastilles, la modale et
l'extension.

## Ce qui reste dehors, et pourquoi

- **MCP Apps** (interface servie par le serveur) — ticket #149.
- **Portées de jeton** (lecture seule / écriture) : le consentement est
  aujourd'hui tout ou rien.
- **Quota partagé entre instances.** Les demandes en cours, les codes et les
  compteurs vivent en mémoire : le serveur tient sur **une seule instance**.
  En sortir demande une table et une écriture de plus par appel.
- **Détection de rejeu du jeton de rafraîchissement** : la rotation est active,
  mais faute de garder les empreintes précédentes, un rejeu ne se distingue pas
  d'un jeton faux, et la famille n'est pas révoquée par précaution.
- **Elicitation MCP** (faire poser une question par le serveur, par exemple « dans
  quelle matrice ? ») : impossible avec notre transport **sans session** — la
  réponse du client arriverait sur un transport neuf qui n'a rien demandé. Demande
  de passer en mode avec session. À discuter dans un ticket à part.

## Notes pour la suite

Deux incidents pendant la recette, tous deux de configuration : le serveur ne
lisait pas le `.env` racine (corrigé), et `SUPABASE_URL` pointait sur le port
d'un autre projet Supabase de la machine. Le second rappelle que `SUPABASE_URL`
désigne **Kong**, pas Postgres, et que le port doit être vérifié avec
`docker ps` plutôt qu'avec `supabase status` quand `config.toml` a été décalé.
