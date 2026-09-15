-- Chaines de repli et absences : de quoi resoudre un responsable relatif en
-- une personne reelle.
--
-- La chaine est une donnee par societe et par role, pas une constante du code :
-- une filiale qui veut que les taches manager retombent sur la RH avant le
-- directeur change une ligne, pas un deploiement.

create type public.owner_slot as enum (
  'employee',
  'manager',
  'manager_of_manager',
  'hr_admin',
  'it_team'
);

create table public.assignment_rules (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references public.companies (id) on delete cascade,
  -- Le role relatif ecrit dans le template.
  owner_role     public.app_role not null,
  -- Ordre de repli : on s'arrete au premier maillon qui tient.
  fallback_chain public.owner_slot[] not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (company_id, owner_role),
  constraint assignment_rules_chain_not_empty check (array_length(fallback_chain, 1) >= 1)
);

create trigger assignment_rules_set_updated_at
  before update on public.assignment_rules
  for each row execute function public.set_updated_at();

-- Absences. La resolution les consulte a la date d'echeance de la tache, pas a
-- la date de creation du parcours : un manager present aujourd'hui peut etre en
-- conges le jour ou la tache tombe.
create table public.absences (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  person_id  uuid not null references public.profiles (id) on delete cascade,
  starts_on  date not null,
  ends_on    date not null,
  reason     text,
  created_at timestamptz not null default now(),
  constraint absences_ends_after_start check (ends_on >= starts_on)
);

-- L'acces reel : « qui est absent dans cette societe a cette date ».
create index absences_company_period_idx on public.absences (company_id, starts_on, ends_on);
create index absences_person_idx on public.absences (person_id);

alter table public.assignment_rules enable row level security;
alter table public.absences enable row level security;

create policy assignment_rules_select_members
  on public.assignment_rules for select to authenticated
  using (public.is_company_member(company_id));

create policy assignment_rules_write_hr
  on public.assignment_rules for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

-- Une absence n'est pas un secret pour les collegues : savoir qui est en conges
-- est necessaire pour comprendre pourquoi une tache a change de main. En
-- revanche le motif reste facultatif, et rien n'oblige a le renseigner.
create policy absences_select_members
  on public.absences for select to authenticated
  using (public.is_company_member(company_id));

create policy absences_write_hr_or_self
  on public.absences for all to authenticated
  using (
    person_id = auth.uid()
    or public.has_company_role(company_id, array['hr_admin']::public.app_role[])
  )
  with check (
    person_id = auth.uid()
    or public.has_company_role(company_id, array['hr_admin']::public.app_role[])
  );

-- Le manager d'un manager : sans cette colonne, la chaine de repli s'arrete au
-- premier maillon absent. Elle vit sur l'appartenance, car la hierarchie peut
-- differer d'une societe a l'autre pour la meme personne.
alter table public.company_members
  add column reports_to uuid references public.profiles (id) on delete set null;

create index company_members_reports_to_idx on public.company_members (reports_to);
