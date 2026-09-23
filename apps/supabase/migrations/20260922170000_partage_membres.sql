-- Penduline — nommer les gens d'une matrice partagée (#53).
--
-- ── LE PROBLÈME QUE LE PLAN N'AVAIT PAS VU ───────────────────────────────────
--
-- `board_members` ne porte que des `user_id`. Or tout ce que le partage doit
-- afficher est fait de NOMS :
--
--   la modale de partage   « alice@exemple.fr — écriture — Révoquer »
--   la carte de tâche      « par Alice », « coché par Bob »
--
-- Ces adresses vivent dans `auth.users`, que la RLS ferme complètement à
-- l'application. Sans cette fonction, l'interface n'aurait que des UUID à
-- montrer — c'est-à-dire rien.
--
-- ── POURQUOI UNE FONCTION, ET PAS UNE TABLE `profiles` ───────────────────────
--
-- Une table de profils dupliquerait l'adresse, exigerait un trigger de
-- synchronisation sur `auth.users`, et poserait la question de ce qu'on fait des
-- comptes créés avant elle. Beaucoup de machinerie pour une donnée qu'on a déjà.
--
-- ── CE QU'ELLE DIVULGUE, ET À QUI ────────────────────────────────────────────
--
-- ⚠️ `security definer` : elle lit `auth.users`, donc elle doit être bornée à la
-- main, et l'être STRICTEMENT.
--
-- Elle ne répond que sur une matrice que l'appelant peut lire, et ne rend que
-- les gens de CETTE matrice. Impossible de s'en servir pour parcourir les
-- comptes de la base : sans `peut_lire`, elle ne rend rien du tout.
--
-- Le partage rend de toute façon ces adresses mutuellement connues — on invite
-- quelqu'un par son adresse, et on voit qui coche ses tâches. La fonction
-- n'ouvre donc rien que le partage lui-même ne suppose.
create or replace function public.membres_matrice(p_board uuid)
returns table (
  user_id      uuid,
  email        text,
  role         board_role,
  proprietaire boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- Le propriétaire EN PREMIER, et marqué comme tel. Il ne figure pas dans
  -- `board_members` (c'est `boards.user_id` qui fait autorité), mais l'interface
  -- doit le montrer : une liste de partage où le propriétaire manque se lit
  -- comme une liste incomplète.
  select b.user_id, u.email::text, null::board_role, true
    from public.boards b
    left join auth.users u on u.id = b.user_id
   where b.id = p_board and public.peut_lire(p_board)

  union all

  select m.user_id, u.email::text, m.role, false
    from public.board_members m
    left join auth.users u on u.id = m.user_id
   where m.board_id = p_board and public.peut_lire(p_board)
   order by 4 desc, 2;
$$;

comment on function public.membres_matrice(uuid) is
  'Qui a accès à cette matrice, avec les adresses — la modale de partage et l''attribution sur les cartes en ont besoin, et auth.users est fermé à l''application. security definer, mais bornée par peut_lire : sans accès à la matrice, elle ne rend rien. Le propriétaire y figure, marqué, bien qu''il ne soit pas dans board_members.';
