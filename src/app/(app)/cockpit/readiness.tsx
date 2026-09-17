import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import {
  blocksDependentTask,
  isAwaitingAcknowledgement,
  isSettled,
  type EquipmentRequest,
  type EquipmentStatus,
} from '@/domain/equipment/equipment';
import { parsePlainDate, type PlainDate } from '@/domain/scheduling/plain-date';
import { countWorkingDaysBetween, createWorkingCalendar, mergeHolidays, type WorkingCalendar } from '@/domain/scheduling/working-calendar';
import type { Weekday } from '@/domain/scheduling/plain-date';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import type { JourneyRow } from './types';

/**
 * Horizon d'imminence : dix jours ouvrés, de part et d'autre d'aujourd'hui —
 * environ deux semaines de travail. Une arrivée qui approche autant qu'une
 * arrivée récente dont la préparation traîne encore (le cas Diego du jeu de
 * démo, dont la remise du matériel n'a toujours pas été accusée six jours
 * ouvrés après son arrivée) doivent l'une comme l'autre remonter ici — se
 * limiter au futur aurait fait disparaître ce second cas, qui est pourtant
 * le plus urgent des deux.
 */
const IMMINENCE_WORKING_DAYS = 10;

interface CompanyRow {
  weekend: Weekday[];
}
interface SiteRow {
  id: string;
  weekend: Weekday[] | null;
}
interface HolidayRow {
  site_id: string | null;
  observed_on: string;
}
interface ItTaskRow {
  id: string;
  journey_id: string;
  title: string;
  status: 'pending' | 'in_progress';
}
interface EquipmentRequestRow {
  id: string;
  journey_id: string;
  task_id: string | null;
  catalog_item_id: string;
  status: EquipmentStatus;
}

export async function EquipmentReadinessCard({
  companyId,
  journeys,
  today,
}: {
  readonly companyId: string;
  readonly journeys: readonly JourneyRow[];
  readonly today: PlainDate;
}) {
  const openJourneys = journeys.filter((journey) => journey.status === 'scheduled' || journey.status === 'in_progress');

  if (openJourneys.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Comptes IT et matériel avant une arrivée imminente"
          description={`Arrivées à moins de ${IMMINENCE_WORKING_DAYS} jours ouvrés d'aujourd'hui.`}
        />
        <CardBody>
          <EmptyState
            title="Aucun parcours à examiner"
            description="Aucun parcours ouvert ne correspond aux filtres actuels."
          />
        </CardBody>
      </Card>
    );
  }

  const client = await createSupabaseServerClient();

  const [{ data: companyRow, error: companyError }, { data: siteRows }, { data: holidayRows }] = await Promise.all([
    client.from('companies').select('weekend').eq('id', companyId).maybeSingle(),
    client.from('sites').select('id, weekend').eq('company_id', companyId),
    client.from('holidays').select('site_id, observed_on').eq('company_id', companyId),
  ]);

  if (companyError || !companyRow) {
    return (
      <Card>
        <CardHeader title="Comptes IT et matériel avant une arrivée imminente" />
        <CardBody>
          <ErrorState description="Impossible de charger le calendrier de la société pour le moment." />
        </CardBody>
      </Card>
    );
  }

  const company = companyRow as CompanyRow;
  const sites = (siteRows ?? []) as SiteRow[];
  const holidays = (holidayRows ?? []) as HolidayRow[];
  const companyWideHolidays = holidays.filter((h) => h.site_id === null).map((h) => parsePlainDate(h.observed_on));
  const siteById = new Map(sites.map((site) => [site.id, site]));

  const calendarCache = new Map<string, WorkingCalendar>();
  function calendarFor(siteId: string | null): WorkingCalendar {
    const key = siteId ?? 'none';
    const cached = calendarCache.get(key);
    if (cached) return cached;
    const site = siteId ? siteById.get(siteId) : undefined;
    const siteHolidays = siteId ? holidays.filter((h) => h.site_id === siteId).map((h) => parsePlainDate(h.observed_on)) : [];
    const calendar = createWorkingCalendar({
      weekend: site?.weekend ?? company.weekend,
      holidays: mergeHolidays(companyWideHolidays, siteHolidays),
    });
    calendarCache.set(key, calendar);
    return calendar;
  }

  const imminentJourneys = openJourneys.filter((journey) => {
    const arrival = parsePlainDate(journey.arrival_date);
    const diff = countWorkingDaysBetween(today, arrival, calendarFor(journey.site_id));
    return Math.abs(diff) <= IMMINENCE_WORKING_DAYS;
  });

  if (imminentJourneys.length === 0) {
    return (
      <Card>
        <CardHeader
          title="Comptes IT et matériel avant une arrivée imminente"
          description={`Arrivées à moins de ${IMMINENCE_WORKING_DAYS} jours ouvrés d'aujourd'hui.`}
        />
        <CardBody>
          <EmptyState
            title="Aucune arrivée imminente"
            description="Rien à préparer en urgence dans les prochains jours ouvrés."
          />
        </CardBody>
      </Card>
    );
  }

  const imminentIds = imminentJourneys.map((journey) => journey.id);

  const [{ data: itTaskRows, error: itError }, { data: equipmentRows, error: equipmentError }] = await Promise.all([
    client
      .from('tasks')
      .select('id, journey_id, title, status')
      .in('journey_id', imminentIds)
      .eq('owner_role', 'it')
      .in('status', ['pending', 'in_progress']),
    client.from('equipment_requests').select('id, journey_id, task_id, catalog_item_id, status').in('journey_id', imminentIds),
  ]);

  if (itError || equipmentError) {
    return (
      <Card>
        <CardHeader title="Comptes IT et matériel avant une arrivée imminente" />
        <CardBody>
          <ErrorState description="Impossible de charger les tâches IT ou le matériel pour le moment." />
        </CardBody>
      </Card>
    );
  }

  const itTasks = (itTaskRows ?? []) as ItTaskRow[];
  const equipmentRequests = (equipmentRows ?? []) as EquipmentRequestRow[];
  const openEquipment = equipmentRequests.filter((request) => !isSettled(request.status));

  const catalogIds = [...new Set(openEquipment.map((request) => request.catalog_item_id))];
  const { data: catalogRows } = catalogIds.length
    ? await client.from('equipment_catalog_items').select('id, name').in('id', catalogIds)
    : { data: [] as { id: string; name: string }[] };
  const catalogNameById = new Map((catalogRows ?? []).map((row) => [row.id, row.name]));

  type Issue =
    | { kind: 'it_task'; label: string; status: 'pending' | 'in_progress' }
    | { kind: 'equipment'; label: string; status: EquipmentStatus; awaitingAcknowledgement: boolean };

  const issuesByJourney = new Map<string, Issue[]>();
  const push = (journeyId: string, issue: Issue) => {
    issuesByJourney.set(journeyId, [...(issuesByJourney.get(journeyId) ?? []), issue]);
  };

  for (const task of itTasks) {
    push(task.journey_id, { kind: 'it_task', label: task.title, status: task.status });
  }
  for (const request of openEquipment) {
    const name = catalogNameById.get(request.catalog_item_id) ?? 'Matériel';
    const domainRequest: EquipmentRequest = {
      id: request.id,
      companyId,
      journeyId: request.journey_id,
      taskId: request.task_id,
      catalogItemId: request.catalog_item_id,
      status: request.status,
    };
    push(request.journey_id, {
      kind: 'equipment',
      label: name,
      status: request.status,
      awaitingAcknowledgement: isAwaitingAcknowledgement(domainRequest) && blocksDependentTask(domainRequest),
    });
  }

  const journeysWithIssues = imminentJourneys.filter((journey) => (issuesByJourney.get(journey.id) ?? []).length > 0);

  return (
    <Card>
      <CardHeader
        title="Comptes IT et matériel avant une arrivée imminente"
        description={`Arrivées à moins de ${IMMINENCE_WORKING_DAYS} jours ouvrés d'aujourd'hui (${imminentJourneys.length} parcours examiné${imminentJourneys.length > 1 ? 's' : ''}).`}
      />
      <CardBody>
        {journeysWithIssues.length === 0 ? (
          <EmptyState
            title="Tout est prêt"
            description="Comptes IT créés, matériel remis et confirmé pour chaque arrivée imminente."
          />
        ) : (
          <ul className="space-y-4">
            {journeysWithIssues.map((journey) => (
              <li
                key={journey.id}
                className="rounded-[var(--radius)] border border-border border-l-4 border-l-brand bg-surface-sunken p-4"
              >
                <p className="font-medium text-text">
                  {journey.employee_name}{' '}
                  <span className="font-normal text-text-muted">— arrivée le {journey.arrival_date}</span>
                </p>
                <ul className="mt-2 space-y-1.5">
                  {(issuesByJourney.get(journey.id) ?? []).map((issue, index) => (
                    <li key={index} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-text">
                        {issue.kind === 'it_task' ? issue.label : `Matériel : ${issue.label}`}
                        {issue.kind === 'equipment' && issue.awaitingAcknowledgement
                          ? ' — remis, accusé de réception manquant'
                          : null}
                      </span>
                      {issue.kind === 'it_task' ? (
                        <StatusBadge tone={issue.status === 'pending' ? 'warning' : 'progress'} label={issue.status === 'pending' ? 'À faire' : 'En cours'} />
                      ) : issue.awaitingAcknowledgement ? (
                        <StatusBadge tone="danger" label="Accusé manquant" />
                      ) : (
                        <StatusBadge tone="warning" label="En attente" />
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
