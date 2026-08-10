-- Penduline — « pièce de la maison » → « matrice » générique.
--
-- Le modèle initial supposait un découpage par pièce (Cuisine, Garage…). Une
-- matrice peut en fait porter n'importe quel découpage : un moment de la
-- journée, un projet, un lieu. On renomme le concept sans toucher aux données.
--
-- `alter table ... rename` préserve lignes, index, contraintes et policies :
-- seuls les NOMS changent. Les renommages qui suivent ne sont donc que de
-- l'hygiène de schéma — mais ils évitent de laisser traîner `tasks_room_id_fkey`
-- sur une colonne qui s'appelle désormais `board_id`.

alter table rooms rename to boards;
alter table tasks rename column room_id to board_id;

alter index rooms_pkey      rename to boards_pkey;
alter index rooms_user_idx  rename to boards_user_idx;
alter index tasks_room_idx  rename to tasks_board_idx;

alter table boards rename constraint rooms_user_id_fkey to boards_user_id_fkey;
alter table boards rename constraint rooms_name_check   to boards_name_check;
alter table tasks  rename constraint tasks_room_id_fkey to tasks_board_id_fkey;

alter policy "rooms: owner" on boards rename to "boards: owner";
