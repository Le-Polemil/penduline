-- Seed LOCAL uniquement (exécuté par `supabase db reset`, jamais par `db push`).
-- Crée un compte de démo + des pièces, pour tester tout de suite sans passer par
-- l'inscription. Identifiants : demo@penduline.test / password123
--
-- Ne JAMAIS reproduire ce genre d'insertion directe dans auth.users en prod.

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

-- ── Pièces + tâches (mêmes exemples que le seed applicatif) ───────────────────
insert into rooms (id, user_id, name, position) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Cuisine',       0),
  ('a1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Salle de bain', 1),
  ('a1111111-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Salon',         2),
  ('a1111111-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Garage',        3)
on conflict (id) do nothing;

insert into tasks (user_id, room_id, title, quadrant, pinned, position) values
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Fuite sous l''évier',            'faire',     true,  0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Ampoule grillée',                'faire',     false, 1),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Repeindre le plafond',           'planifier', false, 0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Détartrer la bouilloire',        'planifier', false, 1),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Appeler le plombier',            'deleguer',  false, 0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Trier le tiroir à sacs',         'eliminer',  false, 0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Acheter un nouveau grille-pain ?', 'parking',   false, 0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000002', 'Joint de douche à refaire',      'faire',     false, 0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000002', 'Remplacer le miroir',            'planifier', false, 0),
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000003', 'Fixer l''étagère',               'planifier', false, 0);
