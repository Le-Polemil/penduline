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
  → Contournement levé depuis, voir « SMTP » plus bas (#33).

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

## SMTP et e-mails transactionnels

**L'absence de SMTP n'était pas un détail de configuration : elle rendait la
récupération de compte impossible.** Sans elle, `resetPasswordForEmail()`
n'envoie rien, et un utilisateur qui oublie son mot de passe perd son compte
définitivement. C'est ce qui a motivé #33.

**Fournisseur : Resend.** GoTrue n'a besoin que d'identifiants SMTP — il envoie
lui-même, aucun conteneur supplémentaire. Sur une machine à 4 Go déjà en tension
(voir plus bas), c'est la seule forme d'envoi d'e-mail acceptable : héberger un
serveur mail ici était exclu d'avance.

Variables sur le service `supabase-auth`, sans préfixe comme le reste de la
configuration Coolify (le compose les mappe vers les `GOTRUE_*`) :

```
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=<clé API Resend>
SMTP_ADMIN_EMAIL=penduline@polemil.dev
SMTP_SENDER_NAME=Penduline
```

Prérequis Resend : vérifier le domaine `polemil.dev` (SPF + DKIM). Sans cette
vérification, les envois partent en spam ou sont refusés.

**Gabarits en français**, servis en statique par l'app web — même mécanisme que
`/confidentialite/`, donc versionnés dans le dépôt et déployés avec le front :

```
MAILER_SUBJECTS_RECOVERY=Réinitialiser votre mot de passe Penduline
MAILER_TEMPLATES_RECOVERY=https://penduline.polemil.dev/emails/recovery.html
MAILER_SUBJECTS_CONFIRMATION=Confirmez votre adresse — Penduline
MAILER_TEMPLATES_CONFIRMATION=https://penduline.polemil.dev/emails/confirmation.html
```

⚠️ Ces quatre variables **ne figurent pas dans le compose Supabase standard** :
il faut les ajouter au passage d'environnement du service `auth`. C'est le seul
point de #33 qui touche au compose, déjà modifié par le dégraissage.

⚠️ `GOTRUE_URI_ALLOW_LIST` doit contenir `https://penduline.polemil.dev`, sinon
GoTrue refuse le `redirectTo` envoyé par le client et le lien devient inerte.

**Ordre d'exécution.** Configurer le SMTP **puis** vérifier le parcours de
réinitialisation de bout en bout, et seulement ensuite repasser
`ENABLE_EMAIL_AUTOCONFIRM=false`. L'inverse enfermerait dehors tout nouvel
inscrit si l'envoi ne fonctionnait pas.

Les comptes existants ont tous été créés en autoconfirm : ils restent confirmés
et connectables. Aucune migration n'est nécessaire.

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

## Déclencher un déploiement

`.github/workflows/deploy.yml` appelle l'API Coolify. Il remplace le clic dans
l'UI, pas le jugement : il est en **`workflow_dispatch` seul**, jamais sur push.

**Pourquoi manuel.** Un déploiement recrée les conteneurs sur une machine à 4 Go
qui s'est effondrée deux fois pendant un build. Déployer automatiquement à chaque
merge, ce serait tirer à l'aveugle sur le serveur plusieurs fois par jour. La
règle « à froid, avec de la marge » ne se délègue pas à un `on: push`.

**Prérequis, à créer une fois** dans Settings › Secrets and variables › Actions :

| Nom | Onglet | Valeur |
|---|---|---|
| `COOLIFY_TOKEN` | Secrets | jeton API Coolify (Keys & Tokens › API tokens) |
| `COOLIFY_RESOURCE_UUID` | Variables | UUID de la ressource web, lisible dans son URL Coolify |

**Le workflow doit être sur `main` pour apparaître dans l'onglet Actions.**
`workflow_dispatch` n'expose que les workflows présents sur la branche par
défaut : tant que ce fichier vit dans une PR, aucun bouton n'existe.

**Il ne déploie pas le commit du runner.** Coolify redéploie ce que *sa* ressource
suit, c'est-à-dire `main`. Le workflow refuse donc de se lancer depuis une autre
branche, pour ne pas laisser croire qu'il déploierait celle-ci.

**Le suivi va jusqu'à l'app.** Le job attend la fin réelle du déploiement (statut
Coolify), puis vérifie que `penduline.polemil.dev` répond `200` : un déploiement
peut se terminer « avec succès » et continuer à servir l'ancien conteneur.

⚠️ La forme exacte des réponses de l'API Coolify (`deployments[].deployment_uuid`,
statut `finished`) varie selon les versions mineures. Le workflow tolère les deux
formes connues et se contente d'un avertissement s'il ne sait pas suivre — le
déclenchement, lui, reste effectif. À revalider au premier vrai run.
