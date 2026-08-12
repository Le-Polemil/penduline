# Déploiement Coolify (coolify.polemil.dev)

Objectif : `penduline.polemil.dev` (app web) + Supabase self-hosted sur
`api.penduline.polemil.dev`, tous deux sur le serveur `localhost` de Coolify
(82.165.0.213).

## Décisions

**Dockerfile plutôt que Nixpacks / build pack statique.** Le monorepo npm
workspaces (`packages/shared` consommé en *source*, pas en `dist`) rend les
build packs auto-détectés fragiles. Le contexte de build est la **racine** du
repo, pas `apps/web` : sinon `npm ci` ne résout pas les workspaces.

**Les clés Supabase sont des build args, pas des variables runtime.** Vite les
inline dans le bundle : `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` doivent
être présentes au `docker build`, les injecter au run n'a aucun effet. Corollaire :
changer d'URL Supabase impose un **rebuild**, pas un simple restart.

**`.dockerignore` exclut `apps/extension` mais ré-inclut son `package.json`.**
`npm ci` échoue si un workspace déclaré dans le `package.json` racine n'a pas son
manifeste — même si l'extension ne sert pas au build web.

## Gotchas

**Le wildcard DNS `*.polemil.dev` ne couvre pas `api.penduline.polemil.dev`.**
Un wildcard DNS ne matche qu'**un seul** label. Un enregistrement dédié a été créé.

**Le domaine Kong doit porter le port : `https://api.penduline.polemil.dev:8000`.**
Coolify utilise la syntaxe `fqdn:port` pour savoir vers quel port conteneur router.
Sans le `:8000`, le routage Traefik ne pointe pas sur Kong.

**Le template Supabase de Coolify sort mal configuré pour un usage externe :**
- `API_EXTERNAL_URL` valait `http://supabase-kong:8000` (URL *interne*) → corrigé
  vers l'URL publique, sinon GoTrue fabrique des liens inatteignables.
- `GOTRUE_SITE_URL` pointait sur l'URL de l'API → corrigé vers l'app web.
- `ENABLE_EMAIL_AUTOCONFIRM=false` **sans SMTP configuré** : `signUp()` crée un
  utilisateur jamais confirmé, donc impossible à connecter. Passé à `true`.

**Le `.env` racine est partagé web + extension : le pointer sur la prod fait que
`npm run dev` tape aussi la prod.** C'est le prix du `envDir` commun. Pour
retrouver un dev local, remettre les valeurs de
`npm run status -w @penduline/supabase` — ou builder l'extension à la volée avec
`VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npm run build:ext` (Vite lit aussi
les variables `VITE_*` de `process.env`).

**`host_permissions` de l'extension listait uniquement `https://*.supabase.co/*`,**
qui ne matche pas l'instance auto-hébergée. Non bloquant en pratique (Kong renvoie
`Access-Control-Allow-Origin: *`), mais faux — corrigé, et `http://127.0.0.1/*`
ajouté pour le dev local. Rappel : les *match patterns* Chrome n'acceptent pas de
port, donc pas de `:54321`.

**Le renommage `rooms` → `boards` impose un déploiement couplé.** Le front
interroge `boards` ; la migration renomme la table. Tant que l'un des deux est en
retard, l'app est cassée. Appliquer la migration **puis** déployer, sans traîner
entre les deux (fenêtre de casse de quelques secondes, assumée : app perso).

**Conséquence de l'autoconfirm : l'inscription est ouverte.** `DISABLE_SIGNUP`
vaut `false` ; n'importe qui atteignant l'API peut créer un compte fonctionnel
(ses données restent isolées par les policies RLS). À basculer à `true` une fois
les comptes voulus créés — ou configurer SMTP et repasser autoconfirm à `false`.

## La machine est le facteur limitant

4 Go de RAM, 2 vCPU, avec Supabase auto-hébergé (14 conteneurs), Coolify et
d'autres sites. Le serveur s'est effondré **deux fois** pendant un build de
l'app : les ports TCP restaient ouverts mais plus aucune requête HTTP
n'aboutissait — signature d'une machine qui swappe, pas d'un CPU saturé. La
deuxième fois SSH est tombé aussi, et il a fallu redémarrer depuis la console.

Mesure au moment de l'incident : **273 Mo disponibles, swap plein à 100 %**
(2047/2047). Plus rien pour absorber le pic d'un `npm ci`. Ajouter du swap
n'était donc pas le correctif : il y en avait déjà, et il était saturé.

**Ce n'est pas Docker.** Les 714 Mo de Logflare sont le tas préalloué de sa VM
Elixir ; il coûterait autant hors conteneur. Et l'app web est un bundle statique
de 370 Ko. Le poids, c'est Supabase au repos.

## Dégraissage de Supabase

Penduline n'utilise que PostgREST et GoTrue. Sept services retirés du compose —
analytics (Logflare, 714 Mo à lui seul), vector, supavisor, storage, minio,
imgproxy, edge-functions — soit **~1 Go récupéré** : de 273 Mo à ~1,5 Go
disponibles.

**Piège :** `supabase-analytics` était déclaré en `depends_on ... service_healthy`
par huit services, et `supabase-db` dépendait de `supabase-vector`. Il faut
retirer ces dépendances en même temps que les services, **et supprimer la clé
`depends_on` devenue vide** — un `depends_on:` sans entrée empêche le démarrage.

**Deux avertissements.** Le compose est désormais **modifié à la main** dans
Coolify : une mise à jour du template Supabase l'écraserait. Et redéployer une
stack recrée les conteneurs, donc provoque un pic — c'est cette opération qui a
tué la machine la deuxième fois. La faire à froid, avec de la marge.

## CI et image GHCR

`.github/workflows/ci.yml` typecheck et build à chaque PR, puis **construit et
pousse l'image sur GHCR depuis `main`**. Le typecheck vit là parce qu'il a été
retiré du Dockerfile, où il doublait le pic mémoire. Aucun secret à créer :
Actions fournit son `GITHUB_TOKEN`, il suffit de `packages: write`. Les clés Vite
passent par des variables de dépôt, et leur absence **fait échouer le job**
plutôt que de publier une image muette.

`ghcr.io/le-polemil/penduline-web:latest` est publiquement tirable, et validée
localement (bundle correct, clés inlinées).

**Bascule non faite, volontairement.** « Docker Image » n'est pas un build pack
dans Coolify mais un *type de ressource*, choisi à la création : la ressource
existante n'est pas convertible. Il faudrait en créer une nouvelle, lui
transférer `penduline.polemil.dev` (après l'avoir retiré de l'actuelle, sinon
Traefik voit deux fois le même domaine), puis supprimer l'ancienne. À faire à
froid. En attendant, l'image publiée sert de filet.
