---
slug: "planification"
title: "Moteur de planification (pg_cron)"
created: 2026-09-06
status: "Done"
---

# Journal de développement

## Progression

| Tâche | Statut | Date |
|-------|--------|------|
| 1. Vérifier `pg_cron` sur l'hôte de production | Terminé | 2026-09-06 |
| 2. Migration : extension, `job_runs`, `penduline_tick()`, droits, planification | Terminé | 2026-09-06 |
| 3. Vérifier les critères contre un vrai Postgres | Terminé | 2026-09-06 |
| 4. Documenter le planificateur dans `apps/supabase/README.md` | Terminé | 2026-09-06 |

## Journal

### 2026-09-06 : levée du doute d'infrastructure

**Statut** : Terminé

L'issue partait d'un projet supabase.com et d'un bouton dans *Database →
Extensions*. La production est auto-hébergée sur Coolify, sans dashboard — et
`pg_cron` exige `shared_preload_libraries`, donc une ligne de `postgresql.conf`
et un redémarrage de Postgres qu'aucune migration ne peut faire.

Vérifié sur l'hôte avant d'écrire une ligne :

```
shared_preload_libraries : … plpgsql_check, pg_cron, pg_net, …   ← déjà chargée
pg_available_extensions  : pg_cron 1.6, installed_version vide
cron.database_name       : postgres                              ← la bonne base
version()                : PostgreSQL 15.8
```

**Notes** : le meilleur résultat possible — `create extension` suffit, aucune
configuration à toucher, aucun redémarrage sur une machine qui s'est déjà
effondrée deux fois. La stack locale est identique (même
`shared_preload_libraries`, même version de pg_cron), donc tout est testable
pour de vrai.

Vérifié aussi que le tick n'a effectivement rien à faire aujourd'hui : le mode
« aujourd'hui » (#49) s'est construit **sans** cron, en faisant expirer sa
sélection par non-correspondance de date. Le corps vide n'est pas un manque, il
n'y a rien à y mettre avant #21 et #22.

### 2026-09-06 : la migration

**Statut** : Terminé

**Fichiers** :

- `apps/supabase/migrations/20260906120000_scheduler.sql` (nouveau)
- `apps/supabase/README.md` — section « Le planificateur (#20) »

**Notes** :

- **Converger plutôt qu'avancer d'un pas.** Le tick traite « tout ce qui est dû à
  cet instant », jamais « ce qui a changé depuis ». Le rattrapage et
  l'idempotence deviennent des propriétés de la forme de la fonction, pas des
  contrôles ajoutés par-dessus. C'est la seule règle à ne pas casser en
  branchant #21 et #22.
- `ran` distingue **trois** états et non deux : exécuté, échoué, et *a cédé la
  place* (verrou déjà pris). Les confondre rendrait le journal illisible — un
  tick qui renonce n'est ni un succès ni une panne.
- La ligne de journal est ouverte **avant** le travail, et le travail vit dans un
  bloc `exception`. C'est ce qui fait survivre la trace à un échec : sans ça,
  l'erreur emporterait la transaction entière, donc la seule preuve que le tick a
  échoué.
- `pg_try_advisory_xact_lock` et non sa variante de session : le verrou tombe
  avec la transaction, y compris si le processus est tué. Un verrou de session
  survivrait au crash et bloquerait tous les ticks suivants — panne silencieuse
  parfaite.

### 2026-09-06 : vérification contre un vrai Postgres

**Statut** : Terminé

Aucune ligne de TypeScript dans cette story : ni typecheck ni Vitest ne disent
quoi que ce soit ici. Tout a été joué contre la stack locale.

| Critère | Résultat |
|---|---|
| Idempotence — trois exécutions de suite | ✅ `sum(rows_touched) = 0`, aucune erreur |
| Le cron tourne et laisse une trace | ✅ job passé à `* * * * *` : `cron.job_run_details` = `succeeded`, et `job_runs` porte une ligne au même instant (`00:48:00.045`) |
| `security definer` + `search_path` figé | ✅ `prosecdef = t`, `proconfig = {search_path=""}` |
| Sans contournement de RLS | ✅ voir la trouvaille ci-dessous |
| `job_runs` inaccessible | ✅ `relrowsecurity = t`, 0 policy, 0 droit pour `anon`/`authenticated` |
| Chemin d'erreur | ✅ panne simulée : le travail est annulé, la trace survit avec `P0001 \| …` |
| Chemin verrou | ✅ verrou tenu par une autre session → `ran = f`, retour `0`, aucune erreur |
| Rattrapage | ⚠️ structurel, mais **non démontrable** tant que le tick n'a pas de travail. À rejouer avec #21. |

**⚠️ La trouvaille** : `service_role` pouvait exécuter la fonction.

Révoquer `public`, `anon` et `authenticated` **ne suffit pas**. Les *default
privileges* de Supabase accordent `EXECUTE` à `service_role` sur toute fonction
nouvelle, et l'ACL le montrait noir sur blanc :

```
supabase_admin=X/supabase_admin
postgres=X/supabase_admin
service_role=X/supabase_admin      ← celui-là n'aurait pas dû être là
```

Ce rôle est porté par une clé jamais exposée au front, donc l'exposition était
faible — mais c'est exactement le genre de droit qu'on n'accorde pas « au cas
où ». Constaté en lisant `proacl` **après** avoir appliqué la migration, pas
deviné en l'écrivant : sans cette vérification, la fonction serait partie en
production avec ce droit.

### 2026-09-06 : validation manuelle en production — NON EFFECTUÉE

**Statut** : En attente

Tout a été vérifié en local, sur une base identique à la production. Restent deux
choses qui ne peuvent l'être qu'après déploiement :

- Le premier passage réel du cron à l'heure ronde, sur l'hôte.
- Que `create extension pg_cron` réussisse bien sous `supabase_admin` par le
  script borné de la CI (#88) — il est superutilisateur, donc ça devrait passer,
  mais l'extension est le seul objet de cette migration qui l'exige.

À regarder après le déploiement :

```bash
docker exec -i <conteneur-db> psql -U postgres -d postgres \
  -c "select started_at, ran, rows_touched, error from public.job_runs
      order by started_at desc limit 5"
```
