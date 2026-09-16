-- Trace locale des évènements d'agenda créés pour la première semaine d'un
-- parcours (T-25). C'est cette table, jamais un appel direct à Google, que le
-- portail employé lit : une panne du fournisseur agenda ne doit jamais rendre
-- le portail inutilisable (voir T-25, "échec d'intégration dégradé
-- proprement"). Elle sert aussi à savoir, avant un report de date, qu'un
-- évènement existe déjà pour une tâche donnée — condition du "déplacé, jamais
-- dupliqué" exigé par le ticket.
--
-- `starts_at`/`ends_at` sont du texte, pas `timestamptz` : ce sont
-- volontairement l'heure locale naïve envoyée telle quelle à l'API Google avec
-- `time_zone` à côté (Google interprète `dateTime` dans le fuseau fourni). Les
-- convertir en instant UTC exigerait de réimplémenter une table de fuseaux
-- horaires côté application — exactement ce que ce projet évite ailleurs
-- (`domain/scheduling` ne connaît que des dates civiles, jamais des instants).

create type public.calendar_event_status as enum ('scheduled', 'cancelled');

create table public.calendar_events (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies (id) on delete cascade,
  journey_id         uuid not null references public.journeys (id) on delete cascade,
  -- Nul si l'évènement n'est plus rattaché à une tâche précise (ne se produit
  -- pas aujourd'hui, mais le lien ne doit pas bloquer la suppression d'une tâche).
  task_id            uuid references public.tasks (id) on delete set null,
  -- Nul si la création côté fournisseur a échoué (voir calendar.event_creation_failed
  -- dans audit_events) : la ligne n'existe alors pas du tout, seule la trace d'audit le dit.
  external_event_id  text,
  title              text not null,
  starts_at          text not null,
  ends_at            text not null,
  time_zone          text not null,
  status             public.calendar_event_status not null default 'scheduled',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  -- Une tâche porte au plus un évènement : c'est ce qui permet de savoir, au
  -- moment d'un report, s'il faut déplacer une ligne existante ou en créer une.
  unique (task_id)
);

create index calendar_events_journey_idx on public.calendar_events (journey_id);
create index calendar_events_company_idx on public.calendar_events (company_id);

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;

-- Même visibilité que les tâches et le matériel : l'employé et son manager
-- voient le parcours, la RH voit tout, l'écriture reste réservée à la RH (le
-- client de service applicatif l'utilise pour tout le reste — n8n, les
-- use-cases W1/T-25 — et n'est pas soumis à la RLS).
create policy calendar_events_select_visible
  on public.calendar_events for select to authenticated
  using (public.journey_visible(journey_id));

create policy calendar_events_write_hr
  on public.calendar_events for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));
