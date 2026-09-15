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
