import { FileStack, Laptop } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BlockedTasksCard } from './blocked-tasks';
import { CockpitFilters } from './filters';
import { EquipmentReadinessCard } from './readiness';
import { SatisfactionCard } from './satisfaction';
import { UpcomingArrivalsCard } from './upcoming-arrivals';
import type { CockpitSearchParams, JourneyRow } from './types';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';
import { canAccess } from '@/domain/companies/access';
import { parsePlainDate, type PlainDate } from '@/domain/scheduling/plain-date';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Cockpit RH — OnboardingRH' };

/** Aujourd'hui, calculé une seule fois ici (couche app) et transmis explicitement aux sections. */
function today(): PlainDate {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return parsePlainDate(iso);
}

export default async function CockpitPage({
  searchParams,
}: {
  readonly searchParams: Promise<CockpitSearchParams>;
}) {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }
  // Un role sans acces est renvoye vers son espace, pas laisse devant un refus.
  if (!canAccess(session.context.membership.role, 'cockpit')) {
    redirect('/portail');
  }
  const { companyId, companyName } = session.context.membership;
  const canBuildJourneys = canAccess(session.context.membership.role, 'journey_builder');
  const canManageEquipment = canAccess(session.context.membership.role, 'equipment');
  const filters = await searchParams;

  const client = await createSupabaseServerClient();

  const [{ data: journeyRows, error: journeysError }, { data: siteRows }] = await Promise.all([
    client
      .from('journeys')
      .select(
        'id, company_id, site_id, employee_id, employee_name, job_family, manager_id, arrival_date, end_date, status',
      )
      .eq('company_id', companyId)
      .order('arrival_date'),
    client.from('sites').select('id, name').eq('company_id', companyId).order('name'),
  ]);

  if (journeysError) {
    return (
      <div className="space-y-8">
        <PageHeader companyName={companyName} canBuildJourneys={canBuildJourneys} canManageEquipment={canManageEquipment} />
        <ErrorState description="Impossible de charger les parcours pour le moment. Réessayez dans un instant." />
      </div>
    );
  }

  const journeys = (journeyRows ?? []) as JourneyRow[];
  const sites = (siteRows ?? []) as { id: string; name: string }[];
  const siteNameById = new Map(sites.map((site) => [site.id, site.name]));

  const jobFamilies = [...new Set(journeys.map((journey) => journey.job_family).filter((value): value is string => Boolean(value)))].sort(
    (a, b) => a.localeCompare(b),
  );
  const managerIds = [...new Set(journeys.map((journey) => journey.manager_id).filter((value): value is string => Boolean(value)))];
  const { data: managerProfiles } = managerIds.length
    ? await client.from('profiles').select('id, full_name').in('id', managerIds)
    : { data: [] as { id: string; full_name: string }[] };
  const managerNameById = new Map((managerProfiles ?? []).map((profile) => [profile.id, profile.full_name]));

  const filteredJourneys = journeys.filter((journey) => {
    if (filters.site && journey.site_id !== filters.site) return false;
    if (filters.metier && journey.job_family !== filters.metier) return false;
    if (filters.responsable && journey.manager_id !== filters.responsable) return false;
    return true;
  });

  const todayDate = today();

  return (
    <div className="space-y-8">
      <PageHeader companyName={companyName} canBuildJourneys={canBuildJourneys} canManageEquipment={canManageEquipment} />

      <CockpitFilters
        sites={sites}
        jobFamilies={jobFamilies}
        managers={managerIds.map((id) => ({ id, name: managerNameById.get(id) ?? 'Sans nom' }))}
        values={filters}
      />

      <UpcomingArrivalsCard journeys={filteredJourneys} siteNameById={siteNameById} today={todayDate} />
      <BlockedTasksCard journeys={filteredJourneys} />
      <EquipmentReadinessCard companyId={companyId} journeys={filteredJourneys} today={todayDate} />
      <SatisfactionCard companyId={companyId} journeys={filteredJourneys} siteNameById={siteNameById} />
    </div>
  );
}

function PageHeader({
  companyName,
  canBuildJourneys,
  canManageEquipment,
}: {
  readonly companyName: string;
  readonly canBuildJourneys: boolean;
  readonly canManageEquipment: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <h1 className="font-display text-3xl tracking-tight text-text">Cockpit RH</h1>
        <p className="text-text-muted">
          Arrivées à venir, tâches bloquées et satisfaction, pour {companyName}.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canManageEquipment ? (
          <Button asChild variant="secondary">
            <Link href="/materiel">
              <Laptop aria-hidden className="size-4" />
              Matériel
            </Link>
          </Button>
        ) : null}
        {canBuildJourneys ? (
          <Button asChild variant="secondary">
            <Link href="/parcours">
              <FileStack aria-hidden className="size-4" />
              Créateur de parcours
            </Link>
          </Button>
        ) : null}
      </div>
    </header>
  );
}
