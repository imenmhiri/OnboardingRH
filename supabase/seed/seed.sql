-- Jeu de démonstration : deux filiales du même groupe, volontairement
-- dissemblables. Aucune ligne de code ne les distingue — seules ces données
-- changent : palette, semaine de travail, sites et jours fériés.

insert into public.companies (id, slug, name, legal_name, locale, time_zone, weekend, brand_primary, brand_primary_contrast, brand_accent)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'atelier-nord',
    'Atelier Nord',
    'Atelier Nord SAS',
    'fr-FR',
    'Europe/Paris',
    '{saturday,sunday}',
    'oklch(0.48 0.16 264)',
    'oklch(0.99 0 0)',
    'oklch(0.74 0.13 162)'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'meridien-gulf',
    'Méridien Gulf',
    'Méridien Gulf LLC',
    'fr-FR',
    'Asia/Dubai',
    '{friday,saturday}',
    'oklch(0.55 0.14 42)',
    'oklch(0.99 0 0)',
    'oklch(0.70 0.12 200)'
  );

insert into public.sites (id, company_id, slug, name, city, country_code, time_zone, weekend)
values
  ('a1111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'lille', 'Siège de Lille', 'Lille', 'FR', 'Europe/Paris', null),
  ('a1111111-1111-4111-8111-222222222222', '11111111-1111-4111-8111-111111111111', 'strasbourg', 'Agence de Strasbourg', 'Strasbourg', 'FR', 'Europe/Paris', null),
  ('a2222222-2222-4222-8222-111111111111', '22222222-2222-4222-8222-222222222222', 'dubai', 'Bureau de Dubaï', 'Dubaï', 'AE', 'Asia/Dubai', null);

-- Fériés société : valables sur tous les sites.
insert into public.holidays (company_id, site_id, observed_on, label)
values
  ('11111111-1111-4111-8111-111111111111', null, '2026-01-01', 'Jour de l''an'),
  ('11111111-1111-4111-8111-111111111111', null, '2026-04-06', 'Lundi de Pâques'),
  ('11111111-1111-4111-8111-111111111111', null, '2026-05-01', 'Fête du Travail'),
  ('11111111-1111-4111-8111-111111111111', null, '2026-05-08', 'Victoire 1945'),
  ('11111111-1111-4111-8111-111111111111', null, '2026-05-14', 'Ascension'),
  ('11111111-1111-4111-8111-111111111111', null, '2026-07-14', 'Fête nationale'),
  ('11111111-1111-4111-8111-111111111111', null, '2026-12-25', 'Noël'),
  ('22222222-2222-4222-8222-222222222222', null, '2026-12-02', 'Fête nationale des Émirats');

-- Fériés propres à un site : le droit local d'Alsace-Moselle ajoute deux jours
-- que le siège de Lille ne connaît pas.
insert into public.holidays (company_id, site_id, observed_on, label)
values
  ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-222222222222', '2026-04-03', 'Vendredi saint (Alsace-Moselle)'),
  ('11111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-222222222222', '2026-12-26', 'Saint-Étienne (Alsace-Moselle)');

-- ============================================================================
-- Comptes de démonstration
-- ============================================================================
-- Un mot de passe unique pour tous, pour une démonstration fluide. GoTrue exige
-- ces colonnes non nulles (sans quoi l'API d'administration casse loin d'ici,
-- comme découvert en préparant T-05) ; le mot de passe est haché avec pgcrypto,
-- au même format bcrypt que GoTrue produit lui-même.
do $$
declare
  demo_password constant text := 'OnboardingDemo!2026';
  password_hash text := extensions.crypt(demo_password, extensions.gen_salt('bf'));
  nord constant uuid := '11111111-1111-4111-8111-111111111111';
  gulf constant uuid := '22222222-2222-4222-8222-222222222222';
  rh_id constant uuid := 'e0000000-0000-4000-8000-000000000001';
  manager_id constant uuid := 'e0000000-0000-4000-8000-000000000002';
  it_id constant uuid := 'e0000000-0000-4000-8000-000000000003';
  alice_id constant uuid := 'e0000000-0000-4000-8000-000000000004';
  nadia_id constant uuid := 'e0000000-0000-4000-8000-000000000005';
  claire_id constant uuid := 'e0000000-0000-4000-8000-000000000006';
  account record;
begin
  for account in
    select * from (values
      (rh_id, 'rh@atelier-nord.demo', 'Rachel Renard'),
      (manager_id, 'manager@atelier-nord.demo', 'Marc Manceau'),
      (it_id, 'it@atelier-nord.demo', 'Ivan Informatique'),
      (alice_id, 'alice@atelier-nord.demo', 'Alice Arrivante'),
      (nadia_id, 'nadia@groupe.demo', 'Nadia Nour'),
      (claire_id, 'claire@atelier-nord.demo', 'Claire Collègue')
    ) as t(id, email, full_name)
  loop
    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    )
    values (
      account.id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      account.email, password_hash,
      now(), now(), now(),
      '{}'::jsonb, jsonb_build_object('full_name', account.full_name),
      '', '', '', '', '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into public.profiles (id, full_name)
    values (account.id, account.full_name)
    on conflict (id) do nothing;
  end loop;

  insert into public.company_members (company_id, user_id, role, site_id)
  values
    (nord, rh_id, 'hr_admin', null),
    (nord, manager_id, 'manager', null),
    (nord, it_id, 'it', null),
    (nord, alice_id, 'employee', 'a1111111-1111-4111-8111-111111111111'),
    (nord, claire_id, 'employee', 'a1111111-1111-4111-8111-111111111111'),
    -- Nadia demontre la bascule multi-societes : manager cote Nord, simple
    -- employee cote Gulf, avec deux marques et deux roles differents.
    (nord, nadia_id, 'manager', null),
    (gulf, nadia_id, 'employee', 'a2222222-2222-4222-8222-111111111111')
  on conflict do nothing;
end $$;

-- ============================================================================
-- Templates de parcours
-- ============================================================================
-- Un template par défaut pour Atelier Nord, sans aucun critère : c'est lui qui
-- se sélectionne tant qu'aucun template plus spécifique n'existe.
insert into public.journey_templates (id, company_id, name, job_family, site_id, contract_type)
values ('f0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Parcours standard', null, null, null);

insert into public.template_tasks (id, template_id, key, title, owner_role, offset_working_days, expected_document, shared_key, position)
values
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'contract', 'Contrat signé', 'hr_admin', -5, 'contrat-signe', null, 1),
  ('f1000000-0000-4000-8000-000000000002', 'f0000000-0000-4000-8000-000000000001', 'it-account', 'Créer le compte IT', 'it', -2, null, null, 2),
  ('f1000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000001', 'badge', 'Commander le badge d''accès', 'it', -2, null, 'badge-atelier-nord', 3),
  ('f1000000-0000-4000-8000-000000000004', 'f0000000-0000-4000-8000-000000000001', 'workstation', 'Préparer le poste de travail', 'it', -1, null, null, 4),
  ('f1000000-0000-4000-8000-000000000005', 'f0000000-0000-4000-8000-000000000001', 'welcome', 'Accueil et remise du matériel', 'manager', 0, 'accuse-reception', null, 5),
  ('f1000000-0000-4000-8000-000000000006', 'f0000000-0000-4000-8000-000000000001', 'week-one-review', 'Point de fin de première semaine', 'manager', 5, null, null, 6);

insert into public.template_task_dependencies (template_task_id, depends_on_id)
values
  ('f1000000-0000-4000-8000-000000000002', 'f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000004', 'f1000000-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000004'),
  ('f1000000-0000-4000-8000-000000000005', 'f1000000-0000-4000-8000-000000000003'),
  ('f1000000-0000-4000-8000-000000000006', 'f1000000-0000-4000-8000-000000000005');

-- ============================================================================
-- Parcours de démonstration
-- ============================================================================
-- Les dates sont relatives à aujourd'hui (current_date), pas figées : la
-- démonstration reste à jour quelle que soit la date à laquelle elle est
-- rejouée, des mois après l'écriture de ce seed.
do $$
declare
  nord constant uuid := '11111111-1111-4111-8111-111111111111';
  site_lille constant uuid := 'a1111111-1111-4111-8111-111111111111';
  template constant uuid := 'f0000000-0000-4000-8000-000000000001';
  manager_id constant uuid := 'e0000000-0000-4000-8000-000000000002';
  it_id constant uuid := 'e0000000-0000-4000-8000-000000000003';
  alice_id constant uuid := 'e0000000-0000-4000-8000-000000000004';
  claire_id constant uuid := 'e0000000-0000-4000-8000-000000000006';

  -- Quatre parcours, à des stades différents.
  j_upcoming constant uuid := 'a0000000-0000-4000-8000-000000000001'; -- à venir
  j_progress constant uuid := 'a0000000-0000-4000-8000-000000000002'; -- en cours
  j_blocked  constant uuid := 'a0000000-0000-4000-8000-000000000003'; -- bloqué
  j_done     constant uuid := 'a0000000-0000-4000-8000-000000000004'; -- terminé
begin
  -- Les deux comptes employés de démonstration portent chacun un parcours, à un
  -- stade différent : sans cela, se connecter en tant qu'employé ne montrerait
  -- rien. Diego et Farida restent sans compte, ce qui est le cas réel d'une
  -- embauche dont l'accès n'est pas encore créé.
  insert into public.journeys (id, company_id, site_id, template_id, employee_id, employee_name, job_family, contract_type, manager_id, arrival_date, status)
  values
    (j_upcoming, nord, site_lille, template, claire_id, 'Claire Collègue', 'atelier', 'cdi', manager_id, current_date + 10, 'scheduled'),
    (j_progress, nord, site_lille, template, alice_id, 'Alice Arrivante', 'atelier', 'cdi', manager_id, current_date - 3, 'in_progress'),
    (j_blocked, nord, site_lille, template, null, 'Diego Retardé', 'atelier', 'cdi', manager_id, current_date - 8, 'in_progress'),
    (j_done, nord, site_lille, template, null, 'Farida Fin', 'atelier', 'cdi', manager_id, current_date - 45, 'completed');

  -- --- Parcours à venir : toutes les tâches sont encore devant nous. ---
  insert into public.tasks (id, company_id, journey_id, template_key, title, owner_role, owner_id, due_on, offset_working_days, status, expected_document, shared_key)
  values
    ('b1000000-0000-4000-8000-000000000001', nord, j_upcoming, 'contract', 'Contrat signé', 'hr_admin', null, current_date + 5, -5, 'pending', 'contrat-signe', null),
    ('b1000000-0000-4000-8000-000000000002', nord, j_upcoming, 'it-account', 'Créer le compte IT', 'it', null, current_date + 8, -2, 'pending', null, null),
    ('b1000000-0000-4000-8000-000000000003', nord, j_upcoming, 'badge', 'Commander le badge d''accès', 'it', null, current_date + 8, -2, 'pending', null, 'badge-atelier-nord'),
    ('b1000000-0000-4000-8000-000000000004', nord, j_upcoming, 'workstation', 'Préparer le poste de travail', 'it', null, current_date + 9, -1, 'pending', null, null),
    ('b1000000-0000-4000-8000-000000000005', nord, j_upcoming, 'welcome', 'Accueil et remise du matériel', 'manager', manager_id, current_date + 10, 0, 'pending', 'accuse-reception', null),
    ('b1000000-0000-4000-8000-000000000006', nord, j_upcoming, 'week-one-review', 'Point de fin de première semaine', 'manager', manager_id, current_date + 17, 5, 'pending', null, null);

  -- --- Parcours en cours : arrivée passée, premières tâches soldées. ---
  insert into public.tasks (id, company_id, journey_id, template_key, title, owner_role, owner_id, due_on, offset_working_days, status, expected_document, shared_key, completed_at)
  values
    ('b2000000-0000-4000-8000-000000000001', nord, j_progress, 'contract', 'Contrat signé', 'hr_admin', null, current_date - 8, -5, 'done', 'contrat-signe', null, now() - interval '9 days'),
    ('b2000000-0000-4000-8000-000000000002', nord, j_progress, 'it-account', 'Créer le compte IT', 'it', it_id, current_date - 5, -2, 'done', null, null, now() - interval '4 days'),
    ('b2000000-0000-4000-8000-000000000003', nord, j_progress, 'badge', 'Commander le badge d''accès', 'it', it_id, current_date - 5, -2, 'done', null, null, now() - interval '4 days'),
    ('b2000000-0000-4000-8000-000000000004', nord, j_progress, 'workstation', 'Préparer le poste de travail', 'it', it_id, current_date - 4, -1, 'done', null, null, now() - interval '3 days'),
    ('b2000000-0000-4000-8000-000000000005', nord, j_progress, 'welcome', 'Accueil et remise du matériel', 'manager', manager_id, current_date - 3, 0, 'done', 'accuse-reception', null, now() - interval '3 days'),
    ('b2000000-0000-4000-8000-000000000006', nord, j_progress, 'week-one-review', 'Point de fin de première semaine', 'manager', manager_id, current_date + 4, 5, 'pending', null, null, null);

  -- --- Parcours bloqué : le compte IT n'a jamais été créé, en retard, et tout
  -- ce qui en dépend est bloqué à la chaîne. ---
  insert into public.tasks (id, company_id, journey_id, template_key, title, owner_role, owner_id, due_on, offset_working_days, status, expected_document, shared_key, completed_at)
  values
    ('b3000000-0000-4000-8000-000000000001', nord, j_blocked, 'contract', 'Contrat signé', 'hr_admin', null, current_date - 13, -5, 'done', 'contrat-signe', null, now() - interval '14 days'),
    ('b3000000-0000-4000-8000-000000000002', nord, j_blocked, 'it-account', 'Créer le compte IT', 'it', null, current_date - 10, -2, 'pending', null, null, null),
    ('b3000000-0000-4000-8000-000000000003', nord, j_blocked, 'badge', 'Commander le badge d''accès', 'it', it_id, current_date - 10, -2, 'done', null, 'badge-atelier-nord', now() - interval '9 days'),
    ('b3000000-0000-4000-8000-000000000004', nord, j_blocked, 'workstation', 'Préparer le poste de travail', 'it', null, current_date - 9, -1, 'pending', null, null, null),
    ('b3000000-0000-4000-8000-000000000005', nord, j_blocked, 'welcome', 'Accueil et remise du matériel', 'manager', manager_id, current_date - 8, 0, 'pending', 'accuse-reception', null, null),
    ('b3000000-0000-4000-8000-000000000006', nord, j_blocked, 'week-one-review', 'Point de fin de première semaine', 'manager', manager_id, current_date - 1, 5, 'pending', null, null, null);

  -- --- Parcours terminé : toutes les tâches soldées. ---
  insert into public.tasks (id, company_id, journey_id, template_key, title, owner_role, owner_id, due_on, offset_working_days, status, expected_document, shared_key, completed_at)
  values
    ('b4000000-0000-4000-8000-000000000001', nord, j_done, 'contract', 'Contrat signé', 'hr_admin', null, current_date - 50, -5, 'done', 'contrat-signe', null, now() - interval '51 days'),
    ('b4000000-0000-4000-8000-000000000002', nord, j_done, 'it-account', 'Créer le compte IT', 'it', it_id, current_date - 47, -2, 'done', null, null, now() - interval '48 days'),
    ('b4000000-0000-4000-8000-000000000003', nord, j_done, 'badge', 'Commander le badge d''accès', 'it', it_id, current_date - 47, -2, 'done', null, null, now() - interval '48 days'),
    ('b4000000-0000-4000-8000-000000000004', nord, j_done, 'workstation', 'Préparer le poste de travail', 'it', it_id, current_date - 46, -1, 'done', null, null, now() - interval '46 days'),
    ('b4000000-0000-4000-8000-000000000005', nord, j_done, 'welcome', 'Accueil et remise du matériel', 'manager', manager_id, current_date - 45, 0, 'done', 'accuse-reception', null, now() - interval '45 days'),
    ('b4000000-0000-4000-8000-000000000006', nord, j_done, 'week-one-review', 'Point de fin de première semaine', 'manager', manager_id, current_date - 38, 5, 'done', null, null, now() - interval '38 days');

  insert into public.task_dependencies (task_id, depends_on_id)
  values
    ('b1000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001'),
    ('b1000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001'),
    ('b1000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000002'),
    ('b1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000004'),
    ('b1000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000003'),
    ('b1000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000005'),

    ('b2000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001'),
    ('b2000000-0000-4000-8000-000000000003', 'b2000000-0000-4000-8000-000000000001'),
    ('b2000000-0000-4000-8000-000000000004', 'b2000000-0000-4000-8000-000000000002'),
    ('b2000000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000004'),
    ('b2000000-0000-4000-8000-000000000005', 'b2000000-0000-4000-8000-000000000003'),
    ('b2000000-0000-4000-8000-000000000006', 'b2000000-0000-4000-8000-000000000005'),

    ('b3000000-0000-4000-8000-000000000004', 'b3000000-0000-4000-8000-000000000002'),
    ('b3000000-0000-4000-8000-000000000005', 'b3000000-0000-4000-8000-000000000004'),
    ('b3000000-0000-4000-8000-000000000005', 'b3000000-0000-4000-8000-000000000003'),
    ('b3000000-0000-4000-8000-000000000006', 'b3000000-0000-4000-8000-000000000005'),

    ('b4000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000001'),
    ('b4000000-0000-4000-8000-000000000003', 'b4000000-0000-4000-8000-000000000001'),
    ('b4000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000002'),
    ('b4000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000004'),
    ('b4000000-0000-4000-8000-000000000005', 'b4000000-0000-4000-8000-000000000003'),
    ('b4000000-0000-4000-8000-000000000006', 'b4000000-0000-4000-8000-000000000005');
end $$;
