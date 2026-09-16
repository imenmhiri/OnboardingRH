import { resolveRecipient, type EmailChannel } from '@/domain/notifications/recipient-resolution';
import { FALLBACK_BRANDING } from '@/lib/branding';
import type { AuditTrail } from '@/application/ports/audit-trail';
import type { CompanyDirectory } from '@/application/ports/company-directory';
import type { EmailTemplates } from '@/application/ports/email-templates';
import type { Mailer } from '@/application/ports/mailer';
import type { NotificationDirectory } from '@/application/ports/notification-directory';

/**
 * Envoi reel de l'email de bienvenue, appele par le webhook de n8n au moment
 * differe que `resolveWelcomeEmailSendDate` (domain/scheduling) a calcule —
 * jamais a la creation du parcours. Voir W1 dans
 * `create-journey-from-validated-hire.ts` pour le point d'accroche, et
 * `workflows/w1-validated-hire.json` pour le noeud d'attente qui declenche
 * cet appel.
 */

export interface SendWelcomeEmailInput {
  readonly companyId: string;
  readonly journeyId: string;
}

export type SendWelcomeEmailResult =
  | { readonly ok: true; readonly status: 'sent'; readonly channel: EmailChannel; readonly messageId: string }
  | { readonly ok: true; readonly status: 'already_sent' }
  | { readonly ok: false; readonly reason: 'journey_not_found' }
  | { readonly ok: false; readonly reason: 'no_channel_available' }
  | { readonly ok: false; readonly reason: 'send_failed'; readonly detail?: string };

export interface SendWelcomeEmailPorts {
  readonly notifications: NotificationDirectory;
  readonly branding: CompanyDirectory;
  readonly templates: EmailTemplates;
  readonly mailer: Mailer;
  readonly audit: AuditTrail;
  readonly portalUrl: string;
}

const SYSTEM_ACTOR = null;

export async function sendWelcomeEmail(
  ports: SendWelcomeEmailPorts,
  input: SendWelcomeEmailInput,
): Promise<SendWelcomeEmailResult> {
  const context = await ports.notifications.welcomeContextFor(input.companyId, input.journeyId);
  if (!context) {
    return { ok: false, reason: 'journey_not_found' };
  }

  // Idempotence : un rejeu du webhook differe (retry n8n, double appel) ne
  // doit jamais produire un second email.
  if (context.welcomeEmailSentAt) {
    return { ok: true, status: 'already_sent' };
  }

  const resolution = resolveRecipient({
    personalEmail: context.personalEmail,
    professionalEmail: context.professionalEmail,
    managerEmail: context.managerEmail,
  });

  if (!resolution.ok) {
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'email.no_channel_available',
      journeyId: input.journeyId,
      payload: { template: 'welcome' },
    });
    return { ok: false, reason: 'no_channel_available' };
  }

  const branding = (await ports.branding.brandingOf(input.companyId)) ?? FALLBACK_BRANDING;

  const rendered = ports.templates.renderWelcome({
    employeeName: context.employeeName,
    arrivalDate: context.arrivalDate,
    portalUrl: ports.portalUrl,
    branding,
    channel: resolution.channel,
    managerName: context.managerName,
  });

  const recipientName = resolution.channel === 'manager' ? context.managerName : context.employeeName;
  const result = await ports.mailer.send({
    to: { email: resolution.email, ...(recipientName ? { name: recipientName } : {}) },
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
  });

  if (!result.ok) {
    // La tache reste ouverte et la RH est prevenue par cette trace : voir
    // cockpit (a construire) pour la surface, cette ecriture est la source.
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'email.delivery_failed',
      journeyId: input.journeyId,
      payload: { template: 'welcome', channel: resolution.channel, reason: result.reason, detail: result.detail },
    });
    return result.detail !== undefined
      ? { ok: false, reason: 'send_failed', detail: result.detail }
      : { ok: false, reason: 'send_failed' };
  }

  await ports.notifications.markWelcomeEmailSent(input.journeyId);
  await ports.audit.record({
    companyId: input.companyId,
    actorId: SYSTEM_ACTOR,
    action: 'email.sent',
    journeyId: input.journeyId,
    payload: { template: 'welcome', channel: resolution.channel, messageId: result.messageId },
  });

  return { ok: true, status: 'sent', channel: resolution.channel, messageId: result.messageId };
}
