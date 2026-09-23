-- Penduline — qui a créé, qui a coché (#53).
--
-- ── LA COLONNE QUI CHANGE DE SENS ────────────────────────────────────────────
--
-- `tasks.user_id` voulait dire « le propriétaire ». Depuis la migration A, ce
-- n'est plus vrai : la propriété est celle de la MATRICE (`boards.user_id`), et
-- les policies de `tasks` ne regardent plus cette colonne du tout. Elle ne dit
-- plus qu'une chose — qui a écrit cette ligne.
--
-- Elle est donc RENOMMÉE, et ce n'est pas de la cosmétique. Une colonne qui
-- change de sens sans changer de nom est une bombe à retardement : chaque site
-- d'écriture continue de compiler, et chacun d'eux porte désormais une intention
-- qu'on n'a pas relue. Le renommage les fait TOUS échouer à la compilation —
-- une dizaine, répartis sur trois clients. On ne compte pas sur la vigilance là
-- où le compilateur sait faire le travail.
--
-- ⚠️ `boards.user_id` et `universes.user_id` gardent leur nom ET leur sens :
-- propriétaire. Le renommage ne les concerne pas, et c'est cette asymétrie qui
-- rend les deux notions enfin distinguables à la lecture.
--
-- `alter table … rename column` emporte index, contraintes ET expressions de
-- policy (elles référencent l'attribut, pas son nom) — la leçon déjà apprise à
-- la migration `rooms_to_boards`. Les policies écrites en migration A avec
-- `user_id = auth.uid()` deviennent donc `author_id = auth.uid()` toutes seules.

alter table tasks            rename column user_id to author_id;
alter table task_attachments rename column user_id to author_id;

alter index tasks_user_idx            rename to tasks_author_idx;
alter index task_attachments_user_idx rename to task_attachments_author_idx;

comment on column tasks.author_id is
  'QUI A ÉCRIT cette ligne — pas qui la possède. La propriété est celle de la matrice (boards.user_id). Ne sert à aucune policy : l''accès passe par peut_lire/peut_ecrire sur board_id.';
comment on column task_attachments.author_id is
  'Qui a attaché ce lien. Même sens que tasks.author_id, et aucun rôle dans les policies.';

-- ── Qui a coché ──────────────────────────────────────────────────────────────
--
-- `completed_at` (livré la veille) dit QUAND. Sur une matrice partagée, la
-- question suivante tombe d'elle-même : par qui.
--
-- `on delete set null` : un compte supprimé ne doit pas emporter les tâches de
-- la matrice partagée où il travaillait. On perd le nom, pas le travail.
alter table tasks add column completed_by uuid references auth.users (id) on delete set null;

-- Le trigger existant est ÉTENDU, pas doublé. `completed_at` et `completed_by`
-- répondent à la même transition et doivent être posés — et effacés — ensemble :
-- deux triggers finiraient par diverger sur un cas que l'un couvre et l'autre non.
create or replace function public.tasks_completed_at()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- Une tâche créée déjà cochée (import, API) : rare, mais elle doit porter
    -- une date, sinon elle serait indistinguable d'une tâche ouverte.
    if new.done then
      new.completed_at = now();
      new.completed_by = auth.uid();
    end if;
    return new;
  end if;

  -- Cochée : on date, et on nomme. La comparaison porte sur la TRANSITION, pas
  -- sur la valeur : réécrire `done = true` sur une tâche déjà cochée ne doit ni
  -- déplacer la date, ni réattribuer le geste à qui passe par là.
  if new.done and not old.done then
    new.completed_at = now();
    new.completed_by = auth.uid();
  -- Décochée — annulation dans les quatre secondes, ou restauration depuis la
  -- corbeille. La date ET le nom partent : une tâche revenue dans la grille n'a
  -- pas été cochée, et en garder l'auteur ferait mentir un futur affichage.
  elsif old.done and not new.done then
    new.completed_at = null;
    new.completed_by = null;
  end if;

  return new;
end;
$$;

/*
  RATTRAPAGE — et il n'est pas une estimation, contrairement à celui de
  `completed_at`.

  Avant cette migration, le partage n'existait pas : une tâche cochée l'a
  forcément été par son auteur, puisque personne d'autre n'avait accès à la
  matrice. `author_id` n'est donc pas la meilleure approximation disponible,
  c'est la réponse exacte.

  ⚠️ Même désamorçage qu'à la migration `completed_at` : `tasks_updated_at` se
  déclenche sur TOUT update, sans liste de colonnes. Le laisser actif écraserait
  `updated_at` par `now()` sur chaque ligne touchée — c'est-à-dire la donnée sur
  laquelle les statistiques de #48 reposent encore.

  `tasks_completed_at` ne se déclenche pas ici : le SET ne touche pas `done`.
*/
alter table public.tasks disable trigger tasks_updated_at;

update public.tasks
   set completed_by = author_id
 where done and completed_by is null;

alter table public.tasks enable trigger tasks_updated_at;

-- ── Les statistiques ne doivent compter que SES propres complétions ─────────
--
-- ⚠️ LE CORRECTIF LE PLUS IMPORTANT DE CETTE MIGRATION, et le plus silencieux
-- si on l'oublie.
--
-- `completion_stats` est `security invoker` et n'a AUCUN prédicat sur la
-- personne : son cadrage venait entièrement de la policy `tasks`, qui disait
-- `user_id = auth.uid()`. Depuis la migration A, cette policy dit
-- `peut_lire(board_id)`. Sans la ligne ajoutée ci-dessous, l'écran de
-- statistiques se mettrait donc à compter les complétions des AUTRES sur les
-- matrices partagées — sans erreur, sans signe, juste des chiffres faux.
--
-- C'est la raison d'être de `completed_by` : il n'y avait, avant, aucun moyen
-- d'écrire ce prédicat.
--
-- Le reste de la fonction est inchangé — seule la clause `where` bouge.
create or replace function public.completion_stats(since timestamptz, tz text default 'UTC')
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with zone as (
    select case when exists (select 1 from pg_timezone_names n where n.name = tz)
                then tz else 'UTC' end as z
  ),
  termine as (
    select
      t.board_id,
      t.quadrant,
      date_trunc('week', t.updated_at at time zone (select z from zone))::date as semaine,
      extract(epoch from (t.updated_at - t.created_at))::bigint as age_seconds
    from public.tasks t
    where t.done
      and not t.deleted
      and t.parent_id is null
      and t.updated_at >= since
      -- Ajouté par #53 : voir le commentaire ci-dessus. Ce sont MES statistiques.
      and t.completed_by = auth.uid()
  )
  select jsonb_build_object(
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
  'Agrégats des tâches terminées PAR L''APPELANT depuis `since`, dans le fuseau `tz`. Rend un objet unique plutôt qu''un ensemble de lignes : max_rows=1000 tronquerait silencieusement une table de faits (semaine × matrice × case). Rend des sommes et des comptes, jamais des moyennes. Le prédicat completed_by = auth.uid() est obligatoire depuis #53 : la policy de tasks ne cadre plus sur la personne mais sur l''accès à la matrice, et sans lui la fonction compterait les complétions des autres sur les matrices partagées.';

-- ── Les deux autres RPC : élargissement VOULU, et vérifié ────────────────────
--
-- `search_tasks(q)` et `review_boards()` sont eux aussi `security invoker` sans
-- prédicat sur la personne. Leur cadrage s'élargit donc aux matrices partagées,
-- et c'est le comportement JUSTE :
--
--   search_tasks   — chercher dans ses matrices doit trouver dans celles qu'on
--                    partage, sinon la recherche ment par omission.
--   review_boards  — la revue périodique porte sur les matrices affichées à
--                    l'accueil, partagées comprises.
--
-- Ils ne sont donc pas modifiés. Ce commentaire existe pour qu'on ne les
-- retrouve pas dans six mois en se demandant s'ils ont été oubliés : ils ont été
-- relus, et laissés tels quels à dessein.
comment on function public.search_tasks(text) is
  'Recherche plein texte dans les tâches ACCESSIBLES à l''appelant. security invoker : le cadrage vient de la policy de tasks, qui depuis #53 couvre aussi les matrices partagées — élargissement voulu.';
comment on function public.review_boards() is
  'Faits par matrice, pour les matrices ACCESSIBLES à l''appelant. security invoker : depuis #53 le cadrage couvre les matrices partagées, comme l''accueil — élargissement voulu.';

-- ── Les index qui servaient l'ANCIENNE policy ────────────────────────────────
--
-- Quatre index partiels commencent par `user_id`. Ce n'était pas un choix de
-- requête : c'était la policy `user_id = auth.uid()` que le planificateur
-- poussait dans le parcours. Cette égalité a disparu — les policies appellent
-- maintenant `peut_lire(board_id)`, un appel de fonction que rien n'indexe.
--
-- Laissés tels quels, ces index commenceraient par une colonne que plus aucune
-- requête ne contraint : ils continueraient d'exister, d'être maintenus à chaque
-- écriture, et de ne plus rien servir. Une régression silencieuse, du genre
-- qu'on ne découvre qu'au premier compte volumineux.
--
-- Ils sont donc reconstruits sur ce que les requêtes contraignent VRAIMENT
-- aujourd'hui : la matrice pour les trois premiers, et `completed_by` pour le
-- quatrième — dont c'est désormais, littéralement, le prédicat.
drop index tasks_review_idx;
create index tasks_review_idx on tasks (board_id, quadrant, quadrant_changed_at)
  where not done and not deleted;

drop index tasks_due_idx;
create index tasks_due_idx on tasks (board_id, due_at)
  where due_at is not null and not done and not deleted;

drop index tasks_focus_idx;
create index tasks_focus_idx on tasks (author_id, focus_day)
  where focus_day is not null;

drop index tasks_completed_idx;
create index tasks_completed_idx on tasks (completed_by, updated_at)
  where done and not deleted and parent_id is null;

-- `tasks_focus_idx` garde l'auteur, et c'est voulu : le mode « Aujourd'hui » est
-- une intention PERSONNELLE. Deux personnes d'une matrice partagée n'ont pas la
-- même journée, et `focus_day` reste donc lu par son auteur.
--
-- ⚠️ Résidu connu et assumé : `focus_day` est une colonne de `tasks`, donc une
-- seule valeur pour tout le monde. Sur une matrice partagée, deux personnes qui
-- mettent la même tâche dans leur journée s'écrasent mutuellement. Le mode
-- « Aujourd'hui » n'est pas dans le périmètre de #53 ; c'est noté ici parce que
-- c'est ici qu'on s'en aperçoit.
