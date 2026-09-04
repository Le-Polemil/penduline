-- Penduline — la matière des statistiques rétrospectives (#48).
--
-- AUCUNE COLONNE AJOUTÉE, et c'est le point le plus important de ce fichier.
--
-- On pouvait croire qu'il manquait un `completed_at` — c'est ce que #47 a dû
-- ajouter pour son propre besoin. Ici, non : le correctif de #75 a réglé la
-- question sans le savoir. Cocher n'est plus qu'UNE SEULE écriture, portant
-- `done` et `archived` ensemble, immédiate (`useCompletion.ts` :
-- `planPairDetach(tasks, task, { done: true, archived: true, pinned: false })`).
-- Il n'existe plus d'écart de quatre secondes en base.
--
-- Donc pour une tâche `done`, `updated_at` EST l'instant de complétion, au
-- millième. Ce n'est pas un proxy approximatif : ne pas « améliorer » ceci en
-- ajoutant une colonne, elle dupliquerait ce que la base sait déjà.
--
-- Deux conséquences assumées, et dites à l'écran :
--   • une tâche terminée PUIS SUPPRIMÉE porte la date de sa suppression, pas de
--     sa complétion — d'où le `not deleted`, qui la fait sortir des stats ;
--   • une tâche restaurée puis re-terminée compte à sa DERNIÈRE complétion.

-- Le prédicat de « terminée » est le miroir exact de celui du client : `done`,
-- pas supprimée, et pas une étape — cocher une étape n'est pas terminer une
-- tâche (`isOpenRow`, #50).
create index tasks_completed_idx
  on public.tasks (user_id, updated_at)
  where done and not deleted and parent_id is null;

/*
  POURQUOI CETTE FONCTION REND UN OBJET, ET NON UN `setof`.

  `apps/supabase/config.toml` porte `max_rows = 1000`, et ce plafond frappe aussi
  les fonctions renvoyant un ensemble de lignes — SILENCIEUSEMENT. C'est le piège
  de #40, celui qui faisait perdre des tâches ouvertes sans le moindre message.

  Une table de faits (semaine × matrice × case) sur un an d'usage actif s'en
  approche : 52 × 10 × 5 = 2600 lignes. Tronquée sans erreur, elle produirait des
  statistiques fausses et muettes — le pire des deux mondes pour un écran dont
  l'unique fonction est de dire vrai.

  Un `jsonb` tient dans une ligne. Le plafond ne peut pas s'appliquer.

  C'est un écart au précédent de `search_tasks` (qui rend `setof tasks`), et il
  n'est pris que pour cette raison.

  POURQUOI DES SOMMES ET JAMAIS DES MOYENNES.

  La fonction rend `age_seconds_total` et `completed` séparément, pas un délai
  moyen. Une moyenne pré-calculée interdirait tout regroupement ultérieur :
  moyenner des moyennes de tailles inégales donne un résultat faux, et faux d'une
  manière que personne ne remarque jamais. Avec la somme et le compte, le client
  regroupe par case, par matrice ou par période sans se tromper.

  POURQUOI UN FUSEAU EN PARAMÈTRE.

  Mesuré, pas supposé : `date_trunc('week', …)` travaille dans le fuseau de la
  session Postgres, qui est UTC. Une tâche terminée le lundi à 1 h du matin à
  Paris tombait donc dans la semaine PRÉCÉDENTE —

      date_trunc('week', '2026-08-31T01:00:00+02')                    → 2026-08-24
      date_trunc('week', '2026-08-31T01:00:00+02' at time zone 'Europe/Paris')
                                                                      → 2026-08-31

  Le client passe son fuseau (`Intl.DateTimeFormat().resolvedOptions().timeZone`).

  `security invoker` : la policy RLS de `tasks` (`user_id = auth.uid()`)
  s'applique telle quelle à l'intérieur. Pas de second modèle de sécurité à tenir
  à jour à côté du premier.

  `stable` : même entrée, même sortie dans une transaction — PostgREST l'autorise
  alors en GET.
*/
create or replace function public.completion_stats(since timestamptz, tz text default 'UTC')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with zone as (
    -- `tz` vient du navigateur. Un fuseau inconnu de cette version de Postgres
    -- ferait LEVER `at time zone`, et l'écran entier tomberait pour une chaîne
    -- mal formée. On retombe sur UTC : des semaines décalées de deux heures
    -- valent mieux qu'une page blanche.
    select case when exists (select 1 from pg_timezone_names n where n.name = tz)
                then tz else 'UTC' end as z
  ),
  termine as (
    select
      t.board_id,
      t.quadrant,
      date_trunc('week', t.updated_at at time zone (select z from zone))::date as semaine,
      -- `updated_at - created_at` sur une tâche terminée : le temps qu'elle a
      -- vécu. Positif par construction.
      extract(epoch from (t.updated_at - t.created_at))::bigint as age_seconds
    from public.tasks t
    where t.done
      and not t.deleted
      and t.parent_id is null
      and t.updated_at >= since
  )
  select jsonb_build_object(
    -- `order by quadrant` : l'enum est déclaré dans l'ordre d'affichage
    -- (faire, planifier, deleguer, eliminer, parking), le tri est donc gratuit.
    'by_quadrant', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'quadrant', q.quadrant,
                 'completed', q.completed,
                 'age_seconds_total', q.age_seconds_total
               ) order by q.quadrant
             )
      from (
        select quadrant, count(*)::int as completed, sum(age_seconds)::bigint as age_seconds_total
        from termine group by quadrant
      ) q
    ), '[]'::jsonb),

    'by_week', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'week', w.semaine,
                 'quadrant', w.quadrant,
                 'completed', w.completed
               ) order by w.semaine, w.quadrant
             )
      from (
        select semaine, quadrant, count(*)::int as completed
        from termine group by semaine, quadrant
      ) w
    ), '[]'::jsonb),

    'by_board', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'board_id', b.board_id,
                 'quadrant', b.quadrant,
                 'completed', b.completed,
                 'age_seconds_total', b.age_seconds_total
               ) order by b.board_id, b.quadrant
             )
      from (
        select board_id, quadrant, count(*)::int as completed, sum(age_seconds)::bigint as age_seconds_total
        from termine group by board_id, quadrant
      ) b
    ), '[]'::jsonb)
  );
$$;

comment on function public.completion_stats(timestamptz, text) is
  'Agrégats des tâches terminées depuis `since`, dans le fuseau `tz`. Rend un objet unique plutôt qu''un ensemble de lignes : max_rows=1000 tronquerait silencieusement une table de faits (semaine × matrice × case). Rend des sommes et des comptes, jamais des moyennes — moyenner des moyennes est faux, et invisible.';
