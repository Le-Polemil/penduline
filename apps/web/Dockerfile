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

# L'extension à qui pousser la session (#107). Inlinée elle aussi, donc build arg.
#
# ⚠️ Son absence ne casse RIEN et ne se voit NULLE PART : le partage de session
# se désactive en silence, par conception (`apps/web/src/lib/extension-bridge.ts`).
# C'est précisément ce qui la rend facile à oublier — d'où ce commentaire.
ARG VITE_EXTENSION_ID
ENV VITE_EXTENSION_ID=$VITE_EXTENSION_ID

# Manifests d'abord : la couche `npm ci` reste en cache tant qu'ils ne bougent pas.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
COPY apps/extension/package.json apps/extension/
COPY apps/supabase/package.json apps/supabase/
RUN npm ci --no-audit --no-fund

COPY . .

# Volontairement `vite build` seul, PAS `npm run build -w @penduline/web` : ce
# script enchaîne `tsc --noEmit && vite build`, soit deux process Node gourmands.
# Le typecheck tourne déjà en CI (.github/workflows) et en local — le refaire ici
# doublait la pression mémoire, ce qui a suffi à saturer l'hôte de prod, qui
# héberge aussi la stack Supabase.
# Le plafond de tas garde le build sous contrôle sur une petite machine.
WORKDIR /app/apps/web
RUN NODE_OPTIONS=--max-old-space-size=512 npx vite build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
