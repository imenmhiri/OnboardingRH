import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedWebhookRequest } from '@/app/api/_shared/webhook-auth';
import { rescheduleJourney } from '@/application/use-cases/reschedule-journey';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { createSupabaseServiceClient } from '@/infrastructure/supabase/service-client';
import { supabaseJourneyRepository } from '@/infrastructure/supabase/journey-repository';
import { supabaseCalendarDirectory } from '@/infrastructure/supabase/calendar-directory';
import { supabaseCalendarEventRepository } from '@/infrastructure/supabase/calendar-events';
import { supabaseCalendarEventContextDirectory } from '@/infrastructure/supabase/calendar-event-context';
import { supabaseAuditTrail } from '@/infrastructure/supabase/audit-trail';
import { createGoogleCalendarFromEnv } from '@/infrastructure/calendar/google-calendar';

/**
 * T-25 — un report d'arrivée. Déclenché par le système RH/ATS qui apprend le
 * changement (même authentification que les autres webhooks n8n, secret
 * partagé) — ce n'est pas un flux planifié comme W1/W2/W3, mais un évènement
 * ponctuel décidé côté SIRH, donc une route synchrone plutôt qu'un workflow
 * n8n dédié. Voir `application/use-cases/reschedule-journey.ts` pour ce que
 * ça recalcule : les échéances des tâches ouvertes (T-09) et les évènements
 * d'agenda déjà créés, déplacés et jamais dupliqués.
 */

interface ReschedulePayload {
  readonly companyId?: unknown;
  readonly journeyId?: unknown;
  readonly newArrivalDate?: unknown;
}

function requireString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedWebhookRequest(request)) {
    return NextResponse.json({ error: 'Secret de webhook absent ou invalide.' }, { status: 401 });
  }

  let body: ReschedulePayload;
  try {
    body = (await request.json()) as ReschedulePayload;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const companyId = requireString(body.companyId);
  const journeyId = requireString(body.journeyId);
  const newArrivalDate = requireString(body.newArrivalDate);

  const missing = [
    ['companyId', companyId],
    ['journeyId', journeyId],
    ['newArrivalDate', newArrivalDate],
  ].filter(([, value]) => value === null).map(([name]) => name);

  if (missing.length > 0) {
    return NextResponse.json({ error: `Champs manquants ou vides : ${missing.join(', ')}.` }, { status: 400 });
  }

  let parsedArrivalDate;
  try {
    parsedArrivalDate = parsePlainDate(newArrivalDate as string);
  } catch {
    return NextResponse.json({ error: "Date d'arrivee invalide, attendu AAAA-MM-JJ." }, { status: 400 });
  }

  const client = createSupabaseServiceClient();

  const result = await rescheduleJourney(
    {
      journeys: supabaseJourneyRepository(client),
      calendarDirectory: supabaseCalendarDirectory(client),
      calendarEvents: supabaseCalendarEventRepository(client),
      calendar: createGoogleCalendarFromEnv(),
      context: supabaseCalendarEventContextDirectory(client),
      audit: supabaseAuditTrail(client),
    },
    { companyId: companyId as string, journeyId: journeyId as string, newArrivalDate: parsedArrivalDate },
  );

  if (result.ok) {
    return NextResponse.json(
      {
        movedTaskCount: result.movedTaskCount,
        movedEventCount: result.movedEventCount,
        failedEventTaskIds: result.failedEventTaskIds,
      },
      { status: 200 },
    );
  }

  switch (result.reason) {
    case 'not_found':
      return NextResponse.json({ error: 'Parcours introuvable.' }, { status: 404 });
    case 'terminal_status':
      return NextResponse.json({ error: 'Ce parcours est termine ou annule : aucun report possible.' }, { status: 409 });
    default:
      return NextResponse.json({ error: 'Echec inattendu.' }, { status: 500 });
  }
}
