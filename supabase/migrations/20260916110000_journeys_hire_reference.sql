-- L'embauche validée arrive de l'ATS/HRIS avec sa propre référence externe.
-- W1 (T-21) reçoit cette référence dans son webhook et doit pouvoir rejouer le
-- même événement sans jamais créer un second parcours : la contrainte unique
-- est le mécanisme d'idempotence, pas une vérification applicative qui
-- pourrait manquer une course entre deux requêtes concurrentes.

alter table public.journeys add column hire_reference text;

-- Partielle : deux parcours saisis à la main (sans intégration ATS) portent
-- tous les deux hire_reference nul, et ce n'est pas un doublon.
create unique index journeys_company_hire_reference_idx
  on public.journeys (company_id, hire_reference)
  where hire_reference is not null;
