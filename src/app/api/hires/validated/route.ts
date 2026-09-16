import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedWebhookRequest } from '@/app/api/_shared/webhook-auth';
import { createJourneyFromValidatedHire, type ValidatedHireInput } from '@/application/use-cases/create-journey-from-validated-hire';
import { createSupabaseServiceClient } from '@/infrastructure/supabase/service-client';
import { supabaseTemplateRepository } from '@/infrastructure/supabase/template-repository';
import { supabaseJourneyRepository } from '@/infrastructure/supabase/journey-repository';
import { supabaseCalendarDirectory } from '@/infrastructure/supabase/calendar-directory';
import { supabaseAssignmentDirectory } from '@/infrastructure/supabase/assignment-directory';
import { supabaseAuditTrail } from '@/infrastructure/supabase/audit-trail';
import { supabaseCalendarEventRepository } from '@/infrastructure/supabase/calendar-events';
import { supabaseCalendarEventContextDirectory } from '@/infrastructure/supabase/calendar-event-context';
import { createGoogleCalendarFromEnv } from '@/infrastructure/calendar/google-calendar';
import { createSystemClock } from '@/infrastructure/clock/system-clock';

/**
 * W1 — declenchee par le webhook n8n "embauche validee". Route volontairement
 * fine : elle authentifie, valide la forme du payload, et delegue toute
 * decision metier au cas d'usage. Voir workflows/w1-validated-hire.json et
 * .claude/skills/n8n-workflow/SKILL.md.
 *
 * Payload attendu : des identifiants, jamais de donnee personnelle au-dela du
 * nom (deja porte par `journeys.employee_name` dans tout le reste de
 * l'application, pas une fuite propre a ce webhook) et, depuis T-24, de
 * l'email personnel optionnel — seule source possible pour un employe qui
 * n'a pas encore de compte, au meme titre que le nom. Cette adresse est
 * persistee sur `journeys.personal_email` et n'est ensuite jamais reprise
 * dans un payload de notification : l'email de bienvenue la relit lui-meme
 * au moment de l'envoi differe (voir send-welcome-email.ts).
 */

interface ValidatedHirePayload {
  readonly companyId?: unknown;
  readonly siteId?: unknown;
  readonly jobFamily?: unknown;
  readonly contractType?: unknown;
  readonly employeeName?: unknown;
  readonly employeeId?: unknown;
  readonly managerId?: unknown;
  readonly arrivalDate?: unknown;
  readonly hireReference?: unknown;
  readonly personalEmail?: unknown;
}

function requireString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function parsePayload(body: ValidatedHirePayload): { input: ValidatedHireInput } | { error: string } {
  const companyId = requireString(body.companyId);
  const siteId = requireString(body.siteId);
  const jobFamily = requireString(body.jobFamily);
  const contractType = requireString(body.contractType);
  const employeeName = requireString(body.employeeName);
  const arrivalDate = requireString(body.arrivalDate);
  const hireReference = requireString(body.hireReference);

  const missing = [
    ['companyId', companyId],
    ['siteId', siteId],
    ['jobFamily', jobFamily],
    ['contractType', contractType],
    ['employeeName', employeeName],
    ['arrivalDate', arrivalDate],
    ['hireReference', hireReference],
  ].filter(([, value]) => value === null).map(([name]) => name);

  if (missing.length > 0) {
    return { error: `Champs manquants ou vides : ${missing.join(', ')}.` };
  }

  return {
    input: {
      companyId: companyId as string,
      siteId: siteId as string,
      jobFamily: jobFamily as string,
      contractType: contractType as string,
      employeeName: employeeName as string,
      employeeId: optionalString(body.employeeId),
      managerId: optionalString(body.managerId),
      arrivalDate: arrivalDate as string,
      hireReference: hireReference as string,
      personalEmail: optionalString(body.personalEmail),
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedWebhookRequest(request)) {
    return NextResponse.json({ error: 'Secret de webhook absent ou invalide.' }, { status: 401 });
  }

  let body: ValidatedHirePayload;
  try {
    body = (await request.json()) as ValidatedHirePayload;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const parsed = parsePayload(body);
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const client = createSupabaseServiceClient();

  const { data: company } = await client
    .from('companies')
    .select('time_zone')
    .eq('id', parsed.input.companyId)
    .maybeSingle();
  if (!company) {
    return NextResponse.json({ error: 'Societe inconnue.' }, { status: 400 });
  }

  const result = await createJourneyFromValidatedHire(
    {
      templates: supabaseTemplateRepository(client),
      journeys: supabaseJourneyRepository(client),
      calendar: supabaseCalendarDirectory(client),
      directory: supabaseAssignmentDirectory(client),
      audit: supabaseAuditTrail(client),
      clock: createSystemClock(company.time_zone),
      calendarEvents: supabaseCalendarEventRepository(client),
      // Cree tot et clairement une erreur si les identifiants Google manquent,
      // plutot que de la decouvrir au premier appel — voir T-25.
      calendarClient: createGoogleCalendarFromEnv(),
      calendarContext: supabaseCalendarEventContextDirectory(client),
    },
    parsed.input,
  );

  if (result.ok) {
    return NextResponse.json(
      {
        journeyId: result.journeyId,
        status: result.status,
        // n8n attend cette date avant d'appeler /api/notifications/welcome-email
        // (envoi differe, voir workflows/w1-validated-hire.json).
        ...(result.status === 'created' ? { sendWelcomeEmailAt: result.sendWelcomeEmailAt } : {}),
      },
      { status: result.status === 'created' ? 201 : 200 },
    );
  }

  switch (result.reason) {
    case 'invalid_arrival_date':
      return NextResponse.json({ error: 'Date d\'arrivee invalide, attendu AAAA-MM-JJ.' }, { status: 400 });
    case 'no_match':
      return NextResponse.json(
        { error: 'Aucun parcours ne correspond a cette embauche.', reason: 'no_match' },
        { status: 422 },
      );
    case 'ambiguous_match':
      return NextResponse.json(
        { error: 'Plusieurs parcours correspondent a egalite.', reason: 'ambiguous_match', templateIds: result.templateIds },
        { status: 422 },
      );
    case 'invalid_template':
      return NextResponse.json(
        { error: 'Le parcours selectionne est mal forme.', reason: 'invalid_template', defects: result.defects },
        { status: 422 },
      );
    default:
      return NextResponse.json({ error: 'Echec inattendu.' }, { status: 500 });
  }
}
