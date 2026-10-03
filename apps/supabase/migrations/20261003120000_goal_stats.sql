-- Penduline — les faits dont « Objectifs » a besoin.
--
-- ── POURQUOI UNE FONCTION DE PLUS ────────────────────────────────────────────
--
-- `completion_stats` compte ce qui a été terminé. « Objectifs » ne demande pas
-- COMBIEN mais COMMENT : une tâche de « Planifier » cochée sans avoir jamais eu
-- d'échéance n'a pas utilisé la case, une tâche d'« Éliminer » cochée contredit
-- la décision qu'on venait d'y prendre. Ces distinctions tiennent à des colonnes
-- que le client ne voit pas — depuis #40 il ne charge que les tâches OUVERTES,
-- et le barème parle presque entièrement de tâches finies.
--
-- ── CE QUE LA FONCTION NE FAIT PAS : LES SEUILS ──────────────────────────────
--
-- ⚠️ Aucun seuil ici. Pas « 7 jours », pas « 3 jours », aucun. La fonction rend
-- des FAITS — une durée, un booléen — et `packages/shared/src/goals.ts` applique
-- le barème, où il est testé. C'est la règle déjà posée par `review_boards` :
-- « les dupliquer en SQL serait deux vérités à tenir à jour », et celle des deux
-- qui dérive est toujours celle qu'on ne relit pas.
--
-- ── UNE LIGNE PAR TÂCHE, ET C'EST ASSUMÉ ─────────────────────────────────────
--
-- Le barème se juge tâche par tâche : agréger ici supposerait de connaître les
-- seuils, ce que le paragraphe précédent interdit. Le volume est borné par la
-- période (un an au plus) et chaque ligne porte quatre petits champs. Un compte
-- très actif sur douze mois produira quelques centaines de kilo-octets — le même
-- ordre de grandeur que la corbeille, et moins que la grille elle-même.
--
-- ── LE CADRAGE, ET SON ASYMÉTRIE ─────────────────────────────────────────────
--
-- `security invoker` : la policy de `tasks` fait le gros du travail. Mais sur une
-- matrice PARTAGÉE elle laisse passer les lignes des autres, et ce sont MES
-- objectifs. D'où un prédicat explicite, différent selon la sortie :
--
--   terminée  → `completed_by = auth.uid()`  (c'est moi qui ai coché)
--   supprimée → `author_id  = auth.uid()`     (personne ne « coche » une suppression)
--
-- L'asymétrie n'est pas une négligence : une suppression ne laisse aucune trace
-- de qui l'a faite, et l'auteur est le seul lien qui reste. Conséquence à
-- connaître : sur une matrice partagée, supprimer la tâche de quelqu'un d'autre
-- compte pour LUI, pas pour vous.

create or replace function public.goal_stats(
  since timestamptz,
  until timestamptz default now()
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with fini as (
    select
      t.quadrant,
      t.deleted,
      -- ⚠️ `coalesce` et non `completed_at` seul : la colonne est arrivée avec
      -- la migration `20260922100000_completed_at`, et tout ce qui a été coché
      -- avant ne la porte pas. `completion_stats` a fait le même choix — les
      -- deux écrans doivent dater une complétion de la même façon, sinon la
      -- rétrospective et les objectifs ne parlent pas de la même semaine.
      coalesce(t.completed_at, t.updated_at) as fini_le,
      t.quadrant_changed_at,
      t.due_at,
      t.completed_by,
      t.author_id
    from public.tasks t
    where t.parent_id is null
      -- Une étape n'est pas une ligne de barème : son classement appartient à
      -- son parent, qui est déjà compté.
      and (t.done or t.deleted)
      and coalesce(t.completed_at, t.updated_at) >= since
      and coalesce(t.completed_at, t.updated_at) < until
      and case
            when t.deleted and not t.done then t.author_id = auth.uid()
            else t.completed_by = auth.uid()
          end
  )
  select coalesce(
    (
      select jsonb_agg(
               jsonb_build_object(
                 'quadrant', f.quadrant,
                 -- `true` = elle a disparu ; `false` = elle a été cochée.
                 'deleted', f.deleted,
                 -- Secondes passées dans la case avant d'en sortir. `null` quand
                 -- `quadrant_changed_at` manque : la colonne date de la revue
                 -- périodique (#47), et rien avant elle n'est mesurable. Un
                 -- `null` doit rester un « je ne sais pas », jamais un zéro.
                 'in_quadrant_seconds',
                   case when f.quadrant_changed_at is null then null
                        else greatest(0, extract(epoch from (f.fini_le - f.quadrant_changed_at))::bigint)
                   end,
                 -- Avait-elle une échéance, et l'a-t-elle tenue ? `null` = pas
                 -- d'échéance du tout, ce qui est un cas distinct de « en retard ».
                 'on_time',
                   case when f.due_at is null then null else f.fini_le <= f.due_at end,
                 -- La seule délégation CONSTATÉE : quelqu'un d'autre a coché.
                 -- Toujours faux sur une matrice personnelle, par construction.
                 'by_other', f.completed_by is not null and f.completed_by is distinct from f.author_id
               )
             )
      from fini f
    ),
    '[]'::jsonb
  );
$$;

comment on function public.goal_stats(timestamptz, timestamptz) is
  'Les faits par tâche finie dont « Objectifs » tire son barème : la case, si elle a disparu ou été cochée, le temps passé dans la case, le respect de l''échéance, et si quelqu''un d''autre l''a cochée. AUCUN seuil — ils vivent dans packages/shared/src/goals.ts, où ils sont testés.';

grant execute on function public.goal_stats(timestamptz, timestamptz) to authenticated;
