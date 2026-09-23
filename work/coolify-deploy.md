# Déploiement Coolify (coolify.polemil.dev)

Objectif : `penduline.polemil.dev` (app web) + Supabase self-hosted sur
`api.penduline.polemil.dev`, tous deux sur le serveur `localhost` de Coolify
(82.165.0.213).

## Décisions

**Dockerfile plutôt que Nixpacks / build pack statique.** Le monorepo npm
workspaces (`packages/shared` consommé en *source*, pas en `dist`) rend les
build packs auto-détectés fragiles. Le contexte de build est la **racine** du
repo, pas `apps/web` : sinon `npm ci` ne résout pas les workspaces.

**`VITE_EXTENSION_ID` est un build arg lui aussi** — l'ID de l'extension Chrome à
qui l'app web pousse sa session (#107). Valeur du Store :
`bloodkencammifmhmogffodjalepoime`.

⚠️ **Son absence ne casse rien et ne se voit nulle part** : le partage de session
se désactive en silence, par conception. C'est ce qui la rend facile à oublier —
et elle a effectivement été oubliée à la livraison de #107, où le `ARG` manquait
carrément dans le Dockerfile. La poser dans Coolify sans le `ARG` n'aurait servi
à rien.

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

## Durée de connexion : la rotation des refresh tokens est DÉSACTIVÉE

`apps/supabase/config.toml` ne pilote que le Supabase **local** : le réglage doit
être repris à la main sur le service `supabase-auth`, sans quoi la production
garde l'ancien comportement.

```yaml
# Coolify → la ressource Supabase → l'éditeur de compose, service `supabase-auth`,
# bloc `environment:`. Puis redéployer LE SERVICE.
GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED: "false"
```

⚠️ **À ajouter au compose, pas seulement en variable Coolify.** La variable est
aujourd'hui **absente** du conteneur : il n'existe donc aucune ligne
`GOTRUE_… : ${…}` à alimenter. Poser une variable Coolify sans ajouter le passage
correspondant dans `environment:` n'aurait aucun effet — c'est le même piège que
les quatre variables de gabarit d'e-mail, plus bas.

⚠️ **`"false"` entre guillemets.** En YAML, `false` nu devient un booléen ; Docker
Compose veut une chaîne pour une valeur d'environnement, et certaines versions
refusent le document plutôt que de convertir.

**Vérifier après redéploiement** — la variable doit apparaître, et le rapport
jetons/sessions cesser de grimper :

```bash
ssh <hôte> 'docker exec supabase-auth-<suffixe> env | grep ROTATION'
ssh <hôte> 'docker exec -i supabase-db-<suffixe> psql -U supabase_admin -d postgres \
  -c "select count(*) jetons, count(distinct session_id) sessions from auth.refresh_tokens"'
```

Mesuré le 5 septembre 2026, rotation encore active : **806 jetons pour 15
sessions, dont 791 révoqués** — 54 jetons par session, la signature de la
rotation. Rotation désactivée, ce rapport doit tendre vers 1.

**Ce que ça corrige.** Une session Supabase n'expire pas — ni `timebox` ni
`inactivity_timeout` ne sont posés. Les déconnexions constatées après une absence
ne venaient donc pas d'une durée trop courte, mais de la rotation : elle révoque
la famille de jetons dès qu'un jeton déjà échangé est représenté hors de sa
fenêtre de tolérance. Or l'app web et la PWA installée partagent le **même**
`localStorage` — deux contextes, un seul jeton, et un réveil de machine suffit à
les faire rafraîchir de concert. Le refresh échoue, auth-js purge la session, et
l'app repart sur l'écran de connexion.

C'est aussi ce qui rend possible le partage de session vers l'extension : le même
refresh token y vit dans deux stockages distincts, qui dérivent l'un de l'autre.

**Le coût, assumé.** Un refresh token volé reste valide jusqu'à la déconnexion —
il n'y a plus de détection de rejeu pour l'invalider. La contrepartie était une
déconnexion régulière sur un usage parfaitement légitime.

**`GOTRUE_JWT_EXP` reste à 3600, volontairement.** L'allonger était le réflexe,
c'est une fausse piste : PostgREST valide un JWT hors ligne, sur sa seule
signature, sans aucun moyen de savoir qu'il a été révoqué. La durée du JWT est
donc exactement la fenêtre pendant laquelle une déconnexion globale reste sans
effet. Rotation désactivée, renouveler toutes les heures ne coûte rien.

`GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL` devient sans objet et a été retiré
de `config.toml` : l'intervalle de tolérance n'existe que pour la rotation.

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

## Realtime : le huitième service, celui qu'on a GARDÉ (2026-09-08)

Le dégraissage ci-dessus dit ce qui est parti. Il ne disait pas ce qui reste, et
`supabase-realtime` restait documenté **nulle part** — le seul endroit qui
l'attestait était un commentaire dans
`apps/supabase/migrations/20260829140000_realtime.sql`. Or ce service porte toute
la synchronisation multi-onglets et multi-appareils : sans lui, l'app web et le
panneau d'extension se figent sur l'état du chargement, en silence.

**Il tourne, et il est exposé.** Vérifié le 8 septembre 2026 depuis un client :
un abonnement `postgres_changes` sur `api.penduline.polemil.dev` atteint
`SUBSCRIBED`.

⚠️ **`SUBSCRIBED` ne prouve pas que ça marche.** C'est le piège que #39 a payé :
si la publication `supabase_realtime` est vide, un client s'abonne, reçoit
`SUBSCRIBED`, et **rien d'autre** — aucune erreur, aucun symptôme, juste
l'absence de synchronisation. Il faut donc vérifier DEUX choses, pas une : le
service répond, **et** la migration qui peuple la publication est appliquée.

**Comment vérifier la seconde sans SSH.** La migration realtime n'ajoute aucune
colonne, donc la sonde PostgREST plus bas ne peut pas la viser directement. On
passe par une migration **postérieure** : les migrations étant appliquées dans
l'ordre par `apps/supabase/deploy/penduline-migrate.sh`, la présence d'un artefact
plus récent établit celle du realtime.

```bash
CLE=$(gh variable list --json name,value -q '.[]|select(.name=="VITE_SUPABASE_ANON_KEY").value')
# `parent_id` vient de 20260829160000_subtasks.sql, POSTÉRIEURE au realtime
curl -sS -o /dev/null -w '%{http_code}\n' -H "apikey: $CLE" \
  "https://api.penduline.polemil.dev/rest/v1/tasks?select=parent_id&limit=1"
# 200 ⇒ subtasks appliquée ⇒ realtime appliquée avant elle
```

Toujours accompagner d'un **témoin négatif** (une colonne inventée doit répondre
`400` / `42703`), sinon on ne sait pas si la sonde discrimine ou répond `200` à
tout.

**Si Realtime est un jour retiré du compose** — pour récupérer de la RAM, la
machine étant le facteur limitant (voir plus haut) — il faut savoir ce qu'on
casse : la synchronisation entre onglets et appareils s'arrête. Côté panneau
d'extension, un repli existe (relecture au changement de vue, #116) ; côté web,
il n'y en a aucun.

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

`.github/workflows/deploy.yml` pousse la référence choisie sur la branche
**`production`**, que la ressource Coolify suit. L'App GitHub déjà installée
reçoit l'événement `push` et déclenche le déploiement.

**L'API Coolify reste désactivée, et c'est le cœur de la décision.** Un
déploiement piloté par jeton d'API demandait d'ouvrir l'API, de créer un jeton et
de le stocker dans le dépôt. Passer par un `push` réutilise un canal déjà en
place et n'ajoute **aucun secret** : le `GITHUB_TOKEN` fourni par Actions suffit,
avec `contents: write` pour seul droit. Le workflow n'utilise aussi aucune action
tierce en dehors de `checkout` — rien qui puisse exfiltrer quoi que ce soit.

**`production`, pas `staging`.** Cette branche n'est pas un pré-production : c'est
un pointeur vers ce qui tourne. La nommer `staging` invite à y pousser « pour
tester », c'est-à-dire à casser la prod. Le nom doit correspondre à la branche
configurée sur la ressource Coolify.

**Pourquoi manuel.** La ressource est en source git : Coolify recompile le
Dockerfile sur la machine à 4 Go, qui s'est effondrée deux fois pendant un build.
Brancher l'auto-déploiement sur `main` ferait un build par merge — quatre dans la
journée du 17 août. La règle « à froid, avec de la marge » ne se délègue pas à un
`on: push`. Elle deviendra tenable une fois la bascule sur l'image GHCR faite,
le déploiement se réduisant alors à un `pull`.

**Le `ref` en entrée rend le rollback trivial** : déployer un SHA antérieur, c'est
le pousser sur `production`. D'où le `--force`, assumé — la branche recule
légitimement. Corollaire : ne jamais y committer directement, elle est écrasée.

**`git log production..main` dit ce qui attend d'être déployé.** L'UI Coolify ne
donne pas cette lecture ; le job la résume aussi dans son summary.

**La vérification porte sur le bundle, pas sur l'API.** Sans statut Coolify à
interroger, le job relève le nom haché du bundle (`assets/index-<hash>.js`) avant
de pousser, puis attend qu'il change : c'est la preuve qu'un nouveau conteneur
sert vraiment. Un `200` seul se satisferait de l'ancien. Un déploiement sans
changement front laisse le hash identique — cas légitime, simple avertissement.

⚠️ **Point à confirmer au premier run :** un `push` effectué avec le `GITHUB_TOKEN`
ne redéclenche pas d'autres *workflows* du dépôt (garde-fou anti-récursion de
GitHub). Cette restriction vise les workflows Actions, pas les livraisons de
webhooks aux Apps installées, donc Coolify devrait bien recevoir l'événement. Si
le déploiement ne part pas, c'est là qu'il faut regarder : le correctif est de
pousser avec un jeton dédié (PAT ou clé de déploiement) plutôt qu'avec celui
d'Actions.

## Les migrations dans la CI (2026-08-29)

Le front partait par workflow, les migrations à la main — et l'ordre s'est
inversé quatre fois de suite (#45, #39, #50, #78 : à chaque fois un front qui
interroge une table absente, et PostgREST qui répond `404` sans rien dire). Le
job `migrate` de `deploy.yml` s'exécute désormais **avant** le push sur
`production`.

### Pourquoi SSH, et pas autre chose

`supabase db push` vise un `--project-ref` supabase.com : inapplicable ici.
Exposer Postgres publiquement pour un `SUPABASE_DB_URL` n'a jamais été
envisageable. L'API Coolify aurait demandé un jeton, alors que le déploiement
s'en passe justement (App GitHub + branche `production`). Restait SSH, qui est
déjà le canal de la procédure manuelle.

### La commande forcée, qui est le vrai sujet

Une clé SSH dans les Secrets, sans plus, **donne un shell sur la production à
quiconque peut modifier un workflow du dépôt**. C'est un élargissement bien plus
large que « appliquer des migrations », et il serait passé inaperçu.

D'où `apps/supabase/deploy/penduline-migrate.sh`, déclaré en `command="…"` dans
`authorized_keys` : la clé ne peut lancer que lui. Il valide la sous-commande
**avant** de toucher à Docker, borne version et nom par expression régulière, et
n'évalue jamais `SSH_ORIGINAL_COMMAND` comme du shell. Sans cette ligne, le reste
du dispositif ne vaut rien — c'est la raison d'être du fichier, pas un détail
d'installation.

### Deux corrections de la procédure manuelle, au passage

**L'enregistrement de la version part dans la même transaction que le DDL.** La
procédure du README en fait deux étapes ; une migration appliquée mais non
enregistrée se rejoue au passage suivant. Ici, ou les deux tiennent, ou rien.

**`notify pgrst, 'reload schema'` est systématique**, dans la transaction — donc
jamais émis si la migration échoue. C'est ce qui évite le `404` où la table
existe, est correcte, et reste invisible.

### Le garde-fou de la baseline

Cette instance n'a pas été créée par le CLI : `schema_migrations` était absente.
Une table de suivi **vide** ne veut pas dire « base neuve », elle veut dire
« historique jamais suivi ». Sans garde-fou, le premier run aurait rejoué
`init.sql` sur une base en service.

Le job s'arrête donc net si la base ne déclare aucune migration alors que le
dépôt en contient, et renvoie à la sous-commande `record` — à jouer une fois, à
la main. C'est le seul endroit du dispositif où une erreur serait irréversible :
déclarer à tort une migration comme appliquée la fait disparaître du radar.

### Ce qui reste manuel, délibérément

Le déclenchement. `deploy.yml` est en `workflow_dispatch` parce que la machine à
4 Go s'est effondrée deux fois pendant un build ; ajouter l'application
automatique de migrations à un déploiement non surveillé aurait aggravé ce
choix, pas corrigé. L'entrée `migrations: ignorer` existe pour les cas où la
migration a été passée à la main.

⚠️ **À confirmer au premier run :** que les runners GitHub atteignent bien l'hôte
en SSH. Rien ne le garantit — pare-feu, liste d'adresses autorisées. Si la
connexion est refusée, l'alternative est un *self-hosted runner* sur la machine,
ou le maintien de la procédure manuelle.

## L'ordre migrations-puis-front a un angle mort : l'extension (2026-09-07)

Constat de départ : la prod servait la 0.0.26 alors que `main` était en 0.0.27,
six commits d'avance. Deux causes, indépendantes, et la seconde est la
généralisable.

### Les secrets du job `migrate` ont disparu

La dernière tentative de déploiement (4 septembre) est tombée en 12 s sur
`Secret MIGRATE_SSH_KEY absent`. Vérifié : **aucun secret n'existe**, ni au niveau
dépôt ni dans l'environnement `production` (`gh secret list` et
`gh secret list --env production` renvoient tous deux du vide). `deploy` dépendant
de `migrate`, plus rien ne partait — et comme le déclenchement est manuel, rien ne
le signalait.

La branche `production` avait pourtant avancé jusqu'au 5 septembre sans qu'aucun
run `Deploy` ne réussisse depuis le 18 août : elle a donc été poussée à la main.
À savoir quand on lit son état comme la preuve d'un déploiement — ce n'en est pas
un.

Le chemin automatique reste à remettre en état : `MIGRATE_SSH_KEY`,
`MIGRATE_SSH_KNOWN_HOSTS`, `MIGRATE_SSH_HOST`, `MIGRATE_SSH_USER`.

### « Migrations avant le front » protège le front, pas l'extension

C'est la leçon qui vaut au-delà de cet épisode.

L'ordre est bon, et pour de bonnes raisons (#45, #39, #50, #78 : un front qui
interroge une table absente répond 404 sans rien dire). Mais il repose sur une
hypothèse tacite : **le client se met à jour avec le déploiement**. Vraie pour le
front web, dont le bundle est remplacé en quelques minutes. Fausse pour
l'extension, qui vit chez les utilisateurs et dont une correction doit passer la
revue du Chrome Web Store puis la diffusion par Chrome — des jours.

Donc : **toute migration destructive doit attendre la diffusion de l'extension,
pas seulement le déploiement du front.** Pour ce type de migration, l'ordre est
l'inverse de celui du workflow, et le workflow ne peut pas le savoir tout seul.

`20260906100000_retirer_epinglage.sql` (`drop column tasks.pinned`) est le premier
cas. Elle est restée en attente ; le front 0.0.27 est parti seul, avec
`migrations=ignorer`.

### Le commentaire qui affirmait le contraire, et pourquoi il était faux

La migration portait ceci, qui a failli suffire à la laisser passer :

> « une version du client lisant encore `pinned` recevrait `undefined` et non une
> erreur — `pinned` ne servait qu'à trier et à décorer »

Faux. Le raisonnement ne vaudrait que pour un `select *`, et aucun client n'en
fait : tous nomment leurs colonnes une par une (`apps/web/src/data/store.ts`,
`useFocus.ts`, et le même motif dans l'extension). Vérifié contre la production :

```
GET /rest/v1/tasks?select=id,title,colonne_absente
→ HTTP 400  {"code":"42703","message":"column tasks.colonne_absente does not exist"}
```

Une colonne absente d'une liste explicite ne dégrade pas la fonctionnalité qui
s'en servait : elle casse **toute** la requête. Le commentaire a été corrigé dans
la migration, avec la trace de la vérification — c'est le genre d'affirmation
qu'on ne relit pas deux fois.

### Deux fausses alertes, pour ne pas les rejouer

- Le renommage de #112 fait réapparaître `20260901110000_review.sql` comme « en
  attente » côté suivi (la base a `20260901120000`). Sans effet : le fichier n'est
  que `create or replace function`, le réappliquer est neutre.
- `20260901140000_stats.sql` est modifiée entre les deux branches — sur un
  commentaire seul.

### Lire l'état réel de la base sans SSH

Utile quand les secrets manquent et qu'on veut savoir où en est le schéma :
PostgREST répond sur la clé anonyme, et un `select` ciblé suffit à tester la
présence d'une colonne ou d'une table.

```bash
CLE=$(gh variable list --json name,value -q '.[]|select(.name=="VITE_SUPABASE_ANON_KEY").value')
curl -sS -o /dev/null -w '%{http_code}\n' -H "apikey: $CLE" -H "Authorization: Bearer $CLE" \
  "https://api.penduline.polemil.dev/rest/v1/tasks?select=pinned&limit=1"
# 200 = la colonne est là · 400 = absente · 404 sur une table = absente
```

C'est ainsi qu'a été établi que la base était à jour **sauf** les deux migrations
du 6 septembre : `focus_day`, `due_at`, `task_attachments` et `pinned` présents,
`job_runs` absente.

## Les migrations en attente, passées — et la ligne de suivi qui manquait (2026-09-14)

La base s'était arrêtée à `20260902100000`. Les trois retards ont été résorbés en
une passe, par SSH sur l'hôte, `psql -U supabase_admin -1 -v ON_ERROR_STOP=1`.

### Le vrai piège n'était pas celui que j'avais annoncé

La semaine précédente, le renommage de #112 avait été classé « fausse alerte » :
`20260901110000_review.sql` réapparaissait comme en attente, et un `grep` partiel
n'y montrait que des `create or replace function` — donc réputée rejouable sans
dommage. **C'était faux.** Le fichier fait aussi :

```sql
alter table public.tasks add column quadrant_changed_at …   -- sans if not exists
create trigger tasks_quadrant_changed_at …                  -- sans or replace
```

La rejouer échouait donc sur `column already exists`. Et comme le job `migrate`
applique dans l'ordre des versions et s'arrête à la première qui tombe,
`20260901110000` aurait **bloqué `scheduler` et `retirer_epinglage` derrière
elle**. Le défaut se serait manifesté au premier passage du chemin automatique,
c'est-à-dire une fois les secrets rétablis — donc plus tard, et loin de sa cause.

Leçon d'usage : pour juger si une migration est rejouable, lire le fichier, pas
un `grep` des lignes qui arrangent.

### Ce qu'il fallait, c'était une baseline

`review.sql` **était** appliquée — colonne, fonction, trigger, index et vue tous
vérifiés présents en base. Seule sa ligne de suivi manquait : la collision
d'horodatage d'avant #112 avait laissé la place à `task_due_at`, qui occupe
`20260901120000` avec son propre nom. On enregistre donc sans rejouer :

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20260901110000', 'review');
```

C'est l'opération que le README décrit à l'étape 3, appliquée ici seule.

### `pg_cron` : l'inconnue de la story est levée

`work/stories/light/2026-09-06-planification/dev.md` laissait ouvert un point :
« que `create extension pg_cron` réussisse bien sous `supabase_admin` ». Elle
réussit. Le planificateur est en place, `cron.job` porte
`0 * * * *  select public.penduline_tick()`.

### État final, vérifié

13 fichiers dans `apps/supabase/migrations/`, 13 lignes dans `schema_migrations`,
identiques. Et les contrôles de bout en bout :

```
GET /rest/v1/tasks?select=id,title    → 200   l'app lit normalement
GET /rest/v1/tasks?select=pinned      → 400   la colonne est bien partie
GET /rest/v1/job_runs?select=id       → 401   permission denied
```

Le `401` vaut mieux qu'un `404` : un 404 signifierait que PostgREST n'a pas
rechargé son cache et ne connaît pas la table. Un `permission denied` prouve les
deux à la fois — le cache a suivi, **et** les droits tiennent. `job_runs`
appartient à `supabase_admin`, RLS activée, zéro policy, aucun droit pour `anon`
ni `authenticated` : invisible à l'API, comme la migration le voulait.

### Le tick, éprouvé à la main

`select public.penduline_tick()` retourne `0` et laisse sa trace :
`ran=t`, `rows_touched=0`, `error` vide, `finished_at` renseigné. C'est le
comportement attendu d'un corps encore vide (#21 et #22 non livrés).

Reste le seul point que cette vérification ne couvre pas, et que la story
signalait déjà : le **premier passage du cron lui-même**, à l'heure ronde. Un
appel manuel prouve la fonction, pas l'ordonnanceur.

```sql
select started_at, ran, rows_touched, error from public.job_runs
 order by started_at desc limit 5;
```

Contrôle annexe, qui vaut d'être connu : `drop column` ne vérifie **pas** les
corps de fonctions plpgsql. Une fonction lisant `pinned` se serait laissé retirer
la colonne sous les pieds et n'aurait cassé qu'à l'exécution. Vérifié après coup —
aucune fonction, vue ni index ne la mentionne, et `search_tasks` comme
`review_boards` s'exécutent.

### L'ordre a été respecté, cette fois dans le bon sens

`retirer_epinglage.sql` n'a été appliquée qu'après diffusion de l'extension 1.5.0
sur le Store, et le front alors servi (0.0.27) ne lisait déjà plus `pinned`. C'est
exactement l'ordre que le garde-fou posé dans la migration réclamait — l'inverse
de celui du workflow. Le front est passé en 0.0.30 juste après, avec
`migrations=ignorer`.

## La ressource MCP (#23, 2026-09-17)

Une **nouvelle ressource**, plus un enregistrement DNS, plus un build arg sur la
ressource web. Rien d'autre : le serveur MCP est un process, une image, un
domaine — `edge-functions` reste retiré du compose, et les tables
`oauth_clients` / `oauth_grants` arrivent par migration comme les autres.

### Type de ressource : « Docker Image », et cette fois c'est gratuit

La bascule n'a jamais été faite pour l'app web parce qu'elle imposait de
recréer la ressource et de lui transférer le domaine. La ressource MCP, elle,
n'existe pas encore : le bon choix ne coûte rien.

L'argument est le même que pour le web, en plus fort — la machine s'est
effondrée **deux fois** pendant un build, et une ressource en source git
recompile sur l'hôte. L'image est déjà produite par la CI depuis `main`, sans
aucun build arg :

```
ghcr.io/le-polemil/penduline-mcp:latest
```

### Le domaine, avec son port

`mcp.penduline.polemil.dev`, écrit en syntaxe Coolify `fqdn:port` —
`https://mcp.penduline.polemil.dev:8787` — sinon Traefik ne sait pas vers quel
port du conteneur router. Même piège que Kong et son `:8000`.

⚠️ **Enregistrement DNS dédié obligatoire.** Le wildcard `*.polemil.dev` ne
matche qu'**un seul** label : il ne couvre pas `mcp.penduline.polemil.dev`, pas
plus qu'il ne couvrait `api.penduline.polemil.dev`.

### Les variables, toutes runtime

C'est la différence avec la ressource web, et elle est structurelle : rien n'est
inliné dans un bundle ici. Changer une variable est un **redémarrage**, pas un
rebuild.

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | `https://api.penduline.polemil.dev:8000` |
| `SUPABASE_ANON_KEY` | la clé anon (Kong exige l'en-tête `apikey`) |
| `SUPABASE_JWT_SECRET` | 🔒 celui de l'instance Supabase |
| `MCP_TOKEN_SECRET` | 🔒 **à générer, DISTINCT du précédent** |
| `MCP_PUBLIC_URL` | `https://mcp.penduline.polemil.dev` |
| `WEB_APP_URL` | `https://penduline.polemil.dev` |
| `PORT` | `8787` (celui repris dans le domaine) |
| `MCP_QUOTA_CALLS_PER_MINUTE` | facultatif, 60 par défaut |
| `MCP_QUOTA_WRITES_PER_DAY` | facultatif, 500 par défaut |

**Les deux secrets DOIVENT différer**, et le serveur refuse de démarrer sinon.
Ce n'est pas une précaution de style : un jeton d'accès MCP signé avec le secret
de Supabase serait accepté par PostgREST, et n'importe quel client pourrait alors
court-circuiter le serveur — donc les outils, le quota et la révocation.

Une configuration incomplète ne démarre pas non plus : le process sort en
listant d'un coup tout ce qui manque. Vérifié en conteneur.

### Sur la ressource WEB : un build arg de plus

```
VITE_MCP_URL=https://mcp.penduline.polemil.dev
```

⚠️ **Build arg, donc rebuild.** Un restart n'aura aucun effet — Vite l'inline.
Et le `ARG` doit exister dans le Dockerfile, sinon la poser dans Coolify ne sert
strictement à rien : c'est exactement ce qui s'est passé avec `VITE_EXTENSION_ID`
à la livraison de #107.

Son absence ne casse rien : l'application reste entière, seul l'écran de
consentement dit qu'il ne peut pas travailler. Ce qui la rend, elle aussi, facile
à oublier.

### Mémoire

Un process Node, ~80 à 150 Mo. La marge existe depuis le dégraissage de Supabase
(~1,5 Go disponibles), et la ressource ne compile rien sur l'hôte si elle est en
« Docker Image ». C'est le deuxième argument pour ce type de ressource.
