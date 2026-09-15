---
name: db-migration
description: Recipe for adding or changing a Supabase table — migration file naming, enabling Row Level Security in the same migration, writing company-scoped and role-based policies, and verifying isolation. Use whenever a change touches supabase/migrations or the data model.
---

# Écrire une migration Supabase

## Créer le fichier

```
supabase/migrations/<YYYYMMDDHHMMSS>_<slug>.sql
```

One logical change per file. Migrations are **append-only** — once applied, a migration is never
edited; correct it with a new one. Open with a comment stating what the migration does and why.

## Le squelette obligatoire

Every business table carries `company_id` and enables RLS **in the same migration**. A table created
now and secured later is a table that ships unsecured.

```sql
-- Tâches instanciées d'un parcours d'intégration.
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies (id) on delete cascade,
  journey_id    uuid not null references public.journeys (id) on delete cascade,
  title         text not null,
  owner_id      uuid references public.profiles (id),
  due_on        date not null,
  offset_days   integer not null,
  status        public.task_status not null default 'pending',
  created_at    timestamptz not null default now()
);

create index tasks_company_due_idx on public.tasks (company_id, due_on);
create index tasks_owner_status_idx on public.tasks (owner_id, status);

alter table public.tasks enable row level security;
```

## Les policies

Authorization is the database's job, not the application's. Drive policies from a membership table,
never from a client-supplied claim.

```sql
-- Lecture : les membres de la société voient ses tâches.
create policy tasks_select_company_members
  on public.tasks for select
  using (
    company_id in (
      select company_id from public.company_members
      where user_id = auth.uid()
    )
  );

-- Écriture : RH et propriétaire de la tâche uniquement.
create policy tasks_update_hr_or_owner
  on public.tasks for update
  using (
    owner_id = auth.uid()
    or exists (
      select 1 from public.company_members m
      where m.user_id = auth.uid()
        and m.company_id = tasks.company_id
        and m.role = 'hr_admin'
    )
  );
```

Points to get right:

- An employee reads **their own** journey and nothing else.
- A manager reads the journeys of their reports, not the whole company.
- The audit trail is insert-only: grant `insert` and `select`, never `update` or `delete`.
- Storage buckets stay private; access is a server-generated signed URL with a short expiry.

## Variation entre sociétés

Branding, rules, document sets, holiday calendars and journey templates are **rows**, not columns
added per subsidiary and not schema branches. Onboarding a new subsidiary must be an insert. If a
migration is needed to add a company, the model is wrong — stop and remodel.

## Vérifier

Applying it locally:

```bash
npx supabase db reset      # rejoue toutes les migrations + le seed
npx supabase db diff       # vérifie qu'il ne reste pas de dérive
```

Then prove the isolation rather than assuming it: query the new table as a member of company A and
confirm that company B's rows are invisible, and that a role without write permission is refused. If
the Supabase CLI is not available in the environment, say so — do not report a migration as verified
when it was only written.
