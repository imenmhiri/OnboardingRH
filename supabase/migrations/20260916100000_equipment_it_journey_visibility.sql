-- L'IT prepare le materiel par arrivee (T-19) : sa file de preparation doit
-- grouper par employe et par date d'arrivee, pas seulement lister des lignes
-- de materiel detachees de tout contexte. Elle voit deja les demandes de
-- materiel de sa societe (migration precedente) ; sans ce complement, elle
-- ne pourrait pas savoir a qui ni quand elles se rattachent.
drop policy journeys_select_visible on public.journeys;

create policy journeys_select_visible
  on public.journeys for select to authenticated
  using (
    employee_id = auth.uid()
    or manager_id = auth.uid()
    or public.has_company_role(company_id, array['hr_admin', 'it']::public.app_role[])
  );
