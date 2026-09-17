import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import {
  addCalendarDays,
  comparePlainDates,
  mondayOf,
  parsePlainDate,
  type PlainDate,
} from '@/domain/scheduling/plain-date';
import { formatDayMonth as formatFrenchDate } from '@/lib/format-date';
import type { JourneyRow } from './types';

/**
 * Fenêtre d'affichage : quatre semaines glissantes. Au-delà, une arrivée n'a
 * encore rien d'actionnable pour la RH — elle apparaîtra ici à l'approche.
 */
const WEEK_WINDOW_DAYS = 28;

export function UpcomingArrivalsCard({
  journeys,
  siteNameById,
  today,
}: {
  readonly journeys: readonly JourneyRow[];
  readonly siteNameById: ReadonlyMap<string, string>;
  readonly today: PlainDate;
}) {
  const horizon = addCalendarDays(today, WEEK_WINDOW_DAYS);
  const upcoming = journeys
    .filter((journey) => journey.status === 'scheduled' || journey.status === 'in_progress')
    .filter((journey) => {
      const arrival = parsePlainDate(journey.arrival_date);
      return comparePlainDates(arrival, today) >= 0 && comparePlainDates(arrival, horizon) <= 0;
    })
    .sort((a, b) => comparePlainDates(parsePlainDate(a.arrival_date), parsePlainDate(b.arrival_date)));

  const bySite = new Map<string, JourneyRow[]>();
  for (const journey of upcoming) {
    const key = journey.site_id ?? 'none';
    bySite.set(key, [...(bySite.get(key) ?? []), journey]);
  }

  return (
    <Card>
      <CardHeader
        title="Arrivées à venir"
        description="Les quatre prochaines semaines, par site et par semaine."
      />
      <CardBody>
        {upcoming.length === 0 ? (
          <EmptyState
            title="Aucune arrivée dans les quatre prochaines semaines"
            description="Bonne nouvelle : rien d’imminent à préparer. Les parcours planifiés plus tard apparaîtront ici à l’approche de leur arrivée."
          />
        ) : (
          <div className="space-y-6">
            {[...bySite.entries()].map(([siteId, siteJourneys]) => (
              <SiteGroup
                key={siteId}
                siteName={siteId === 'none' ? 'Site non renseigné' : (siteNameById.get(siteId) ?? 'Site inconnu')}
                journeys={siteJourneys}
              />
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function SiteGroup({ siteName, journeys }: { readonly siteName: string; readonly journeys: readonly JourneyRow[] }) {
  const byWeek = new Map<PlainDate, JourneyRow[]>();
  for (const journey of journeys) {
    const key = mondayOf(parsePlainDate(journey.arrival_date));
    byWeek.set(key, [...(byWeek.get(key) ?? []), journey]);
  }
  const weeks = [...byWeek.keys()].sort(comparePlainDates);

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-subtle">{siteName}</h3>
      <div className="space-y-4">
        {weeks.map((weekStart) => {
          const weekEnd = addCalendarDays(weekStart, 6);
          return (
            <div key={weekStart}>
              <p className="mb-2 text-xs font-medium text-text-muted">
                Semaine du {formatFrenchDate(weekStart)} au {formatFrenchDate(weekEnd)}
              </p>
              <ul className="space-y-2">
                {(byWeek.get(weekStart) ?? []).map((journey) => (
                  <li
                    key={journey.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-border px-3 py-2 text-sm"
                  >
                    <span className="font-medium text-text">{journey.employee_name}</span>
                    <span className="text-text-muted">{journey.job_family ?? 'Métier non renseigné'}</span>
                    <span className="text-text-subtle">{formatFrenchDate(parsePlainDate(journey.arrival_date))}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
