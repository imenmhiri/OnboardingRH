import { NextResponse, type NextRequest } from 'next/server';
import { isAuthorizedWebhookRequest } from '@/app/api/_shared/webhook-auth';
import { generateSatisfactionSummaries } from '@/application/use-cases/generate-satisfaction-summaries';
import { createSupabaseServiceClient } from '@/infrastructure/supabase/service-client';
import { supabaseRosterDirectory } from '@/infrastructure/supabase/roster-directory';
import { supabaseSatisfactionSummaryRepository } from '@/infrastructure/supabase/satisfaction-summary-repository';
import { createAnthropicSummarizerFromEnv } from '@/infrastructure/anthropic/satisfaction-summarizer';

/**
 * T-26 — declenchee par n8n sur son propre planning, alignee sur le passage
 * J+30 (W3, T-23) puisque c'est lui qui fait accumuler de nouvelles reponses
 * de questionnaire. Volontairement une route dediee plutot qu'un ajout dans
 * `run-day-30-review-scan.ts` : la generation IA est un processus distinct
 * (peut echouer, peut couter du temps, n'a aucune echeance metier propre)
 * et melanger les deux aurait fait de l'IA une dependance du scan
 * d'envoi/relance des questionnaires — exactement ce que le DoD interdit
 * ("le cockpit reste utilisable sans la synthese").
 *
 * Meme authentification que les autres webhooks : secret partage
 * `x-webhook-secret`.
 *
 * Payload : `{ companyId?: string }`. Sans `companyId`, tourne pour toutes
 * les societes.
 */

interface SummarizeRunPayload {
  readonly companyId?: unknown;
}

interface ResponseRow {
  readonly comment: string | null;
  readonly surveys: { readonly journey_id: string } | null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorizedWebhookRequest(request)) {
    return NextResponse.json({ error: 'Secret de webhook absent ou invalide.' }, { status: 401 });
  }

  let body: SummarizeRunPayload;
  try {
    body = (await request.json()) as SummarizeRunPayload;
  } catch {
    body = {};
  }

  const requestedCompanyId = typeof body.companyId === 'string' && body.companyId.trim().length > 0 ? body.companyId : null;

  const client = createSupabaseServiceClient();

  const { data: allCompanyRows } = await client.from('companies').select('id, name');
  const companyRows = (allCompanyRows ?? []) as { id: string; name: string }[];

  if (requestedCompanyId && !companyRows.some((company) => company.id === requestedCompanyId)) {
    return NextResponse.json({ error: 'Societe inconnue.' }, { status: 400 });
  }

  const companies = requestedCompanyId ? companyRows.filter((c) => c.id === requestedCompanyId) : companyRows;

  const ports = {
    roster: supabaseRosterDirectory(client),
    summarizer: createAnthropicSummarizerFromEnv(),
    summaries: supabaseSatisfactionSummaryRepository(client),
  };

  const results = [];
  for (const company of companies) {
    const [{ data: settingsRow }, { data: siteRows }, { data: journeyRows }] = await Promise.all([
      client.from('survey_settings').select('minimum_respondents').eq('company_id', company.id).maybeSingle(),
      client.from('sites').select('id, name').eq('company_id', company.id),
      client.from('journeys').select('id, site_id').eq('company_id', company.id),
    ]);

    const minimumRespondents = (settingsRow as { minimum_respondents: number } | null)?.minimum_respondents ?? 5;
    const siteLabelById = new Map(((siteRows ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
    const siteByJourney = new Map(((journeyRows ?? []) as { id: string; site_id: string | null }[]).map((j) => [j.id, j.site_id]));

    const { data: responseRows } = await client
      .from('survey_responses')
      .select('comment, surveys!inner (journey_id, company_id, status)')
      .eq('surveys.company_id', company.id)
      .eq('surveys.status', 'answered');

    const comments = ((responseRows ?? []) as unknown as ResponseRow[])
      .filter((row) => row.comment && row.comment.trim().length > 0 && row.surveys)
      .map((row) => ({
        siteId: siteByJourney.get(row.surveys!.journey_id) ?? null,
        comment: row.comment as string,
      }));

    const outcomes = await generateSatisfactionSummaries(ports, {
      companyId: company.id,
      companyLabel: company.name,
      siteLabelById,
      comments,
      minimumRespondents,
      generatedAt: new Date().toISOString(),
    });

    results.push({ companyId: company.id, outcomes });
  }

  return NextResponse.json({ results }, { status: 200 });
}
