import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedWebhookRequest } from '@/app/api/_shared/webhook-auth';
import { runDay30ReviewScan } from '@/application/use-cases/run-day-30-review-scan';
import { createSupabaseServiceClient } from '@/infrastructure/supabase/service-client';
import { supabaseSurveyRepository } from '@/infrastructure/supabase/survey-repository';
import { supabaseJourneyRepository } from '@/infrastructure/supabase/journey-repository';
import { supabaseCalendarDirectory } from '@/infrastructure/supabase/calendar-directory';
import { supabaseCompanyDirectory } from '@/infrastructure/supabase/company-directory';
import { supabaseAuditTrail } from '@/infrastructure/supabase/audit-trail';
import { createResendMailerFromEnv } from '@/infrastructure/resend/mailer';
import { resendEmailTemplates } from '@/infrastructure/resend/email-templates';
import { createSystemClock } from '@/infrastructure/clock/system-clock';

/**
 * W3 — declenchee par le declencheur planifie de n8n
 * (workflows/w3-day-30-review.json), une fois par jour ouvre. Meme
 * authentification que W1/W2/T-24 : secret partage, verifie avant tout acces
 * base. `today` vient de l'horloge systeme au fuseau de chaque societe (port
 * `Clock`), jamais du payload — meme raisonnement que W2 (T-22).
 *
 * Payload : `{ companyId?: string, dryRun?: boolean }`. Sans `companyId`, le
 * passage tourne pour toutes les societes.
 */

interface SurveyRunPayload {
  readonly companyId?: unknown;
  readonly dryRun?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedWebhookRequest(request)) {
    return NextResponse.json({ error: 'Secret de webhook absent ou invalide.' }, { status: 401 });
  }

  const tokenSecret = process.env['SURVEY_LINK_SECRET'];
  if (!tokenSecret) {
    return NextResponse.json({ error: 'SURVEY_LINK_SECRET manquant cote serveur.' }, { status: 500 });
  }

  let body: SurveyRunPayload;
  try {
    body = (await request.json()) as SurveyRunPayload;
  } catch {
    body = {};
  }

  const dryRun = body.dryRun === true;
  const requestedCompanyId = typeof body.companyId === 'string' && body.companyId.trim().length > 0 ? body.companyId : null;

  const client = createSupabaseServiceClient();

  const { data: allCompanyRows } = await client.from('companies').select('id, time_zone');
  const companyRows = (allCompanyRows ?? []) as { id: string; time_zone: string }[];

  if (requestedCompanyId && !companyRows.some((company) => company.id === requestedCompanyId)) {
    return NextResponse.json({ error: 'Societe inconnue.' }, { status: 400 });
  }

  const allCompanies = requestedCompanyId
    ? companyRows.filter((company) => company.id === requestedCompanyId)
    : companyRows;

  const ports = {
    surveys: supabaseSurveyRepository(client),
    journeys: supabaseJourneyRepository(client),
    calendar: supabaseCalendarDirectory(client),
    branding: supabaseCompanyDirectory(client),
    templates: resendEmailTemplates(),
    mailer: createResendMailerFromEnv(),
    audit: supabaseAuditTrail(client),
    portalUrl: `${process.env['NEXT_PUBLIC_APP_URL'] ?? ''}/portail`,
    tokenSecret,
  };

  const results = [];
  for (const company of allCompanies) {
    const clock = createSystemClock(company.time_zone);
    const result = await runDay30ReviewScan(ports, {
      companyId: company.id,
      today: clock.today(),
      dryRun,
    });
    results.push(result);
  }

  return NextResponse.json({ results }, { status: 200 });
}
