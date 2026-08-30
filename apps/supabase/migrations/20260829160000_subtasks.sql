-- Penduline — sous-tâches, UN SEUL niveau de profondeur (#50).
--
-- Le README revendiquait l'absence de niveau intermédiaire : « boards → tasks
-- directement ». La platitude était un parti pris, pas un oubli. On l'abandonne
-- délibérément, et c'est pourquoi la profondeur est bornée par la base et non
-- par la seule interface : sans garantie côté données, « un seul niveau »
-- deviendrait « un seul niveau tant que personne ne se trompe ».

alter table public.tasks
  add column parent_id uuid references public.tasks (id) on delete cascade;

-- Les sous-tâches d'un parent, dans l'ordre. Le parcours est toujours
-- « donne-moi les enfants de X », jamais l'inverse.
create index tasks_parent_idx on public.tasks (parent_id, position);

/*
  Le niveau unique NE PEUT PAS être un `check`.

  Un `check` de ligne ne voit que la ligne : savoir si le parent désigné a
  lui-même un parent demande une lecture d'une AUTRE ligne, ce qu'un `check` ne
  sait pas faire. D'où un trigger — le seul endroit où la règle peut être vraie
  quoi qu'il arrive, y compris pour une écriture qui ne passerait pas par l'app.
*/
create or replace function public.tasks_depth_guard()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  -- Une tâche ne peut pas être sa propre parente.
  if new.parent_id = new.id then
    raise exception 'Une tâche ne peut pas être sa propre sous-tâche';
  end if;

  -- Le parent désigné doit être une tâche de premier niveau.
  if exists (select 1 from public.tasks p where p.id = new.parent_id and p.parent_id is not null) then
    raise exception 'Profondeur maximale atteinte : une sous-tâche ne peut pas en avoir';
  end if;

  -- Et symétriquement : une tâche qui a déjà des enfants ne peut pas devenir
  -- elle-même une sous-tâche. Sans ce second test, on créerait la même
  -- profondeur par l'autre bout.
  if exists (select 1 from public.tasks c where c.parent_id = new.id) then
    raise exception 'Cette tâche a des sous-tâches : elle ne peut pas en devenir une';
  end if;

  return new;
end;
$$;

create trigger tasks_depth_guard
  before insert or update of parent_id on public.tasks
  for each row execute function public.tasks_depth_guard();
