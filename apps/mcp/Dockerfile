# Serveur MCP — contexte de build = RACINE du monorepo, pour la même raison que
# l'app web : `packages/shared` est consommé en SOURCE, et npm doit résoudre les
# workspaces.
# syntax=docker/dockerfile:1

# ⚠️ Node 22, pas 20 comme l'image web.
#
# La différence n'est pas cosmétique : l'image web ne fait que BUILDER (son
# résultat est servi par nginx, Node n'y tourne jamais), alors qu'ici Node EST
# le runtime. Et `@penduline/shared` réexporte `./supabase`, donc le serveur
# charge `@supabase/supabase-js`, qui avertit déjà que Node ≤ 20 cessera d'être
# supporté. Vu au premier `docker run` : l'avertissement est imprimé au démarrage.
FROM node:22-alpine
WORKDIR /app

# Aucun ARG ici, et c'est la différence avec l'app web : rien n'est inliné dans
# un bundle, tout se lit au démarrage depuis l'environnement (`src/env.ts`).
# Changer une variable est donc un redémarrage, pas un rebuild.

# Manifests d'abord : la couche `npm ci` reste en cache tant qu'ils ne bougent pas.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/mcp/package.json apps/mcp/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY apps/supabase/package.json apps/supabase/
# `--omit=dev` : le serveur tourne par `tsx`, sans étape de compilation. Ni
# TypeScript ni Vitest n'ont quoi que ce soit à faire dans l'image.
RUN npm ci --omit=dev --no-audit --no-fund

COPY packages/shared packages/shared
COPY apps/mcp apps/mcp

WORKDIR /app/apps/mcp
# Pas de build : `tsx` lit le TypeScript directement, et suit `packages/shared`
# jusqu'à ses sources sans qu'aucun bundler n'ait à être configuré pour ça.
ENV NODE_ENV=production
EXPOSE 8787
CMD ["npx", "tsx", "src/index.ts"]
