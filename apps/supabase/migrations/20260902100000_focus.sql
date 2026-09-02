-- Penduline — le mode « aujourd'hui » (#49).
--
-- UNE COLONNE, ET L'EXPIRATION DEVIENT GRATUITE.
--
-- Sélectionnée pour aujourd'hui = `focus_day` égale la date locale du jour. La
-- sélection de la veille ne s'efface pas : elle CESSE DE CORRESPONDRE.
--
--   lundi   focus_day = 2026-09-07  →  dans la sélection du jour
--   mardi   focus_day = 2026-09-07  →  ne correspond plus, donc sortie
--
-- Aucun `cron`, aucun travail de nettoyage, aucune logique de TTL à maintenir —
-- c'est tout ce qu'une table dédiée aurait coûté pour un résultat identique.
--
-- Et la valeur de la veille SURVIT volontairement : c'est elle qui permet le
-- bilan du soir. La purger serait perdre l'information juste après l'avoir eue.
--
-- POURQUOI AUCUN FUSEAU ICI, CONTRAIREMENT À #48.
--
-- `completion_stats` agrège par semaine, donc forcément côté serveur, donc le
-- fuseau devait voyager. Ici la question est « quel jour sommes-nous ? » : le
-- client le sait, et il vaut mieux qu'il le dise. Il écrit la date qu'il veut
-- dire (`YYYY-MM-DD` calculé localement) et la compare à son propre aujourd'hui.
--
-- D'où le type `date` et non `timestamptz` : une date sans fuseau ne peut pas
-- être mal interprétée, là où un horodatage inviterait à des conversions dont
-- aucune ne serait la bonne.
alter table public.tasks
  add column focus_day date;

comment on column public.tasks.focus_day is
  'Jour pour lequel la tâche a été choisie (mode « aujourd''hui », #49). `null` = hors sélection. Date LOCALE écrite par le client : la base ne convertit jamais. La sélection n''expire pas, elle cesse de correspondre — et la valeur de la veille survit pour le bilan du soir.';

-- Le seul accès est « donne-moi mes tâches à focus », jamais l'inverse. L'index
-- est partiel parce que la très grande majorité des lignes porte `null`.
create index tasks_focus_idx
  on public.tasks (user_id, focus_day)
  where focus_day is not null;
