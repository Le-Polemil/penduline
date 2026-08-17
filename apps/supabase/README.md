# Supabase — `apps/supabase`

Projet Supabase de Penduline : schéma, policies RLS et seed local.

> Le CLI Supabase cherche un dossier `supabase/`. Ici il s'appelle
> `apps/supabase`, donc on passe **`--workdir apps`** (les scripts npm de ce
> workspace le font déjà via `--workdir ..`).

## Structure

```
apps/supabase/
├── config.toml                       # config du projet local
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

Appliquer une migration se fait donc à la main, sur le Postgres de l'instance :

```bash
# 1. Vérifier ce qui est déjà appliqué
docker exec -i <conteneur-db> psql -U postgres -d postgres \
  -c "select version from supabase_migrations.schema_migrations order by version"

# 2. Appliquer le fichier
docker exec -i <conteneur-db> psql -U postgres -d postgres \
  < apps/supabase/migrations/<fichier>.sql

# 3. Enregistrer la version, sinon un futur `db diff` la croira manquante
docker exec -i <conteneur-db> psql -U postgres -d postgres \
  -c "insert into supabase_migrations.schema_migrations (version) values ('<horodatage>')"
```

Le SQL Editor de Studio fait aussi l'affaire s'il est déployé.

**Ordre de déploiement :** la migration **avant** le front. Une colonne que le
front lit et qui n'existe pas encore fait échouer la lecture ; l'inverse est sans
conséquence, une colonne inutilisée ne gêne personne.

**Ce que `seed.sql` ne fait jamais** : il n'est joué que par `db reset`, en local.
Aucune donnée de démo ne part en production.

## Sécurité

- Les clés `VITE_SUPABASE_*` (URL + anon) sont **publiques**. L'isolation entre
  comptes repose **entièrement sur les policies RLS** de la migration
  (`user_id = auth.uid()`) — ne jamais désactiver RLS.
- La `service_role` key ne doit jamais être exposée au front ni à l'extension.
- `seed.sql` insère directement dans `auth.users` : réservé au **local**
  (`db reset`), jamais joué par `db push`.
