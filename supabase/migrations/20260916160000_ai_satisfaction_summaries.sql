-- Cache des syntheses IA de satisfaction (T-26), une ligne par (societe, groupe).
--
-- Le cockpit lit toujours cette table, jamais un appel direct au fournisseur
-- IA : une panne ou une cle absente ne doit jamais rendre l'ecran cockpit
-- inutilisable (meme raisonnement que `calendar_events` en T-25). La
-- generation elle-meme est un processus a part (voir la route dediee),
-- declenche par n8n sur son propre planning, aligne sur le passage J+30
-- (T-23) qui fait deja accumuler de nouvelles reponses.
--
-- `group_key` vaut soit l'identifiant d'un site, soit le mot-cle fixe
-- 'company' pour une synthese a l'echelle de la societe entiere — jamais un
-- identifiant individuel, il n'y a par construction pas de synthese
-- personnelle.

create table public.ai_satisfaction_summaries (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies (id) on delete cascade,
  group_key                text not null,
  summary_text             text not null,
  generated_at             timestamptz not null,
  based_on_respondent_count integer not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (company_id, group_key),
  constraint ai_satisfaction_summaries_respondent_count_positive check (based_on_respondent_count >= 0)
);

create index ai_satisfaction_summaries_company_idx on public.ai_satisfaction_summaries (company_id);

create trigger ai_satisfaction_summaries_set_updated_at
  before update on public.ai_satisfaction_summaries
  for each row execute function public.set_updated_at();

alter table public.ai_satisfaction_summaries enable row level security;

-- Meme perimetre que `survey_responses` : seule la RH de la societe voit les
-- syntheses (des tendances issues de commentaires de satisfaction), jamais
-- un manager ni un membre non-RH. L'ecriture passe par le client de service
-- applicatif (route dediee), jamais par un client authentifie.
create policy ai_satisfaction_summaries_select_hr
  on public.ai_satisfaction_summaries for select to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));

create policy ai_satisfaction_summaries_write_hr
  on public.ai_satisfaction_summaries for all to authenticated
  using (public.has_company_role(company_id, array['hr_admin']::public.app_role[]))
  with check (public.has_company_role(company_id, array['hr_admin']::public.app_role[]));
