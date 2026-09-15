-- Questionnaires de satisfaction J+7 / J+30, reponses et seuils de detection.
--
-- Une decision de confidentialite porte cette migration : une reponse est
-- lisible par la personne qui l'a donnee et par la RH de sa societe, mais pas
-- par son manager. La RH doit pouvoir agir sur un signal faible, sans quoi une
-- alerte anonyme ne sert a rien ; un manager qui lit « 2/5 » sous le nom de son
-- arrivant, en revanche, abime la relation qu'on cherche justement a mesurer.
-- Les agregats par site, eux, sont proteges par un seuil de repondants
-- applique dans src/domain/surveys/aggregation.ts.

create type public.survey_milestone as enum ('day_7', 'day_30');
create type public.survey_status as enum ('scheduled', 'sent', 'answered', 'cancelled');
create type public.survey_channel as enum ('email', 'portal_link');

create table public.surveys (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  journey_id       uuid not null references public.journeys (id) on delete cascade,
  milestone        public.survey_milestone not null,
  scheduled_on     date not null,
  status           public.survey_status not null default 'scheduled',
  -- Renseigne quand le questionnaire est annule plutot qu'envoye pour rien.
  cancelled_reason text,
  channel          public.survey_channel,
  sent_at          timestamptz,
  answered_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (journey_id, milestone),
  constraint surveys_cancel_reason_when_cancelled
    check ((status = 'cancelled') = (cancelled_reason is not null))
);

-- L'acces reel : « quels questionnaires partent aujourd'hui dans cette societe ».
create index surveys_company_schedule_idx on public.surveys (company_id, scheduled_on) where status = 'scheduled';

create trigger surveys_set_updated_at
  before update on public.surveys
  for each row execute function public.set_updated_at();

create table public.survey_responses (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  -- Une reponse par questionnaire : on ne vote pas deux fois.
  survey_id  uuid not null unique references public.surveys (id) on delete cascade,
  rating     integer not null,
  comment    text,
  themes     text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint survey_responses_rating_range check (rating between 1 and 5)
);

create index survey_responses_company_idx on public.survey_responses (company_id, created_at desc);

-- Les seuils de detection et d'anonymat sont une donnee par societe.
create table public.survey_settings (
  company_id               uuid primary key references public.companies (id) on delete cascade,
  low_rating_at_or_below   integer not null default 2,
  drop_at_least            integer not null default 2,
  recurring_theme_at_least integer not null default 3,
  -- En dessous, aucun agregat n'est publie. Deux est un plancher absolu :
  -- avec un seul repondant, un agregat est une reponse individuelle.
  minimum_respondents      integer not null default 5,
  updated_at               timestamptz not null default now(),
  constraint survey_settings_minimum_respondents check (minimum_respondents >= 2),
  constraint survey_settings_rating_bounds check (low_rating_at_or_below between 1 and 5)
);

-- Sans SECURITY DEFINER, la policy des reponses interrogerait surveys et
-- journeys sous leur propre RLS — le piege deja rencontre en T-04.
create function public.is_survey_respondent(target_survey uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.surveys s
    join public.journeys j on j.id = s.journey_id
    where s.id = target_survey
      and j.employee_id = auth.uid()
  );
$$;

create function public.survey_is_open(target_survey uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.surveys s
    where s.id = target_survey and s.status in ('scheduled', 'sent')
  );
$$;

revoke execute on function public.is_survey_respondent(uuid) from public;
revoke execute on function public.survey_is_open(uuid) from public;
grant execute on function public.is_survey_respondent(uuid) to authenticated;
grant execute on function public.survey_is_open(uuid) to authenticated;

alter table public.surveys enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_settings enable row level security;

create policy surveys_select_respondent_or_hr
  on public.surveys for select to authenticated
  using (
    public.is_survey_respondent(id)
    or public.has_company_role(company_id, array['hr_admin']::public.app_role[])
  );

create policy surveys_write_hr
  on public.surveys for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

create policy survey_responses_select_respondent_or_hr
  on public.survey_responses for select to authenticated
  using (
    public.is_survey_respondent(survey_id)
    or public.has_company_role(company_id, array['hr_admin']::public.app_role[])
  );

-- Seule la personne concernee repond, et seulement a un questionnaire encore
-- ouvert : un questionnaire annule pour fin de contrat n'accepte plus rien.
-- Aucune policy d'update ni de delete : une reponse ne se reecrit pas apres coup.
create policy survey_responses_insert_respondent
  on public.survey_responses for insert to authenticated
  with check (public.is_survey_respondent(survey_id) and public.survey_is_open(survey_id));

create policy survey_settings_select_members
  on public.survey_settings for select to authenticated
  using (public.is_company_member(company_id));

create policy survey_settings_write_hr
  on public.survey_settings for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));
