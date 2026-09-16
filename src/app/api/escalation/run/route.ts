import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedWebhookRequest } from '@/app/api/_shared/webhook-auth';
import { runCriticalDelayScan } from '@/application/use-cases/run-critical-delay-scan';
import { createSupabaseServiceClient } from '@/infrastructure/supabase/service-client';
import { supabaseEscalationRepository } from '@/infrastructure/supabase/escalation-repository';
import { supabaseCalendarDirectory } from '@/infrastructure/supabase/calendar-directory';
import { supabaseCompanyDirectory } from '@/infrastructure/supabase/company-directory';
import { supabaseAuditTrail } from '@/infrastructure/supabase/audit-trail';
import { createResendMailerFromEnv } from '@/infrastructure/resend/mailer';
import { resendEmailTemplates } from '@/infrastructure/resend/email-templates';
import { createSystemClock } from '@/infrastructure/clock/system-clock';

/**
 * W2 — declenchee par le declencheur planifie de n8n, une fois par jour
 * ouvre (workflows/w2-critical-delay.json). Meme authentification que
 * /api/hires/validated et /api/notifications/welcome-email : secret partage,
 * verifie avant tout acces base. `today` vient de l'horloge systeme au
 * moment de l'appel (port `Clock`, seule implementation autorisee a lire
 * l'heure), jamais d'un champ du payload — un n8n qui rejoue un appel ancien
 * ne doit pas pouvoir mentir sur la date.
 *
 * Payload : `{ companyId?: string, dryRun?: boolean }`. Sans `companyId`, le
 * passage tourne pour toutes les societes actives — c'est ce qu'un
 * declencheur planifie unique doit appeler une fois par jour, plutot que de
 * forcer n8n a boucler sur la liste des societes lui-meme (une regle metier
 * de plus a y dupliquer).
 */

interface EscalationRunPayload {
  readonly companyId?: unknown;
  readonly dryRun?: unknown;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedWebhookRequest(request)) {
    return NextResponse.json({ error: 'Secret de webhook absent ou invalide.' }, { status: 401 });
  }

  let body: EscalationRunPayload;
  try {
    body = (await request.json()) as EscalationRunPayload;
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
    escalation: supabaseEscalationRepository(client),
    calendar: supabaseCalendarDirectory(client),
    branding: supabaseCompanyDirectory(client),
    templates: resendEmailTemplates(),
    mailer: createResendMailerFromEnv(),
    audit: supabaseAuditTrail(client),
    portalUrl: `${process.env['NEXT_PUBLIC_APP_URL'] ?? ''}/portail`,
  };

  const results = [];
  for (const company of allCompanies) {
    const clock = createSystemClock(company.time_zone);
    const result = await runCriticalDelayScan(ports, {
      companyId: company.id,
      today: clock.today(),
      dryRun,
    });
    results.push(result);
  }

  return NextResponse.json({ results }, { status: 200 });
}
