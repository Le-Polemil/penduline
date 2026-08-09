# Build de l'app web (Vite/React) — contexte de build = RACINE du monorepo,
# car les workspaces npm (packages/shared) doivent être résolus.
# syntax=docker/dockerfile:1

FROM node:20-alpine AS build
WORKDIR /app

# Les clés Supabase sont PUBLIQUES (la sécurité repose sur les policies RLS),
# mais Vite les inline dans le bundle : elles doivent être là au BUILD, pas au run.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# Manifests d'abord : la couche `npm ci` reste en cache tant qu'ils ne bougent pas.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY apps/supabase/package.json apps/supabase/
RUN npm ci

COPY . .
RUN npm run build -w @penduline/web

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
