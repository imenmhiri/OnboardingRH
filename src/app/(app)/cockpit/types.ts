/** Formes brutes des lignes Supabase partagées entre les sections du cockpit. */
export interface JourneyRow {
  readonly id: string;
  readonly company_id: string;
  readonly site_id: string | null;
  readonly employee_id: string | null;
  readonly employee_name: string;
  readonly job_family: string | null;
  readonly manager_id: string | null;
  readonly arrival_date: string;
  readonly end_date: string | null;
  readonly status: string;
}

export interface CockpitSearchParams {
  readonly site?: string;
  readonly metier?: string;
  readonly responsable?: string;
}
