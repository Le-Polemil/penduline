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
│   └── 20260724090000_init.sql       # tables rooms/tasks + enum + RLS
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
avec les pièces d'exemple. Si l'insertion dans `auth.users` échoue sur ta version
du CLI, commente le bloc « Compte de démo » — l'inscription normale marche quand même.

## Distant (projet supabase.com)

```bash
npm run link -w @penduline/supabase    # supabase link --project-ref <ref>
npm run push -w @penduline/supabase    # applique les migrations (PAS le seed)
```

Alternative sans CLI : colle `migrations/20260724090000_init.sql` dans le SQL
Editor du dashboard.

## Sécurité

- Les clés `VITE_SUPABASE_*` (URL + anon) sont **publiques**. L'isolation entre
  comptes repose **entièrement sur les policies RLS** de la migration
  (`user_id = auth.uid()`) — ne jamais désactiver RLS.
- La `service_role` key ne doit jamais être exposée au front ni à l'extension.
- `seed.sql` insère directement dans `auth.users` : réservé au **local**
  (`db reset`), jamais joué par `db push`.
