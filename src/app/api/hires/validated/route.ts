import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createJourneyFromValidatedHire, type ValidatedHireInput } from '@/application/use-cases/create-journey-from-validated-hire';
import { createSupabaseServiceClient } from '@/infrastructure/supabase/service-client';
import { supabaseTemplateRepository } from '@/infrastructure/supabase/template-repository';
import { supabaseJourneyRepository } from '@/infrastructure/supabase/journey-repository';
import { supabaseCalendarDirectory } from '@/infrastructure/supabase/calendar-directory';
import { supabaseAssignmentDirectory } from '@/infrastructure/supabase/assignment-directory';
import { supabaseAuditTrail } from '@/infrastructure/supabase/audit-trail';
import { createSystemClock } from '@/infrastructure/clock/system-clock';

/**
 * W1 — declenchee par le webhook n8n "embauche validee". Route volontairement
 * fine : elle authentifie, valide la forme du payload, et delegue toute
 * decision metier au cas d'usage. Voir workflows/w1-validated-hire.json et
 * .claude/skills/n8n-workflow/SKILL.md.
 *
 * Payload attendu : des identifiants, jamais de donnee personnelle au-dela du
 * nom (deja porte par `journeys.employee_name` dans tout le reste de
 * l'application, pas une fuite propre a ce webhook).
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
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env['N8N_WEBHOOK_SECRET'];
  const provided = request.headers.get('x-webhook-secret');
  if (!expected || !provided) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  // Meme taille exigee avant timingSafeEqual : sinon il lance au lieu de
  // renvoyer false, et une longueur differente resterait un indice temporel.
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
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
    },
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
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
    },
    parsed.input,
  );

  if (result.ok) {
    return NextResponse.json(
      { journeyId: result.journeyId, status: result.status },
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
