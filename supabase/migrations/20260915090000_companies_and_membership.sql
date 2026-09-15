-- Socle multi-sociétés : sociétés, profils, appartenance et rôles.
--
-- Toute variation entre filiales (marque, palette, semaine de travail) est une
-- donnée de cette table, jamais une branche dans le code ni une colonne ajoutée
-- par filiale : accueillir une nouvelle société doit être un INSERT.
--
-- L'autorisation est portée par la RLS, pas par le code applicatif. Les
-- policies s'appuient sur company_members, jamais sur un claim fourni par le
-- client.

create type public.app_role as enum ('hr_admin', 'manager', 'it', 'employee');

-- Mêmes noms que le type Weekday du domaine (src/domain/scheduling).
create type public.weekday as enum (
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.companies (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  legal_name             text,
  locale                 text not null default 'fr-FR',
  time_zone              text not null default 'Europe/Paris',
  -- Semaine de travail par défaut de la société ; un site peut la surcharger.
  weekend                public.weekday[] not null default '{saturday,sunday}',
  logo_url               text,
  brand_primary          text not null default 'oklch(0.52 0.15 255)',
  brand_primary_contrast text not null default 'oklch(0.99 0 0)',
  brand_accent           text not null default 'oklch(0.72 0.14 165)',
  -- Réglages ouverts (durée des relances, options d'affichage) : une filiale
  -- qui a besoin d'un réglage inédit n'impose pas une migration.
  settings               jsonb not null default '{}'::jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint companies_weekend_not_full check (array_length(weekend, 1) is null or array_length(weekend, 1) < 7)
);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- Miroir applicatif de auth.users : aucun élément sensible ici, les documents
-- personnels vivent dans Storage derrière un lien signé à durée limitée.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  locale      text not null default 'fr-FR',
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.company_members (
  company_id  uuid not null references public.companies (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null,
  -- Un manager encadre les arrivées de son périmètre ; renseigné plus tard par
  -- la table des rattachements, ce champ ne sert qu'au rattachement de site.
  site_id     uuid,
  created_at  timestamptz not null default now(),
  primary key (company_id, user_id)
);

create index company_members_user_idx on public.company_members (user_id);
create index company_members_company_role_idx on public.company_members (company_id, role);

-- Fonctions SECURITY DEFINER : sans elles, une policy sur company_members qui
-- interroge company_members boucle sur elle-même.
create function public.is_company_member(target_company uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members
    where user_id = auth.uid()
      and company_id = target_company
  );
$$;

create function public.has_company_role(target_company uuid, target_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members
    where user_id = auth.uid()
      and company_id = target_company
      and role = any (target_roles)
  );
$$;

revoke execute on function public.is_company_member(uuid) from public;
revoke execute on function public.has_company_role(uuid, public.app_role[]) from public;
grant execute on function public.is_company_member(uuid) to authenticated;
grant execute on function public.has_company_role(uuid, public.app_role[]) to authenticated;

-- Sans SECURITY DEFINER ici, la policy de lecture des profils ne peut jamais
-- reussir : la sous-requete sur company_members serait elle-meme filtree par
-- la RLS de company_members, ou un membre non-RH ne voit que sa propre ligne.
create function public.shares_company_with(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.company_members mine
    join public.company_members theirs on theirs.company_id = mine.company_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user
  );
$$;

revoke execute on function public.shares_company_with(uuid) from public;
grant execute on function public.shares_company_with(uuid) to authenticated;

alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.company_members enable row level security;

-- Lecture : on ne voit que les sociétés dont on est membre.
create policy companies_select_members
  on public.companies for select
  to authenticated
  using (public.is_company_member(id));

-- Écriture réservée à la RH de la société ; la création d'une société passe par
-- la clé de service, jamais par un client authentifié.
create policy companies_update_hr
  on public.companies for update
  to authenticated
  using (public.has_company_role(id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(id, array['hr_admin']::public.app_role[]));

create policy profiles_select_self
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

-- Un collègue n'est visible que s'il partage une société avec le lecteur.
create policy profiles_select_shared_company
  on public.profiles for select
  to authenticated
  using (public.shares_company_with(id));

create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy company_members_select_self
  on public.company_members for select
  to authenticated
  using (user_id = auth.uid());

create policy company_members_select_hr
  on public.company_members for select
  to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

create policy company_members_write_hr
  on public.company_members for all
  to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));
