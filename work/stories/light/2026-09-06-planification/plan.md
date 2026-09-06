---
slug: "planification"
title: "Moteur de planification (pg_cron)"
created: 2026-09-06
status: "Done"
---

# #20 — Moteur de planification (pg_cron)

## Contexte

Les tâches récurrentes (#21) et les actions automatiques d'échéance (#22) ont
besoin de la même chose : **quelqu'un doit agir quand l'utilisateur n'est pas
là**. Ce ticket livre cette brique une seule fois.

## Deux questions tranchées avant d'écrire

### `pg_cron` est-elle seulement disponible ?

L'issue supposait un projet supabase.com et un bouton dans *Database →
Extensions*. La production est **auto-hébergée sur Coolify**, dégraissée à
PostgREST + GoTrue : pas de dashboard. Or `pg_cron` n'est pas une extension
ordinaire — elle doit figurer dans `shared_preload_libraries`, ce qui suppose une
ligne de `postgresql.conf` et un **redémarrage de Postgres**. Aucune migration ne
peut le faire, et cette machine s'est déjà effondrée deux fois sur un pic.

Vérification faite sur l'hôte :

```
shared_preload_libraries : … plpgsql_check, pg_cron, pg_net, …
pg_available_extensions  : pg_cron 1.6, installed_version vide
cron.database_name       : postgres
version()                : PostgreSQL 15.8
```

**Déjà chargée.** Un `create extension` suffit, sans toucher à la configuration
ni redémarrer quoi que ce soit. Le local (`supabase/postgres`, Postgres 15) est
identique, donc développable et testable pour de vrai.

### Que fait le tick, alors que #21 et #22 n'existent pas ?

**Rien, et c'est délibéré.** Ce ticket livre la mécanique — verrou, journal,
rattrapage, droits — et un corps vide que les deux tickets suivants rempliront.
Lui inventer du travail aujourd'hui reviendrait à écrire du code que personne
n'appelle, contre une spécification qui n'existe pas.

Le code confirme d'ailleurs qu'il n'y a rien à récupérer : le mode « aujourd'hui »
(#49) s'est explicitement construit **sans** cron — *« Aucun `cron`, aucun travail
de nettoyage, aucune logique de TTL à maintenir »* — en faisant expirer sa
sélection par non-correspondance plutôt que par nettoyage.

## La décision qui structure tout : converger, pas avancer d'un pas

Le tick traite **« tout ce qui est dû à cet instant »**, jamais « ce qui s'est
passé depuis la dernière exécution ».

```
  PAR PAS                          PAR CONVERGENCE
  ───────                          ───────────────
  une exécution manquée            une exécution manquée signifie
  laisse un TROU                   seulement que la suivante a plus
      ↓                            à faire
  il faut le détecter,                 ↓
  le mémoriser, le rejouer         rien à mémoriser, rien à rejouer
      ↓
  un curseur à maintenir
      ↓
  un bug silencieux dès
  qu'il dérive
```

Les deux critères d'acceptation les plus délicats en tombent gratuitement :

- **Rattrapage** — structurel, aucun curseur.
- **Idempotence** — si le tick amène l'état à ce qu'il doit être, le relancer
  aussitôt ne trouve plus rien à faire. C'est une propriété de la **forme** de la
  fonction, pas un contrôle ajouté par-dessus.

Les contraintes d'unicité de #21 (`recurrence_id, occurrence_date`) restent
néanmoins obligatoires : elles protègent de deux ticks **concurrents**, ce que le
verrou rend improbable mais pas impossible.

## Implémentation

Une seule migration, `20260906120000_scheduler.sql` :

1. `create extension if not exists pg_cron`.
2. **`public.job_runs`** — `job`, `started_at`, `finished_at`, `ran`,
   `rows_touched`, `error`. Sans elle, un cron silencieusement cassé ne se voit
   pas : il ne tombe pas bruyamment, il cesse de passer.
   - `ran` distingue **trois** états, pas deux : exécuté, échoué, et *a cédé la
     place* (verrou pris). Les confondre rendrait le journal illisible.
   - `finished_at` nul est le cas le plus instructif — processus tué ou verrou
     tenu, deux pannes qu'aucun message d'erreur ne signale.
3. **`public.penduline_tick(p_now timestamptz default now())`** :
   - `p_now` en paramètre, même intention que le `now = Date.now()` de
     `packages/shared` — c'est ce qui rend la fonction vérifiable.
   - `pg_try_advisory_xact_lock` **sans attente** : un tick qui trouve la place
     prise renonce au lieu de s'empiler. La variante `_xact_` et non `_session_`,
     pour que le verrou soit relâché même si le processus est tué.
   - Bloc `exception` : le travail est annulé, **la ligne de journal survit** —
     d'où l'ouverture de la trace *avant* le travail.
   - `security definer`, `search_path = ''`, tout qualifié.
4. **Droits** — `execute` révoqué à `public`, `anon`, `authenticated` **et
   `service_role`**. `job_runs` : RLS activée sans aucune policy, aucun droit
   pour `anon`/`authenticated`.
5. `cron.schedule('penduline-tick', '0 * * * *', …)` — nommé, donc rejouable.

Plus une section « Le planificateur » dans `apps/supabase/README.md` : comment
lire `job_runs`, et le rappel sur `shared_preload_libraries` si l'image change.

## Vérification

Aucune ligne de TypeScript : ni typecheck ni Vitest ne diront quoi que ce soit de
cette story. Tout se vérifie contre un vrai Postgres — d'où l'usage de la stack
locale, identique à la production (Postgres 15, même `shared_preload_libraries`,
pg_cron 1.6).

| Critère de l'issue | Comment |
|---|---|
| Idempotence | Appeler le tick trois fois de suite ; `sum(rows_touched) = 0`, aucune erreur. |
| Le cron tourne et laisse une trace | Passer le job à `* * * * *`, attendre deux minutes, comparer `cron.job_run_details` et `job_runs`. |
| Rattrapage | Structurel — mais non démontrable tant que le tick n'a pas de travail. À rejouer avec #21. |
| `security definer`, `search_path` figé, sans contournement de RLS | Lire `pg_proc.prosecdef`, `pg_proc.proconfig`, `pg_proc.proacl`, `pg_class.relrowsecurity` et `pg_policies`. |

Plus : le chemin d'erreur (la trace survit-elle à un échec ?), le chemin verrou
(`ran = false`), et un `supabase db reset` complet pour prouver que la migration
s'insère dans la séquence.
