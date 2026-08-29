-- Penduline — recherche sur le titre des tâches, toutes matrices confondues.
--
-- POURQUOI UNE FONCTION, ET PAS UN FILTRE REST.
-- `unaccent()` doit envelopper la colonne (`unaccent(title) ilike unaccent(q)`),
-- et la syntaxe de filtre de PostgREST ne sait pas appeler de fonction sur un
-- champ. Une fonction exposée en RPC est le seul chemin — et c'est celui que le
-- projet a déjà retenu, les Edge Functions ayant été retirées de la stack.
--
-- POURQUOI CÔTÉ SERVEUR ET PAS EN MÉMOIRE.
-- Depuis #40, le client ne charge plus que les tâches ouvertes. Une recherche en
-- mémoire ne trouverait donc ni les terminées ni les supprimées — or retrouver
-- une tâche supprimée est précisément un cas d'usage du ticket.
--
-- PAS D'INDEX `tsvector`.
-- Le volume reste modeste, et `unaccent()` n'est pas immuable : l'indexer
-- demanderait un enrobage supplémentaire. À reconsidérer quand la mesure le dira,
-- pas avant.

create extension if not exists unaccent with schema extensions;

/*
  `security invoker` : la policy RLS de `tasks` (`user_id = auth.uid()`)
  s'applique telle quelle à l'intérieur. La fonction n'a aucun privilège propre,
  et il n'y a donc pas un second modèle de sécurité à tenir à jour à côté du
  premier.

  `stable` : même entrée, même sortie dans une transaction — le planificateur
  peut en tirer parti, et PostgREST l'autorise alors en GET.
*/
create or replace function public.search_tasks(q text)
returns setof public.tasks
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select t.*
  from public.tasks t
  where
    -- Une recherche vide ne rend rien, plutôt que de rendre TOUT : le coût d'un
    -- champ qu'on vient d'ouvrir ne doit pas être la table entière.
    length(btrim(q)) > 0
    and extensions.unaccent(t.title) ilike
        -- Le motif est échappé : un `%` ou un `_` saisi par l'utilisateur est un
        -- caractère qu'il cherche, pas un joker. Sans ça, taper « % » rend toute
        -- la table et la recherche paraît folle.
        '%' || replace(replace(replace(extensions.unaccent(btrim(q)), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  -- L'ordre dans lequel on cherche : ce qui reste à faire, puis ce qui est fait,
  -- puis ce qui est jeté. À égalité, le plus récemment touché d'abord.
  order by t.deleted, t.done, t.updated_at desc
  -- Plafonné dans le même esprit que #40 : au-delà, c'est la requête qu'il faut
  -- affiner, pas la liste qu'il faut faire défiler.
  limit 50;
$$;

comment on function public.search_tasks(text) is
  'Recherche insensible à la casse et aux accents sur le titre des tâches de l''utilisateur.';
