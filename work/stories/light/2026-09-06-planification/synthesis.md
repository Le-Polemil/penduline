---
slug: "planification"
title: "Moteur de planification (pg_cron)"
created: 2026-09-06
completed: 2026-09-06
status: "Done"
---

# Synthèse

## Résumé

`pg_cron` appelle `public.penduline_tick()` toutes les heures. La fonction ne
fait **rien** aujourd'hui, et c'est le livrable : la mécanique — verrou, journal,
rattrapage, droits — est en place pour que #21 (récurrences) et #22 (actions
d'échéance) n'aient plus qu'à remplir le corps.

## Ce qui a été tranché avant d'écrire

**L'issue reposait sur une prémisse fausse.** Elle situait l'activation de
`pg_cron` dans le dashboard supabase.com. La production est auto-hébergée sur
Coolify, sans dashboard, et `pg_cron` exige `shared_preload_libraries` — donc une
ligne de `postgresql.conf` et un redémarrage de Postgres qu'aucune migration ne
peut faire, sur une machine qui s'est déjà effondrée deux fois.

Vérification sur l'hôte avant d'écrire une ligne : **`pg_cron` est déjà chargée**,
version 1.6, `cron.database_name = postgres`. Un `create extension` suffit. Le
local est identique, donc tout était testable pour de vrai.

**Le tick n'a rien à faire, et il ne faut pas lui en inventer.** #21 et #22
n'existent pas. Le code le confirme d'ailleurs : le mode « aujourd'hui » (#49)
s'est construit explicitement **sans** cron, en faisant expirer sa sélection par
non-correspondance de date.

## La décision qui structure tout

**Le tick converge, il n'avance pas d'un pas.** Il traite « tout ce qui est dû à
cet instant », jamais « ce qui s'est passé depuis la dernière fois ».

Un tick « par pas » laisse un trou quand une exécution est manquée : il faut le
détecter, le mémoriser, le rejouer — donc un curseur, donc un bug silencieux dès
qu'il dérive. Un tick qui converge n'a rien à mémoriser : une exécution manquée
signifie seulement que la suivante a plus à faire.

Les deux critères les plus délicats de l'issue en découlent **gratuitement** :

- **Rattrapage** — structurel, aucun curseur.
- **Idempotence** — relancer aussitôt ne trouve plus rien à faire, puisque le
  travail n'est plus dû. Propriété de la *forme* de la fonction, pas un contrôle
  ajouté par-dessus.

C'est la seule règle à ne pas casser en branchant #21 et #22.

## Changements réalisés

- `create extension if not exists pg_cron`.
- **`public.job_runs`** — `ran` distingue **trois** états et non deux : exécuté,
  échoué, et *a cédé la place* (verrou pris). Un `finished_at` resté nul est le
  cas le plus instructif : processus tué ou verrou tenu, deux pannes qu'aucun
  message d'erreur ne signale.
- **`public.penduline_tick(p_now timestamptz default now())`** — `p_now` en
  paramètre, même intention que le `now = Date.now()` de `packages/shared` : c'est
  ce qui rend la fonction vérifiable. `pg_try_advisory_xact_lock` sans attente
  (variante `_xact_`, pour que le verrou tombe même si le processus est tué).
  Ligne de journal ouverte **avant** le travail, travail dans un bloc
  `exception` : c'est ce qui fait survivre la trace à un échec.
- **Droits** — `execute` révoqué à `public`, `anon`, `authenticated` **et
  `service_role`**. `job_runs` : RLS sans policy, aucun droit pour
  `anon`/`authenticated`.
- `cron.schedule('penduline-tick', '0 * * * *', …)` — nommé, donc rejouable.
- Section « Le planificateur (#20) » dans `apps/supabase/README.md`.

## Fichiers modifiés

- `apps/supabase/migrations/20260906120000_scheduler.sql` *(nouveau)*
- `apps/supabase/README.md`

## Tests et validation

Aucune ligne de TypeScript : ni typecheck ni Vitest ne disent quoi que ce soit
ici. Tout a été joué contre la stack locale, identique à la production
(PostgreSQL 15, même `shared_preload_libraries`, pg_cron 1.6).

- ✅ **Idempotence** — trois exécutions de suite, `sum(rows_touched) = 0`, aucune
  erreur.
- ✅ **Le cron tourne et laisse une trace** — job passé à `* * * * *` :
  `cron.job_run_details` = `succeeded`, `job_runs` porte une ligne au même
  instant.
- ✅ **`security definer` + `search_path` figé** — `prosecdef = t`,
  `proconfig = {search_path=""}`.
- ✅ **`job_runs` inaccessible** — RLS active, 0 policy, 0 droit pour
  `anon`/`authenticated`.
- ✅ **Chemin d'erreur** — panne simulée : le travail est annulé, la trace survit.
- ✅ **Chemin verrou** — verrou tenu ailleurs → `ran = f`, retour `0`.
- ⚠️ **Rattrapage** — structurel, mais non démontrable tant que le tick n'a pas de
  travail. À rejouer avec #21.
- ❌ **Production** — non validée : le premier passage réel à l'heure ronde ne
  s'observe qu'après déploiement.

## Notes

- **La trouvaille** : `service_role` pouvait exécuter la fonction. Révoquer
  `public`, `anon` et `authenticated` ne suffit pas — les *default privileges* de
  Supabase accordent `EXECUTE` à `service_role` sur toute fonction nouvelle.
  Constaté en lisant `proacl` **après** application, pas deviné en écrivant :
  sans cette vérification, la fonction serait partie en production avec ce droit.
- **Défaut découvert au passage, hors périmètre** : deux migrations partageaient
  l'horodatage `20260901120000` (`review.sql` de #47 et `task_due_at.sql` de
  #19). `schema_migrations` ayant `version` pour clé primaire, **`supabase db
  reset` échoue** — plus aucune base ne peut être créée de zéro. La production
  n'est pas dégradée (les objets de `review.sql` y sont bien présents), seule sa
  comptabilité est fausse : `review` n'y figure pas. Voir `dev.md` pour le détail
  et le correctif proposé.
- Pour #21 et #22 : ajouter le travail dans le bloc prévu, ajouter le compte à
  `v_rows`, et ne **jamais** traiter « ce qui a changé depuis » — seulement ce qui
  est dû à `p_now`.
