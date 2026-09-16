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

-- ============================================================================
-- Chaînes de repli et absences
-- ============================================================================
-- La chaîne est une donnée par société : les deux filiales n'ont pas la même.
-- Chez Atelier Nord, une tâche manager retombe sur le manager du manager puis
-- sur la RH ; chez Méridien Gulf, il n'y a pas d'échelon intermédiaire, elle
-- retombe directement sur la RH. Aucun code ne connaît cette différence.
insert into public.assignment_rules (company_id, owner_role, fallback_chain)
values
  ('11111111-1111-4111-8111-111111111111', 'manager', '{manager,manager_of_manager,hr_admin}'),
  ('11111111-1111-4111-8111-111111111111', 'it', '{it_team,hr_admin}'),
  ('11111111-1111-4111-8111-111111111111', 'hr_admin', '{hr_admin}'),
  ('11111111-1111-4111-8111-111111111111', 'employee', '{employee,manager}'),
  ('22222222-2222-4222-8222-222222222222', 'manager', '{manager,hr_admin}'),
  ('22222222-2222-4222-8222-222222222222', 'it', '{it_team,hr_admin}'),
  ('22222222-2222-4222-8222-222222222222', 'hr_admin', '{hr_admin}'),
  ('22222222-2222-4222-8222-222222222222', 'employee', '{employee,manager}')
on conflict (company_id, owner_role) do nothing;

-- Le manager rend compte à la RH : sans ce rattachement, le deuxième maillon
-- de la chaîne d'Atelier Nord n'aurait personne à désigner.
update public.company_members
set reports_to = 'e0000000-0000-4000-8000-000000000001'
where company_id = '11111111-1111-4111-8111-111111111111'
  and user_id = 'e0000000-0000-4000-8000-000000000002';

-- Une absence bien réelle, calée sur les échéances du parcours bloqué : c'est
-- elle qui rend le cas limite « manager absent » démontrable à l'écran, et pas
-- seulement dans un test.
insert into public.absences (company_id, person_id, starts_on, ends_on, reason)
values (
  '11111111-1111-4111-8111-111111111111',
  'e0000000-0000-4000-8000-000000000002',
  current_date - 4,
  current_date + 6,
  'Congés'
);

-- ============================================================================
-- Seuils de relance et tâche critique
-- ============================================================================
-- Chez Atelier Nord, une tâche standard relance son propriétaire dès un jour
-- ouvré de retard, escalade au manager à 3 jours, à la RH à 6. Une tâche
-- critique saute l'échelon propriétaire et va droit au manager, puis à la RH
-- au bout de 2 jours seulement — parce que « retard critique » (W2) n'attend
-- pas une semaine avant d'alerter quelqu'un qui peut agir.
insert into public.escalation_levels (company_id, criticality, after_working_days_late, recipient)
values
  ('11111111-1111-4111-8111-111111111111', 'standard', 1, 'owner'),
  ('11111111-1111-4111-8111-111111111111', 'standard', 3, 'manager'),
  ('11111111-1111-4111-8111-111111111111', 'standard', 6, 'hr_admin'),
  ('11111111-1111-4111-8111-111111111111', 'critical', 1, 'manager'),
  ('11111111-1111-4111-8111-111111111111', 'critical', 2, 'hr_admin'),
  ('22222222-2222-4222-8222-222222222222', 'standard', 2, 'owner'),
  ('22222222-2222-4222-8222-222222222222', 'standard', 5, 'hr_admin'),
  ('22222222-2222-4222-8222-222222222222', 'critical', 1, 'hr_admin')
on conflict (company_id, criticality, after_working_days_late) do nothing;

-- La tâche IT jamais créée du parcours bloqué : c'est elle qui a le plus de
-- conséquences en cascade, donc elle est critique dans le jeu de démonstration.
update public.tasks
set criticality = 'critical'
where id = 'b3000000-0000-4000-8000-000000000002';

-- ============================================================================
-- Satisfaction : seuils, questionnaires et réponses
-- ============================================================================
insert into public.survey_settings (company_id, low_rating_at_or_below, drop_at_least, recurring_theme_at_least, minimum_respondents)
values
  ('11111111-1111-4111-8111-111111111111', 2, 2, 3, 5),
  -- Méridien Gulf accueille moins de monde : un seuil plus bas publierait des
  -- moyennes sur deux ou trois personnes. On garde le même plancher de 5.
  ('22222222-2222-4222-8222-222222222222', 2, 2, 2, 5)
on conflict (company_id) do nothing;

-- Diego est en CDD court : son contrat s'arrête avant J+30. C'est le cas limite
-- du cahier des charges, rendu visible dans la démonstration.
update public.journeys
set contract_type = 'cdd', end_date = current_date + 5
where id = 'a0000000-0000-4000-8000-000000000003';

insert into public.surveys (id, company_id, journey_id, milestone, scheduled_on, status, cancelled_reason, channel, sent_at, answered_at)
values
  -- Farida, parcours terminé : les deux questionnaires ont été remplis, et la
  -- note s'effondre entre J+7 et J+30 — un signal faible bien réel.
  ('c1000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'day_7', current_date - 36, 'answered', null, 'email', now() - interval '36 days', now() - interval '35 days'),
  ('c1000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'day_30', current_date - 3, 'answered', null, 'email', now() - interval '3 days', now() - interval '2 days'),
  -- Alice, en cours : J+7 à venir, J+30 plus tard.
  ('c1000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000002', 'day_7', current_date + 4, 'scheduled', null, 'email', null, null),
  ('c1000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000002', 'day_30', current_date + 29, 'scheduled', null, 'email', null, null),
  -- Diego : J+7 maintenu, J+30 annulé à la planification plutôt qu'envoyé.
  -- Pas de compte, donc pas d'adresse : le canal alternatif est le portail.
  -- Son J+7 tombe dans les prochains jours ouvrés : il est prévu, pas encore
  -- envoyé — scripts/seed/align-demo-dates.ts refuse un envoi daté du futur.
  ('c1000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000003', 'day_7', current_date + 1, 'scheduled', null, 'portal_link', null, null),
  ('c1000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000003', 'day_30', current_date + 22, 'cancelled', 'contract_ended_before', null, null, null);

insert into public.survey_responses (company_id, survey_id, rating, comment, themes)
values
  ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000001', 4, 'Accueil chaleureux, poste prêt dès le premier jour.', '{accueil}'),
  ('11111111-1111-4111-8111-111111111111', 'c1000000-0000-4000-8000-000000000002', 2, 'Toujours pas d''accès à l''outil de planification.', '{accès,matériel}');

-- ============================================================================
-- Matériel : catalogue et demandes
-- ============================================================================
insert into public.equipment_catalog_items (id, company_id, name, category)
values
  ('f2000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Ordinateur portable standard', 'computer'),
  ('f2000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Badge d''accès', 'badge'),
  ('f2000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Casque audio', 'accessory'),
  ('f2000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'Ordinateur portable standard', 'computer'),
  ('f2000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'Badge d''accès', 'badge')
on conflict (company_id, name) do nothing;

insert into public.equipment_requests (id, company_id, journey_id, task_id, catalog_item_id, status)
values
  -- Alice et Farida : parcours avancés, matériel réglé — cohérent avec leur
  -- tâche « accueil et remise du matériel » déjà soldée.
  ('f3000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000001', 'acknowledged'),
  ('f3000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000002', null, 'f2000000-0000-4000-8000-000000000002', 'acknowledged'),
  ('f3000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000004', 'b4000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000001', 'acknowledged'),

  -- Diego (parcours bloqué) : le badge a été remis en main propre mais jamais
  -- accusé — exactement le cas limite du ticket, et il tient tout seul avec
  -- la tâche « accueil » déjà en retard (T-08). Son ordinateur, lui, n'est
  -- même pas encore commandé.
  ('f3000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000005', 'f2000000-0000-4000-8000-000000000002', 'handed_over'),
  ('f3000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000003', null, 'f2000000-0000-4000-8000-000000000001', 'requested'),

  -- Claire (à venir) : un ordinateur encore à commander — avec celui de Diego,
  -- deux demandes du même modèle en attente, à regrouper en une commande. Son
  -- badge, lui, avait été attribué puis repris quand son arrivée avait glissé ;
  -- il attend une nouvelle affectation.
  ('f3000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', null, 'f2000000-0000-4000-8000-000000000001', 'requested'),
  ('f3000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', 'a0000000-0000-4000-8000-000000000001', null, 'f2000000-0000-4000-8000-000000000002', 'requested');

-- Un casque remis à Alice (parcours en cours, compte actif) mais jamais
-- accusé : le cas de démonstration « accusé de réception en attente » que
-- T-19 doit pouvoir faire accuser depuis un vrai portail employé. Diego,
-- seul autre cas « handed_over » du jeu de données, n'a pas de compte — Alice
-- est donc la seule à pouvoir jouer ce parcours de bout en bout.
insert into public.equipment_requests (id, company_id, journey_id, task_id, catalog_item_id, status)
values (
  'f3000000-0000-4000-8000-000000000008',
  '11111111-1111-4111-8111-111111111111',
  'a0000000-0000-4000-8000-000000000002',
  null,
  'f2000000-0000-4000-8000-000000000003',
  'handed_over'
);

-- Trace du cas limite « attribué puis repris » : sans historique dédié, c'est
-- le journal d'audit (déjà en place depuis T-06) qui porte la raison.
insert into public.audit_events (company_id, journey_id, action, payload)
values (
  '11111111-1111-4111-8111-111111111111',
  'a0000000-0000-4000-8000-000000000001',
  'equipment.reclaimed',
  jsonb_build_object(
    'requestId', 'f3000000-0000-4000-8000-000000000007',
    'from', 'assigned',
    'to', 'requested',
    'reason', 'Arrivée décalée : badge remis au pool commun avant d''être réaffecté.'
  )
);
