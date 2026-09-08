-- Seed LOCAL uniquement (exécuté par `supabase db reset`, jamais par `db push`).
-- Crée un compte de démo + des matrices, pour tester tout de suite sans passer
-- par l'inscription. Identifiants : demo@penduline.test / password123
--
-- Ne JAMAIS reproduire ce genre d'insertion directe dans auth.users en prod.
--
-- Les matrices ci-dessous illustrent volontairement des découpages différents
-- (un lieu, un moment, un projet) : l'app n'impose aucune lecture particulière.

create extension if not exists pgcrypto with schema extensions;

-- ── Compte de démo ───────────────────────────────────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'demo@penduline.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '11111111-1111-1111-1111-111111111111',
  '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"demo@penduline.test"}',
  'email', now(), now(), now()
) on conflict (provider_id, provider) do nothing;

-- ── Second compte, VOLONTAIREMENT SANS DONNÉES ───────────────────────────────
-- Il n'existe que pour une chose : vérifier le CLOISONNEMENT. Le temps réel de
-- Supabase n'applique aucune policy aux événements `DELETE` — il caviarde
-- seulement la charge utile à la clé primaire — de sorte que le filtre serveur
-- `user_id=eq.<moi>` est la SEULE barrière qui empêche un compte de recevoir
-- l'identifiant de chaque suppression des autres. Mesuré le 2026-09-08 (#117).
--
-- `packages/shared/src/realtime.live.test.ts` verrouille cette propriété, et il
-- lui faut un second compte pour le faire. Sans ce bloc, ce test s'ABSTIENT au
-- lieu d'échouer : le verrou serait inerte, ce qui est pire qu'absent.
--
-- Aucune matrice, aucune tâche : il ne doit rien voir, et n'a donc rien à voir.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated', 'intrus@penduline.test',
  extensions.crypt('password123', extensions.gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}', '{}',
  '', '', '', ''
) on conflict (id) do nothing;

insert into auth.identities (
  provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values (
  '22222222-2222-2222-2222-222222222222',
  '22222222-2222-2222-2222-222222222222',
  '{"sub":"22222222-2222-2222-2222-222222222222","email":"intrus@penduline.test"}',
  'email', now(), now(), now()
) on conflict (provider_id, provider) do nothing;

-- ── Univers ──────────────────────────────────────────────────────────────────
-- Deux univers seulement, et une matrice qui n'appartient à aucun : « sans
-- univers » n'est pas un cas dégradé à corriger, c'est un état normal que le
-- seed doit montrer.
insert into universes (id, user_id, name, position) values
  ('c1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Maison', 0),
  ('c1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Boulot', 1)
on conflict (id) do nothing;

-- ── Matrices + tâches ────────────────────────────────────────────────────────
insert into boards (id, user_id, name, universe_id, position) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cuisine',           'c1111111-0000-0000-0000-000000000001', 0),
  ('a1111111-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Déménagement',      'c1111111-0000-0000-0000-000000000001', 1),
  ('a1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Cette semaine',     'c1111111-0000-0000-0000-000000000002', 0),
  ('a1111111-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Un jour peut-être', null,                                   0)
on conflict (id) do nothing;

insert into tasks (user_id, board_id, title, quadrant, position) values
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Fuite sous l''évier',        'faire',      0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Détartrer la bouilloire',    'planifier',  0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Appeler le plombier',        'deleguer',   0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000002', 'Rendre le dossier vendredi', 'faire',      0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000002', 'Préparer la rétro',          'planifier',  0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000002', 'Répondre aux relances',      'deleguer',   0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000003', 'Résilier la box',            'faire',      0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000003', 'Réserver le camion',         'planifier',  0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000003', 'Trier le garage',            'eliminer',   0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000004', 'Apprendre le piano ?',       'parking',    0);
