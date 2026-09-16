import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { sendWelcomeEmail } from '@/application/use-cases/send-welcome-email';
import { createSupabaseServiceClient } from '@/infrastructure/supabase/service-client';
import { supabaseNotificationDirectory } from '@/infrastructure/supabase/notification-directory';
import { supabaseCompanyDirectory } from '@/infrastructure/supabase/company-directory';
import { supabaseAuditTrail } from '@/infrastructure/supabase/audit-trail';
import { createResendMailerFromEnv } from '@/infrastructure/resend/mailer';
import { resendEmailTemplates } from '@/infrastructure/resend/email-templates';

/**
 * T-24 — declenchee par le noeud d'attente de W1 (workflows/w1-validated-hire.json)
 * a la date que `resolveWelcomeEmailSendDate` a calculee, jamais a la creation
 * du parcours. Meme authentification que /api/hires/validated : secret
 * partage verifie avant tout effet de bord. Body : des identifiants
 * uniquement (companyId, journeyId) — le nom et l'adresse du destinataire
 * sont relus depuis la base au moment de l'envoi, jamais transmis ici.
 */

interface WelcomeEmailPayload {
  readonly companyId?: unknown;
  readonly journeyId?: unknown;
}

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env['N8N_WEBHOOK_SECRET'];
  const provided = request.headers.get('x-webhook-secret');
  if (!expected || !provided) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

function requireString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Secret de webhook absent ou invalide.' }, { status: 401 });
  }

  let body: WelcomeEmailPayload;
  try {
    body = (await request.json()) as WelcomeEmailPayload;
  } catch {
    return NextResponse.json({ error: 'Corps JSON invalide.' }, { status: 400 });
  }

  const companyId = requireString(body.companyId);
  const journeyId = requireString(body.journeyId);
  if (!companyId || !journeyId) {
    return NextResponse.json({ error: 'Champs manquants ou vides : companyId, journeyId.' }, { status: 400 });
  }

  const appUrl = process.env['NEXT_PUBLIC_APP_URL'];
  if (!appUrl) {
    return NextResponse.json({ error: "Variable d'environnement manquante : NEXT_PUBLIC_APP_URL." }, { status: 500 });
  }

  const client = createSupabaseServiceClient();

  const result = await sendWelcomeEmail(
    {
      notifications: supabaseNotificationDirectory(client),
      branding: supabaseCompanyDirectory(client),
      templates: resendEmailTemplates(),
      mailer: createResendMailerFromEnv(),
      audit: supabaseAuditTrail(client),
      portalUrl: `${appUrl}/portail`,
    },
    { companyId, journeyId },
  );

  if (result.ok) {
    return NextResponse.json(
      result.status === 'sent'
        ? { status: 'sent', channel: result.channel, messageId: result.messageId }
        : { status: 'already_sent' },
      { status: 200 },
    );
  }

  switch (result.reason) {
    case 'journey_not_found':
      return NextResponse.json({ error: 'Parcours introuvable.', reason: 'journey_not_found' }, { status: 404 });
    case 'no_channel_available':
      // Pas une panne : aucun canal joignable. La RH est prevenue via l'audit
      // (email.no_channel_available), pas par une alerte HTTP en plus.
      return NextResponse.json({ error: 'Aucun canal joignable pour cet employe.', reason: 'no_channel_available' }, { status: 422 });
    case 'send_failed':
      return NextResponse.json({ error: 'Envoi refuse ou en echec.', reason: 'send_failed', detail: result.detail }, { status: 502 });
    default:
      return NextResponse.json({ error: 'Echec inattendu.' }, { status: 500 });
  }
}
