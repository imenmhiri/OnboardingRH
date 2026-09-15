-- Coeur transactionnel : une embauche devient un parcours, un parcours porte des
-- taches, une tache attend parfois une piece. Tout est scope par societe, et la
-- RLS decide qui lit quoi.

create type public.journey_status as enum (
  'draft', 'scheduled', 'in_progress', 'completed', 'cancelled'
);

create type public.task_status as enum ('pending', 'in_progress', 'done', 'cancelled');

-- Templates de parcours. Les criteres a NULL valent "n'importe lequel" : c'est
-- ce qui permet un parcours par defaut, puis des variantes plus precises, sans
-- jamais coder une societe en dur.
create table public.journey_templates (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  name          text not null,
  job_family    text,
  site_id       uuid references public.sites (id) on delete cascade,
  contract_type text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index journey_templates_company_idx on public.journey_templates (company_id) where is_active;

create trigger journey_templates_set_updated_at
  before update on public.journey_templates
  for each row execute function public.set_updated_at();

create table public.template_tasks (
  id                   uuid primary key default gen_random_uuid(),
  template_id          uuid not null references public.journey_templates (id) on delete cascade,
  -- Cle stable dans le template : les dependances s'expriment avec, pas avec l'id.
  key                  text not null,
  title                text not null,
  owner_role           public.app_role not null,
  -- Jours ouvres relatifs a l'arrivee ; negatif avant l'arrivee.
  offset_working_days  integer not null default 0,
  expected_document    text,
  -- Renseignee quand le meme travail sert plusieurs arrivees a la fois.
  shared_key           text,
  position             integer not null default 0,
  created_at           timestamptz not null default now(),
  unique (template_id, key)
);

create index template_tasks_template_idx on public.template_tasks (template_id, position);

create table public.template_task_dependencies (
  template_task_id uuid not null references public.template_tasks (id) on delete cascade,
  depends_on_id    uuid not null references public.template_tasks (id) on delete cascade,
  primary key (template_task_id, depends_on_id),
  constraint template_task_no_self_dependency check (template_task_id <> depends_on_id)
);

-- Un parcours : une arrivee reelle, instanciee depuis un template.
create table public.journeys (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  site_id       uuid references public.sites (id) on delete set null,
  template_id   uuid references public.journey_templates (id) on delete set null,
  -- L'employe peut ne pas encore avoir de compte au moment de l'embauche.
  employee_id   uuid references public.profiles (id) on delete set null,
  employee_name text not null,
  job_family    text,
  contract_type text,
  manager_id    uuid references public.profiles (id) on delete set null,
  arrival_date  date not null,
  -- Renseignee quand le contrat s'arrete : c'est elle qui annule le J+30.
  end_date      date,
  status        public.journey_status not null default 'scheduled',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint journeys_end_after_arrival check (end_date is null or end_date >= arrival_date)
);

-- Les acces reels : par societe et date d'arrivee pour le cockpit, par manager
-- et par employe pour leurs propres vues.
create index journeys_company_arrival_idx on public.journeys (company_id, arrival_date);
create index journeys_manager_idx on public.journeys (manager_id);
create index journeys_employee_idx on public.journeys (employee_id);

create trigger journeys_set_updated_at
  before update on public.journeys
  for each row execute function public.set_updated_at();

create table public.tasks (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies (id) on delete cascade,
  journey_id          uuid not null references public.journeys (id) on delete cascade,
  template_key        text,
  title               text not null,
  owner_role          public.app_role not null,
  owner_id            uuid references public.profiles (id) on delete set null,
  due_on              date not null,
  offset_working_days integer not null default 0,
  status              public.task_status not null default 'pending',
  expected_document   text,
  shared_key          text,
  completed_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index tasks_company_due_idx on public.tasks (company_id, due_on);
create index tasks_owner_status_idx on public.tasks (owner_id, status);
create index tasks_journey_idx on public.tasks (journey_id);
-- Une tache mutualisee se retrouve par sa cle, sur l'ensemble des arrivees.
create index tasks_shared_key_idx on public.tasks (company_id, shared_key) where shared_key is not null;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

create table public.task_dependencies (
  task_id       uuid not null references public.tasks (id) on delete cascade,
  depends_on_id uuid not null references public.tasks (id) on delete cascade,
  primary key (task_id, depends_on_id),
  constraint task_no_self_dependency check (task_id <> depends_on_id)
);

create index task_dependencies_depends_on_idx on public.task_dependencies (depends_on_id);

-- Une piece attendue : la table ne porte qu'une reference vers Storage. Le
-- fichier lui-meme ne transite ni par un email ni par un webhook, seulement par
-- un lien signe a duree limitee.
create table public.task_documents (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null references public.companies (id) on delete cascade,
  task_id      uuid not null references public.tasks (id) on delete cascade,
  storage_path text not null unique,
  file_name    text not null,
  content_type text,
  size_bytes   bigint,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index task_documents_task_idx on public.task_documents (task_id);

-- Journal d'audit. Volontairement en insertion seule : aucune policy d'update
-- ni de delete n'est creee, donc la RLS les refuse. Le parcours peut disparaitre
-- sans emporter sa trace, d'ou le ON DELETE SET NULL.
create table public.audit_events (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  journey_id uuid references public.journeys (id) on delete set null,
  task_id    uuid references public.tasks (id) on delete set null,
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_company_time_idx on public.audit_events (company_id, created_at desc);
create index audit_events_journey_idx on public.audit_events (journey_id);

-- Sans SECURITY DEFINER, cette lecture serait elle-meme filtree par la RLS de
-- journeys et la policy ne pourrait jamais etre vraie pour un tiers legitime.
create function public.journey_visible(target_journey uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.journeys j
    where j.id = target_journey
      and (
        j.employee_id = auth.uid()
        or j.manager_id = auth.uid()
        or public.has_company_role(j.company_id, array['hr_admin']::public.app_role[])
      )
  );
$$;

/*
  Une tache est visible par son proprietaire, par ceux qui voient le parcours,
  et par l'equipe qui porte le role concerne : l'IT doit voir les taches IT de
  sa societe sans etre nommement assigne a chacune.
*/
create function public.task_visible(target_task uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.tasks t
    where t.id = target_task
      and (
        t.owner_id = auth.uid()
        or public.journey_visible(t.journey_id)
        or public.has_company_role(t.company_id, array[t.owner_role])
      )
  );
$$;

revoke execute on function public.journey_visible(uuid) from public;
revoke execute on function public.task_visible(uuid) from public;
grant execute on function public.journey_visible(uuid) to authenticated;
grant execute on function public.task_visible(uuid) to authenticated;

alter table public.journey_templates enable row level security;
alter table public.template_tasks enable row level security;
alter table public.template_task_dependencies enable row level security;
alter table public.journeys enable row level security;
alter table public.tasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.task_documents enable row level security;
alter table public.audit_events enable row level security;

-- Templates : lisibles par les membres, ecrits par la RH seule.
create policy journey_templates_select_members
  on public.journey_templates for select to authenticated
  using (public.is_company_member(company_id));

create policy journey_templates_write_hr
  on public.journey_templates for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

create policy template_tasks_select_members
  on public.template_tasks for select to authenticated
  using (exists (
    select 1 from public.journey_templates t
    where t.id = template_id and public.is_company_member(t.company_id)
  ));

create policy template_tasks_write_hr
  on public.template_tasks for all to authenticated
  using (exists (
    select 1 from public.journey_templates t
    where t.id = template_id
      and public.has_company_role(t.company_id, array['hr_admin']::public.app_role[])
  ))
  with check (exists (
    select 1 from public.journey_templates t
    where t.id = template_id
      and public.has_company_role(t.company_id, array['hr_admin']::public.app_role[])
  ));

create policy template_task_dependencies_select_members
  on public.template_task_dependencies for select to authenticated
  using (exists (
    select 1 from public.template_tasks tt
    join public.journey_templates t on t.id = tt.template_id
    where tt.id = template_task_id and public.is_company_member(t.company_id)
  ));

create policy template_task_dependencies_write_hr
  on public.template_task_dependencies for all to authenticated
  using (exists (
    select 1 from public.template_tasks tt
    join public.journey_templates t on t.id = tt.template_id
    where tt.id = template_task_id
      and public.has_company_role(t.company_id, array['hr_admin']::public.app_role[])
  ))
  with check (exists (
    select 1 from public.template_tasks tt
    join public.journey_templates t on t.id = tt.template_id
    where tt.id = template_task_id
      and public.has_company_role(t.company_id, array['hr_admin']::public.app_role[])
  ));

-- Parcours : l'employe lit le sien, le manager ceux de ses rattaches, la RH
-- ceux de sa societe. Personne ne lit celui d'un collegue.
create policy journeys_select_visible
  on public.journeys for select to authenticated
  using (
    employee_id = auth.uid()
    or manager_id = auth.uid()
    or public.has_company_role(company_id, array['hr_admin']::public.app_role[])
  );

create policy journeys_write_hr
  on public.journeys for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

create policy tasks_select_visible
  on public.tasks for select to authenticated
  using (
    owner_id = auth.uid()
    or public.journey_visible(journey_id)
    or public.has_company_role(company_id, array[owner_role])
  );

-- Le proprietaire fait avancer sa tache ; la RH peut tout reprendre. Personne
-- d'autre, meme en voyant la tache.
create policy tasks_update_owner_or_hr
  on public.tasks for update to authenticated
  using (
    owner_id = auth.uid()
    or public.has_company_role(company_id, array['hr_admin']::public.app_role[])
  )
  with check (
    owner_id = auth.uid()
    or public.has_company_role(company_id, array['hr_admin']::public.app_role[])
  );

create policy tasks_insert_hr
  on public.tasks for insert to authenticated
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

create policy tasks_delete_hr
  on public.tasks for delete to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

create policy task_dependencies_select_visible
  on public.task_dependencies for select to authenticated
  using (public.task_visible(task_id));

create policy task_dependencies_write_hr
  on public.task_dependencies for all to authenticated
  using (exists (
    select 1 from public.tasks t
    where t.id = task_id
      and public.has_company_role(t.company_id, array['hr_admin']::public.app_role[])
  ))
  with check (exists (
    select 1 from public.tasks t
    where t.id = task_id
      and public.has_company_role(t.company_id, array['hr_admin']::public.app_role[])
  ));

create policy task_documents_select_visible
  on public.task_documents for select to authenticated
  using (public.task_visible(task_id));

create policy task_documents_insert_visible
  on public.task_documents for insert to authenticated
  with check (public.task_visible(task_id) and uploaded_by = auth.uid());

create policy task_documents_delete_hr_or_uploader
  on public.task_documents for delete to authenticated
  using (
    uploaded_by = auth.uid()
    or public.has_company_role(company_id, array['hr_admin']::public.app_role[])
  );

/*
  Audit : lecture pour la RH, insertion pour tout membre. Ni update ni delete ne
  recoivent de policy — la RLS les refuse, et c'est ce qui fait la valeur d'une
  trace.

  Consequence a connaitre cote application : un membre non-RH peut inserer sans
  pouvoir relire, donc une insertion avec RETURNING echoue pour lui. Les
  ecritures d'audit se font sans RETURNING.
*/
create policy audit_events_select_hr
  on public.audit_events for select to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

create policy audit_events_insert_members
  on public.audit_events for insert to authenticated
  with check (public.is_company_member(company_id));
