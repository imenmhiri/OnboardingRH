-- Seuils de relance et criticite des taches.
--
-- Les seuils sont une donnee par societe et par criticite, jamais une
-- constante du code : une societe peut tolerer un retard plus long avant
-- d'escalader, et une tache critique n'a pas les memes seuils qu'une tache
-- ordinaire. Le dernier envoi d'une relance n'a pas besoin d'une table
-- dediee : audit_events (T-06) le porte deja via l'action 'task.reminder_sent'.

create type public.task_criticality as enum ('standard', 'critical');
create type public.escalation_recipient as enum ('owner', 'manager', 'hr_admin');

alter table public.template_tasks add column criticality public.task_criticality not null default 'standard';
alter table public.tasks add column criticality public.task_criticality not null default 'standard';

create table public.escalation_levels (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies (id) on delete cascade,
  criticality              public.task_criticality not null,
  after_working_days_late  integer not null,
  recipient                public.escalation_recipient not null,
  created_at               timestamptz not null default now(),
  unique (company_id, criticality, after_working_days_late),
  constraint escalation_levels_positive_threshold check (after_working_days_late >= 1)
);

create index escalation_levels_company_idx on public.escalation_levels (company_id, criticality);

alter table public.escalation_levels enable row level security;

create policy escalation_levels_select_members
  on public.escalation_levels for select to authenticated
  using (public.is_company_member(company_id));

create policy escalation_levels_write_hr
  on public.escalation_levels for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));
