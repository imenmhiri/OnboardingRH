-- Sites et jours fériés : la matière première du calendrier de jours ouvrés
-- calculé par src/domain/scheduling.
--
-- Un jour férié rattaché à un site ne vaut que pour ce site (Alsace-Moselle,
-- filiale étrangère) ; site_id à NULL signifie « toute la société ».

create table public.sites (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  slug          text not null,
  name          text not null,
  city          text,
  country_code  text not null default 'FR',
  time_zone     text,
  -- NULL : le site suit la semaine de travail de la société.
  weekend       public.weekday[],
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, slug),
  constraint sites_country_code_iso check (country_code ~ '^[A-Z]{2}$'),
  constraint sites_weekend_not_full check (weekend is null or array_length(weekend, 1) < 7)
);

create index sites_company_idx on public.sites (company_id);

create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

alter table public.company_members
  add constraint company_members_site_fk
  foreign key (site_id) references public.sites (id) on delete set null;

create table public.holidays (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies (id) on delete cascade,
  site_id     uuid references public.sites (id) on delete cascade,
  observed_on date not null,
  label       text not null,
  created_at  timestamptz not null default now()
);

-- Index de couverture : le calendrier se lit toujours par société sur une plage
-- de dates, autour d'une date d'arrivée.
create index holidays_company_date_idx on public.holidays (company_id, observed_on);

-- Un même jour ne peut être déclaré deux fois pour le même périmètre. Deux
-- index partiels, faute de quoi les lignes à site_id NULL échapperaient à la
-- contrainte d'unicité.
create unique index holidays_company_wide_unique
  on public.holidays (company_id, observed_on)
  where site_id is null;

create unique index holidays_site_unique
  on public.holidays (site_id, observed_on)
  where site_id is not null;

alter table public.sites enable row level security;
alter table public.holidays enable row level security;

create policy sites_select_members
  on public.sites for select
  to authenticated
  using (public.is_company_member(company_id));

create policy sites_write_hr
  on public.sites for all
  to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

create policy holidays_select_members
  on public.holidays for select
  to authenticated
  using (public.is_company_member(company_id));

create policy holidays_write_hr
  on public.holidays for all
  to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

-- Le site rattaché à un férié doit appartenir à la même société que le férié.
create function public.holidays_site_matches_company()
returns trigger
language plpgsql
as $$
begin
  if new.site_id is not null
     and not exists (
       select 1 from public.sites s
       where s.id = new.site_id and s.company_id = new.company_id
     )
  then
    raise exception 'Le site % n''appartient pas à la société %.', new.site_id, new.company_id;
  end if;
  return new;
end;
$$;

create trigger holidays_site_matches_company
  before insert or update on public.holidays
  for each row execute function public.holidays_site_matches_company();
