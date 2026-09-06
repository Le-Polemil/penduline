-- Penduline — le moteur de planification (#20).
--
-- Les tâches récurrentes (#21) et les actions d'échéance (#22) ont besoin de la
-- même chose : quelqu'un doit agir quand l'utilisateur n'est pas là. Cette
-- migration livre cette brique une seule fois.
--
-- ⚠️ CE TICK NE FAIT ENCORE RIEN, ET C'EST VOULU. #21 et #22 ne sont pas
-- développés : lui inventer du travail aujourd'hui reviendrait à écrire du code
-- que personne n'appelle, contre une spécification qui n'existe pas. Ce qui est
-- livré ici, c'est la MÉCANIQUE — verrou, journal, rattrapage, droits — pour que
-- les deux tickets suivants n'aient plus qu'à remplir le corps.
--
-- ── LA DÉCISION QUI REND LE RATTRAPAGE GRATUIT ───────────────────────────────
--
-- Le tick CONVERGE, il n'avance pas d'un pas.
--
-- Il ne traite pas « ce qui s'est passé depuis la dernière exécution » mais
-- « tout ce qui est dû à cet instant ». La différence est tout sauf cosmétique :
--
--   par pas        une exécution manquée laisse un TROU qu'il faut détecter,
--                  mémoriser et rejouer — donc un curseur à maintenir, et un
--                  bug silencieux dès qu'il dérive.
--
--   par convergence  une exécution manquée signifie seulement que la suivante
--                    a plus à faire. Rien à mémoriser, rien à rejouer.
--
-- L'idempotence tombe du même raisonnement : si le tick amène l'état à ce qu'il
-- doit être, le relancer aussitôt ne trouve plus rien à faire. Deux exécutions
-- rapprochées ne produisent aucun doublon parce qu'à la seconde, le travail
-- n'est plus dû. C'est une propriété de la FORME de la fonction, pas une
-- vérification qu'on aurait ajoutée par-dessus.
--
-- Les contraintes d'unicité de #21 (`recurrence_id, occurrence_date`) resteront
-- néanmoins obligatoires : elles protègent de deux ticks CONCURRENTS, ce que le
-- verrou ci-dessous rend improbable mais pas impossible.

create extension if not exists pg_cron;

-- ── Le journal ───────────────────────────────────────────────────────────────
--
-- Sans lui, un cron silencieusement cassé ne se voit pas. C'est exactement ce
-- qui rend un planificateur dangereux : il ne tombe pas bruyamment, il cesse
-- simplement de passer, et on s'en aperçoit des semaines plus tard en constatant
-- qu'une échéance n'a jamais rien déclenché.
create table public.job_runs (
  id           bigint generated always as identity primary key,
  job          text not null,
  started_at   timestamptz not null default now(),
  -- `null` = l'exécution ne s'est jamais terminée. Le cas le plus instructif du
  -- journal : une ligne ouverte depuis des heures dit un processus tué ou un
  -- verrou tenu, deux pannes qu'aucun message d'erreur ne signalerait.
  finished_at  timestamptz,
  -- `false` = le verrou était déjà pris, l'exécution a cédé la place sans rien
  -- faire. Ce n'est ni un succès ni une erreur, et confondre les trois rendrait
  -- le journal illisible.
  ran          boolean not null default false,
  rows_touched integer not null default 0,
  error        text
);

-- Le seul parcours est « les dernières exécutions de tel job », jamais l'inverse.
create index job_runs_job_idx on public.job_runs (job, started_at desc);

-- ── Les droits, et pourquoi ils comptent plus qu'ailleurs ────────────────────
--
-- `job_runs` n'appartient à PERSONNE : ses lignes ne portent pas de `user_id` et
-- ne décrivent aucune donnée d'utilisateur. Elle n'est donc pas protégée comme
-- `tasks` — par une policy qui filtre — mais par l'absence totale d'accès.
--
-- Trois barrières, délibérément redondantes :
--   1. RLS activée SANS aucune policy — sous RLS, ce qui n'est pas autorisé est
--      refusé ; zéro policy signifie donc zéro ligne visible.
--   2. Aucun droit accordé à `anon` ni `authenticated`, ce qui la rend invisible
--      à PostgREST : elle n'apparaît même pas dans l'API.
--   3. Le `revoke` explicite ci-dessous, au cas où des *default privileges*
--      changeraient un jour sous nos pieds.
alter table public.job_runs enable row level security;
revoke all on public.job_runs from anon, authenticated;

comment on table public.job_runs is
  'Trace des exécutions de penduline_tick() (#20). Données d''exploitation, sans propriétaire : RLS activée sans aucune policy, et aucun droit pour anon/authenticated — la table est invisible à l''API.';

-- ── Le tick ──────────────────────────────────────────────────────────────────
--
-- `p_now` en paramètre plutôt que `now()` en dur, avec la même intention que le
-- `now: number = Date.now()` des fonctions de `packages/shared` : c'est ce qui
-- rend la fonction vérifiable. On peut lui présenter n'importe quel instant et
-- observer ce qu'elle décide, sans toucher à l'horloge du serveur.
--
-- `security definer` est nécessaire : le job n'a pas d'`auth.uid()`, il agit
-- pour TOUS les comptes à la fois. Ce n'est pas pour autant un contournement de
-- RLS offert à qui veut — l'exécution est révoquée à `public`, `anon` et
-- `authenticated` juste après. Aucun chemin n'y mène depuis l'API, et aucun
-- paramètre ne permet de la pointer vers les données d'un autre.
--
-- `search_path = ''` FIGÉ, et donc tout est qualifié. Sans lui, un schéma placé
-- devant `public` par un appelant ferait exécuter ses propres fonctions avec les
-- droits du propriétaire — l'escalade classique des `security definer`.
create function public.penduline_tick(p_now timestamptz default now())
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id  bigint;
  v_rows    integer := 0;
  v_locked  boolean;
begin
  insert into public.job_runs (job, started_at)
  values ('penduline_tick', p_now)
  returning id into v_run_id;

  -- Deux ticks en même temps ne doivent pas se marcher dessus. Le verrou est
  -- pris SANS attendre : si un tick précédent traîne encore, celui-ci renonce
  -- plutôt que de s'empiler derrière lui. Une exécution sautée n'est pas un
  -- problème — le tick converge, la suivante rattrapera (voir l'en-tête).
  --
  -- `pg_try_advisory_xact_lock` et non sa variante de session : le verrou est
  -- relâché à la fin de la transaction, y compris si le processus est tué. Un
  -- verrou de session survivrait au crash et bloquerait tous les ticks suivants.
  v_locked := pg_catalog.pg_try_advisory_xact_lock(
    -- Constante arbitraire mais STABLE : c'est elle qui identifie « le tick de
    -- Penduline » d'un processus à l'autre.
    pg_catalog.hashtext('penduline_tick')::bigint
  );

  if not v_locked then
    update public.job_runs
       set finished_at = pg_catalog.clock_timestamp(), ran = false
     where id = v_run_id;
    return 0;
  end if;

  begin
    -- ── LE TRAVAIL ───────────────────────────────────────────────────────────
    --
    -- Vide aujourd'hui. Ce que les tickets suivants viendront brancher ici :
    --
    --   #21  matérialiser les occurrences de récurrence dues à `p_now`, en
    --        s'appuyant sur l'unicité `(recurrence_id, occurrence_date)`.
    --   #22  appliquer les actions d'échéance dues à `p_now` — déplacer,
    --        épingler — protégées par un garde `due_applied_at`, sans quoi un
    --        déplacement automatique se rejouerait après un déplacement manuel.
    --
    -- Chacun ajoute son compte à `v_rows`. La règle à ne pas casser : ne traiter
    -- que ce qui est DÛ à `p_now`, jamais « ce qui a changé depuis ». C'est de
    -- là que viennent l'idempotence et le rattrapage.
    v_rows := 0;

    update public.job_runs
       set finished_at = pg_catalog.clock_timestamp(),
           ran = true,
           rows_touched = v_rows
     where id = v_run_id;

  exception when others then
    -- Le bloc interne est annulé, la ligne de journal survit : c'est tout
    -- l'intérêt d'avoir ouvert la trace AVANT le travail. Sans ce rattrapage,
    -- une erreur emporterait la transaction entière — et la seule preuve que le
    -- tick a échoué avec elle.
    update public.job_runs
       set finished_at = pg_catalog.clock_timestamp(),
           ran = true,
           error = pg_catalog.concat_ws(' | ', sqlstate, sqlerrm)
     where id = v_run_id;
  end;

  return v_rows;
end;
$$;

comment on function public.penduline_tick(timestamptz) is
  'Moteur de planification (#20). CONVERGE vers l''état dû à p_now plutôt que de traiter un delta : le rattrapage et l''idempotence en découlent. Corps vide tant que #21 et #22 ne sont pas livrés.';

-- L'exécution n'est offerte à aucun rôle joignable depuis l'API. Le job pg_cron
-- tourne sous le rôle qui l'a planifié — le propriétaire de la fonction — et n'a
-- donc besoin d'aucun droit supplémentaire.
--
-- ⚠️ `service_role` DOIT figurer ici, et c'est le piège. Les *default
-- privileges* de Supabase lui accordent `EXECUTE` sur toute fonction nouvelle :
-- révoquer `public`, `anon` et `authenticated` laisse donc un `service_role=X`
-- bien visible dans l'ACL. Ce rôle est porté par une clé — certes jamais exposée
-- au front (voir apps/supabase/README.md), mais une clé fuitée pourrait
-- déclencher le tick à volonté. Constaté en lisant `proacl` après coup, pas
-- deviné.
revoke all on function public.penduline_tick(timestamptz) from public;
revoke all on function public.penduline_tick(timestamptz) from anon, authenticated, service_role;

-- ── La planification ─────────────────────────────────────────────────────────
--
-- Toutes les heures. La granularité tient à ce que le tick servira : une
-- récurrence quotidienne et une échéance à l'heure près se satisfont d'une heure
-- de latence, et la machine de production est un 4 Go qui s'est déjà effondré
-- deux fois — on ne la réveille pas toutes les minutes pour ne rien trouver.
--
-- `cron.schedule` avec un NOM : en pg_cron ≥ 1.4, replanifier sous le même nom
-- remplace le job au lieu d'en créer un second. La migration reste donc
-- rejouable, ce qui n'irait pas de soi avec la variante anonyme.
select cron.schedule('penduline-tick', '0 * * * *', $cron$select public.penduline_tick()$cron$);
