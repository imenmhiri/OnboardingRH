-- Catalogue de matériel par société et cycle de vie des demandes.
--
-- Le catalogue est une donnée par société, comme tout le reste : deux
-- filiales n'ont pas le même matériel, et en ajouter un est une insertion,
-- jamais une branche. Chaque demande porte optionnellement la tâche dont
-- l'accomplissement en dépend — c'est ce lien, pas un statut supplémentaire,
-- qui fait qu'une remise non accusée continue de bloquer quelque chose.

create type public.equipment_category as enum ('computer', 'badge', 'accessory');

create type public.equipment_status as enum (
  'requested',
  'ordered',
  'assigned',
  'handed_over',
  'acknowledged',
  'returned',
  'cancelled'
);

create table public.equipment_catalog_items (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  name        text not null,
  category    public.equipment_category not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (company_id, name)
);

create index equipment_catalog_items_company_idx on public.equipment_catalog_items (company_id) where is_active;

create table public.equipment_requests (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies (id) on delete cascade,
  journey_id       uuid not null references public.journeys (id) on delete cascade,
  -- La tâche que la remise conditionne. Nulle : une demande peut exister sans
  -- qu'aucune tâche n'en dépende directement.
  task_id          uuid references public.tasks (id) on delete set null,
  catalog_item_id  uuid not null references public.equipment_catalog_items (id) on delete restrict,
  status           public.equipment_status not null default 'requested',
  -- Numéro de série ou de badge une fois une unité physique affectée.
  unit_reference   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Les accès réels : le cockpit liste par société ce qui n'est pas réglé, l'IT
-- prépare par tâche, une commande groupe par article encore à commander.
create index equipment_requests_company_status_idx on public.equipment_requests (company_id, status);
create index equipment_requests_journey_idx on public.equipment_requests (journey_id);
create index equipment_requests_task_idx on public.equipment_requests (task_id) where task_id is not null;
create index equipment_requests_pending_order_idx
  on public.equipment_requests (company_id, catalog_item_id) where status = 'requested';

create trigger equipment_requests_set_updated_at
  before update on public.equipment_requests
  for each row execute function public.set_updated_at();

alter table public.equipment_catalog_items enable row level security;
alter table public.equipment_requests enable row level security;

create policy equipment_catalog_items_select_members
  on public.equipment_catalog_items for select to authenticated
  using (public.is_company_member(company_id));

create policy equipment_catalog_items_write_hr
  on public.equipment_catalog_items for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

-- Lecture : la RH et l'IT pilotent, mais l'employé voit aussi ce qui lui est
-- destiné — c'est lui qui devra en accuser réception.
create policy equipment_requests_select_visible
  on public.equipment_requests for select to authenticated
  using (
    public.journey_visible(journey_id)
    or public.has_company_role(company_id, array['it']::public.app_role[])
  );

create policy equipment_requests_write_hr_or_it
  on public.equipment_requests for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin', 'it']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin', 'it']::public.app_role[]));

-- L'accusé de réception est le seul geste que l'employé fait lui-même : il ne
-- peut rien commander ni assigner, seulement confirmer avoir reçu ce qu'on lui
-- a remis. La policy ne vérifie que la destination du changement ; la
-- légalité de la transition (handed_over -> acknowledged, pas n'importe quoi
-- -> acknowledged) reste la responsabilité du domaine.
create policy equipment_requests_acknowledge_by_employee
  on public.equipment_requests for update to authenticated
  using (
    exists (
      select 1 from public.journeys j
      where j.id = equipment_requests.journey_id and j.employee_id = auth.uid()
    )
  )
  with check (status = 'acknowledged');
