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
| 1 — Migration : enum `origin` + colonnes sur `universes`, `boards`, `tasks` | En attente | |
| 2 — Migration : tables `oauth_clients` et `oauth_grants` (RLS, index) | En attente | |
| 3 — Workspace `apps/mcp` : manifeste, tsconfig, vitest, lecture d'environnement | En attente | |
| 4 — `jwt.ts` : signature des trois jetons, vérification du JWT Supabase entrant (+ tests) | En attente | |
| 5 — `db.ts` : client PostgREST par `fetch`, pagination explicite | En attente | |
| 6 — OAuth : métadonnées de découverte + enregistrement dynamique (`/register`) | En attente | |
| 7 — OAuth : `/authorize` et `/authorize/decision`, PKCE S256 (+ tests) | En attente | |
| 8 — OAuth : `/token`, échange de code et rafraîchissement avec rotation (+ tests) | En attente | |
| 9 — Quota par autorisation, fenêtre glissante (+ tests) | En attente | |
| 10 — Serveur MCP : transport, authentification, les 9 outils (+ tests) | En attente | |
| 11 — App web : écran de consentement `/autoriser` + `readAuthorizeRequest()` (+ tests) | En attente | |
| 12 — App web : modale « Applications connectées », liste et révocation | En attente | |
| 13 — App web : `origin` dans les types et les fixtures, pastille sur tâches, matrices, univers | En attente | |
| 14 — Extension : pastille d'origine dans le popup | En attente | |
| 15 — Monorepo : Dockerfile MCP, manifeste copié dans le Dockerfile web, image GHCR en CI | En attente | |
| 16 — Documentation : README MCP, `work/coolify-deploy.md`, README racine, `.env.example` | En attente | |
| 17 — Contrôles qualité : typecheck, tests, build | En attente | |
| 18 — Validation manuelle | En attente | |

## Journal

<!-- Les entrées seront ajoutées ici au fur et à mesure du développement -->
