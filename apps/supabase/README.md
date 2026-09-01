# Supabase — `apps/supabase`

Projet Supabase de Penduline : schéma, policies RLS et seed local.

> Le CLI Supabase cherche un dossier `supabase/`. Ici il s'appelle
> `apps/supabase`, donc on passe **`--workdir apps`** (les scripts npm de ce
> workspace le font déjà via `--workdir ..`).

## Structure

```
apps/supabase/
├── config.toml                       # config du projet local
├── deploy/
│   └── penduline-migrate.sh          # commande forcée SSH, à poser sur l'hôte
├── migrations/
│   ├── 20260724090000_init.sql       # tables rooms/tasks + enum + RLS
│   ├── 20260810100000_rooms_to_boards.sql
│   └── 20260816120000_universes.sql  # regroupement des matrices
└── seed.sql                          # compte + données de démo (LOCAL uniquement)
```

## Local (Docker requis)

```bash
npm run start -w @penduline/supabase   # démarre Postgres + Auth + Studio…
npm run reset -w @penduline/supabase   # (ré)applique migrations + seed.sql
npm run status -w @penduline/supabase  # URLs + clés locales
npm run stop  -w @penduline/supabase
```

`status` affiche l'`API URL` (http://127.0.0.1:54321) et l'`anon key` locale →
à mettre dans le `.env` racine (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`).
Studio : http://127.0.0.1:54323 · emails locaux : http://127.0.0.1:54324

**Compte de démo** (créé par `seed.sql`) : `demo@penduline.test` / `password123`,
avec des matrices d'exemple réparties en deux univers, et une laissée **sans
univers** — c'est un état normal, pas un oubli. Si l'insertion dans `auth.users`
échoue sur ta version du CLI, commente le bloc « Compte de démo » — l'inscription
normale marche quand même.

**Si les ports sont déjà pris** (un autre projet Supabase tourne), décale-les
dans `config.toml` (`54321`→`55321`, etc.) plutôt que d'arrêter l'autre stack.
Pense à rétablir le fichier ensuite : il est versionné.

## Production — Supabase AUTO-HÉBERGÉ

> ⚠️ La production **n'est pas** un projet supabase.com. C'est une instance
> auto-hébergée sur Coolify (`https://api.penduline.polemil.dev`), dégraissée à
> PostgREST + GoTrue — voir `work/coolify-deploy.md`. Les commandes `link` et
> `push` du CLI, qui visent un `--project-ref` supabase.com, **ne s'appliquent
> pas ici.**

Appliquer une migration se fait donc à la main, sur le Postgres de l'instance.

### Les deux règles à ne pas contourner

**Se connecter en `supabase_admin`, pas en `postgres`.** Les tables du schéma
`public` appartiennent à `supabase_admin`, et `postgres` n'est **pas** membre de
ce rôle : un `alter table` échoue sur `must be owner of table`. Pire, un
`create table` en `postgres` réussit — mais la table appartient alors au mauvais
rôle, et les droits accordés à `anon` / `authenticated` découlent des *default
privileges* du rôle créateur. Elle existe, elle a son RLS et sa policy, et elle
reste **invisible à PostgREST**. La panne ne se voit qu'à l'exécution.

**Passer `-1`.** Le DDL est transactionnel sous Postgres : sans `-1`, `psql`
valide chaque instruction séparément et une erreur au milieu laisse le schéma à
moitié appliqué. `ON_ERROR_STOP=1` arrête l'exécution mais ne défait rien.

### La procédure

```bash
# 0. Le nom du conteneur, sur l'hôte
docker ps --format '{{.Names}}' | grep supabase-db

# 1. Ce qui est déjà là (voir la note plus bas : la table de suivi peut manquer)
docker exec -i <conteneur-db> psql -U postgres -d postgres \
  -c "select version from supabase_migrations.schema_migrations order by version"

# 2. Appliquer — depuis le dépôt, sans copier le fichier sur le serveur
ssh <hôte> 'docker exec -i <conteneur-db> psql -U supabase_admin -d postgres -1 -v ON_ERROR_STOP=1' \
  < apps/supabase/migrations/<fichier>.sql

# 3. Enregistrer la version, sinon un futur `db diff` la croira manquante
docker exec -i <conteneur-db> psql -U supabase_admin -d postgres \
  -c "insert into supabase_migrations.schema_migrations (version, name)
      values ('<horodatage>', '<nom>')"
```

Le SQL Editor de Studio fait aussi l'affaire s'il est déployé — et il montre
l'erreur en entier, ce qu'un enchaînement de `-c` peut tronquer.

### Vérifier — les quatre contrôles

```bash
docker exec -i <conteneur-db> psql -U postgres -d postgres \
  -c "select tablename, tableowner from pg_tables where schemaname='public' order by 1" \
  -c "select relname, relrowsecurity from pg_class where relname='<table>'" \
  -c "select policyname from pg_policies where tablename='<table>'" \
  -c "select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type)
      from information_schema.role_table_grants
      where table_schema='public' and grantee in ('anon','authenticated','service_role')
      group by 1,2 order by 1,2"
```

Propriétaire = `supabase_admin` · `relrowsecurity` = `t` · la policy présente ·
et **les droits de la nouvelle table identiques à ceux des anciennes**. Ce dernier
point est le seul qui prouve que l'application pourra lire la table ; les trois
autres ne la rendent correcte que sur le papier.

Le contrôle de bout en bout, qui vaut mieux que tous les précédents — PostgREST
met le schéma en cache, et un `200` prouve qu'il l'a rechargé :

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "apikey: $VITE_SUPABASE_ANON_KEY" \
  "$VITE_SUPABASE_URL/rest/v1/<table>?select=id&limit=1"
```

Un `404` signifie que le cache n'a pas suivi : `notify pgrst, 'reload schema';`,
ou redémarrer le conteneur `supabase-rest`.

> **La table de suivi peut ne pas exister.** Cette instance n'a pas été créée par
> le CLI : `supabase_migrations.schema_migrations` était absente jusqu'à ce qu'on
> la pose à la main. Son absence n'empêche rien — `psql` se moque de ce que
> Supabase croit appliqué — mais tant qu'elle manque, `db diff` voit une base
> vierge et propose de tout rejouer.

**Ordre de déploiement :** la migration **avant** le front. Une colonne que le
front lit et qui n'existe pas encore fait échouer la lecture ; l'inverse est sans
conséquence, une colonne inutilisée ne gêne personne.

**Ce que `seed.sql` ne fait jamais** : il n'est joué que par `db reset`, en local.
Aucune donnée de démo ne part en production.

### Automatiser — la CI applique, vous relisez

Le workflow `Deploy` applique les migrations en attente **avant** de publier le
front. C'est le même geste que la procédure ci-dessus, joué par une Action :
`ssh <hôte> 'docker exec -i <db> psql …'`.

Deux choses le rendent moins risqué que son équivalent manuel : l'enregistrement
de la version part dans **la même transaction** que le DDL (la procédure à la
main les sépare, et une migration appliquée mais non enregistrée se rejoue au
passage suivant), et le `notify pgrst, 'reload schema'` est systématique.

#### Ce qu'il faut poser une fois sur l'hôte

**1. Le script.** Il est dans le dépôt, `apps/supabase/deploy/penduline-migrate.sh` :

```bash
scp apps/supabase/deploy/penduline-migrate.sh <hôte>:/tmp/
ssh <hôte> 'sudo install -m 0755 /tmp/penduline-migrate.sh /usr/local/bin/penduline-migrate.sh && rm /tmp/penduline-migrate.sh'
```

Si la machine héberge **plusieurs** stacks Supabase, désignez celui de Penduline —
sinon le script refuse de choisir, et il a raison :

```bash
echo 'PENDULINE_DB_CONTAINER=<conteneur-db>' | sudo tee /etc/default/penduline-migrate
```

**2. Une clé dédiée, bornée à ce script.** C'est le point qui rend l'ensemble
acceptable : sans la directive `command=`, la clé donne un **shell sur la
production** à quiconque peut modifier un workflow du dépôt.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/penduline-ci -C "penduline-ci" -N ""
```

Puis, dans l'`authorized_keys` de l'utilisateur visé sur l'hôte, **une seule
ligne** — la partie avant la clé n'est pas décorative :

```
command="/usr/local/bin/penduline-migrate.sh",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding ssh-ed25519 AAAA… penduline-ci
```

Ce que la clé peut alors faire : `applied`, `apply`, `record`, `verify`. Rien
d'autre. Tout le reste est refusé **avant** que le script ne touche à Docker, et
ni la version ni le nom de migration n'entrent dans une requête sans être bornés
par une expression régulière.

**3. Les secrets**, dans l'environnement `production` du dépôt :

| Secret | Contenu |
|---|---|
| `MIGRATE_SSH_KEY` | la clé **privée** `~/.ssh/penduline-ci` |
| `MIGRATE_SSH_HOST` | l'hôte Coolify |
| `MIGRATE_SSH_USER` | l'utilisateur dont l'`authorized_keys` porte la ligne |
| `MIGRATE_SSH_KNOWN_HOSTS` | la sortie de `ssh-keyscan <hôte>` |

`MIGRATE_SSH_KNOWN_HOSTS` n'est pas une formalité : sans lui, il faudrait
`StrictHostKeyChecking=no`, c'est-à-dire livrer la clé au premier qui se met en
travers. Le workflow échoue si le secret manque plutôt que de baisser la garde.

Port non standard : variable de dépôt `MIGRATE_SSH_PORT` (22 par défaut).

#### La baseline — à faire UNE fois, avant le premier passage

⚠️ **Cette instance n'a pas d'historique suivi.** Une table de suivi vide ne veut
pas dire « base neuve », elle veut dire « on n'a jamais noté ce qui était
appliqué ». Le workflow s'arrête donc net dans ce cas, au lieu de rejouer
`init.sql` sur une base en service.

Déclarez ce qui est **déjà** en base, sans l'exécuter :

```bash
# Depuis le dépôt : les migrations déjà appliquées, une par ligne « version<TAB>nom »
printf '20260724090000\tinit\n20260810100000\trooms_to_boards\n20260816120000\tuniverses\n' \
  | ssh -i ~/.ssh/penduline-ci <utilisateur>@<hôte> record
```

N'y mettez que ce qui est réellement appliqué : une migration déclarée à tort
disparaît du radar pour de bon.

#### Au quotidien

`Actions → Deploy → Run workflow`, et l'entrée **`migrations`** :

- **`auto`** (défaut) — les migrations en attente sont listées, appliquées une à
  une dans l'ordre des versions, puis le schéma est récapitulé dans le résumé du
  run. Le front ne part qu'ensuite.
- **`ignorer`** — le job est sauté et le déploiement se poursuit. Pour les cas où
  la migration a été passée à la main, ou pendant l'installation de tout ceci.

Si l'environnement `production` exige une revue, le run demande **deux**
approbations : une avant de toucher à la base, une avant de publier le front. Ce
n'est pas une gêne à contourner — ce sont deux risques distincts.

## Sécurité

- Les clés `VITE_SUPABASE_*` (URL + anon) sont **publiques**. L'isolation entre
  comptes repose **entièrement sur les policies RLS** de la migration
  (`user_id = auth.uid()`) — ne jamais désactiver RLS.
- La `service_role` key ne doit jamais être exposée au front ni à l'extension.
- `seed.sql` insère directement dans `auth.users` : réservé au **local**
  (`db reset`), jamais joué par `db push`.
- La clé SSH de la CI est bornée par une **commande forcée** : elle ne donne pas
  de shell. Sans cette directive, un accès en écriture au dépôt vaudrait un accès
  à la machine de production — c'est la seule raison pour laquelle le secret est
  acceptable.
