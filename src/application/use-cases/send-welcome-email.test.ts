import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import type { CompanyDirectory } from '@/application/ports/company-directory';
import type { Mailer, SendResult } from '@/application/ports/mailer';
import type { NotificationDirectory, WelcomeEmailContext } from '@/application/ports/notification-directory';
import type { CompanyBranding } from '@/lib/branding';
import { resendEmailTemplates } from '@/infrastructure/resend/email-templates';
import { sendWelcomeEmail, type SendWelcomeEmailPorts } from './send-welcome-email';
import { fakeAudit } from './document-test-fixtures';

const templates = resendEmailTemplates();

const BRANDING: CompanyBranding = {
  name: 'Atelier Nord',
  primary: 'oklch(0.48 0.16 264)',
  accent: 'oklch(0.74 0.13 162)',
  logoUrl: null,
};

function fakeNotifications(seed: WelcomeEmailContext | null) {
  let context = seed;
  const markedSent: string[] = [];
  const directory: NotificationDirectory = {
    async welcomeContextFor() {
      return context;
    },
    async markWelcomeEmailSent(journeyId) {
      markedSent.push(journeyId);
      if (context) {
        context = { ...context, welcomeEmailSentAt: '2026-04-01T00:00:00.000Z' };
      }
    },
  };
  return { directory, markedSent };
}

function fakeBranding(branding: CompanyBranding | null = BRANDING): CompanyDirectory {
  return {
    async membershipsOf() {
      return [];
    },
    async brandingOf() {
      return branding;
    },
  };
}

function fakeMailer(result: SendResult) {
  const sent: { to: string }[] = [];
  const mailer: Mailer = {
    async send(message) {
      sent.push({ to: message.to.email });
      return result;
    },
  };
  return { mailer, sent };
}

function context(overrides: Partial<WelcomeEmailContext> = {}): WelcomeEmailContext {
  return {
    companyId: 'company-nord',
    journeyId: 'journey-1',
    employeeName: 'Alice Arrivante',
    personalEmail: null,
    professionalEmail: null,
    managerEmail: null,
    managerName: null,
    arrivalDate: parsePlainDate('2026-04-20'),
    welcomeEmailSentAt: null,
    ...overrides,
  };
}

describe('sendWelcomeEmail', () => {
  it('envoie sur l email personnel quand il existe et trace le canal utilise', async () => {
    const { directory, markedSent } = fakeNotifications(context({ personalEmail: 'alice@perso.example' }));
    const { mailer, sent } = fakeMailer({ ok: true, messageId: 'msg-1' });
    const { audit, events } = fakeAudit();
    const ports: SendWelcomeEmailPorts = { notifications: directory, branding: fakeBranding(), templates, mailer, audit, portalUrl: 'https://app.test/portail' };

    const result = await sendWelcomeEmail(ports, { companyId: 'company-nord', journeyId: 'journey-1' });

    expect(result).toEqual({ ok: true, status: 'sent', channel: 'personal', messageId: 'msg-1' });
    expect(sent).toEqual([{ to: 'alice@perso.example' }]);
    expect(markedSent).toEqual(['journey-1']);
    expect(events).toContainEqual(
      expect.objectContaining({ action: 'email.sent', payload: expect.objectContaining({ channel: 'personal' }) }),
    );
  });

  it('cas limite : employe sans email personnel, bascule sur le professionnel et le trace', async () => {
    const { directory } = fakeNotifications(
      context({ personalEmail: null, professionalEmail: 'alice@atelier-nord.demo' }),
    );
    const { mailer, sent } = fakeMailer({ ok: true, messageId: 'msg-2' });
    const { audit, events } = fakeAudit();
    const ports: SendWelcomeEmailPorts = { notifications: directory, branding: fakeBranding(), templates, mailer, audit, portalUrl: 'https://app.test/portail' };

    const result = await sendWelcomeEmail(ports, { companyId: 'company-nord', journeyId: 'journey-1' });

    expect(result).toMatchObject({ ok: true, status: 'sent', channel: 'professional' });
    expect(sent).toEqual([{ to: 'alice@atelier-nord.demo' }]);
    expect(events).toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ channel: 'professional' }) }),
    );
  });

  it('cas limite : ni email personnel ni professionnel, bascule sur le manager sans echec silencieux', async () => {
    const { directory } = fakeNotifications(
      context({ personalEmail: null, professionalEmail: null, managerEmail: 'manager@atelier-nord.demo', managerName: 'Marc Manceau' }),
    );
    const { mailer, sent } = fakeMailer({ ok: true, messageId: 'msg-3' });
    const { audit, events } = fakeAudit();
    const ports: SendWelcomeEmailPorts = { notifications: directory, branding: fakeBranding(), templates, mailer, audit, portalUrl: 'https://app.test/portail' };

    const result = await sendWelcomeEmail(ports, { companyId: 'company-nord', journeyId: 'journey-1' });

    expect(result).toMatchObject({ ok: true, status: 'sent', channel: 'manager' });
    expect(sent).toEqual([{ to: 'manager@atelier-nord.demo' }]);
    expect(events).toContainEqual(
      expect.objectContaining({ payload: expect.objectContaining({ channel: 'manager' }) }),
    );
  });

  it('aucun canal joignable : echec explicite et RH prevenue via l audit, aucun envoi tente', async () => {
    const { directory } = fakeNotifications(context());
    const { mailer, sent } = fakeMailer({ ok: true, messageId: 'unused' });
    const { audit, events } = fakeAudit();
    const ports: SendWelcomeEmailPorts = { notifications: directory, branding: fakeBranding(), templates, mailer, audit, portalUrl: 'https://app.test/portail' };

    const result = await sendWelcomeEmail(ports, { companyId: 'company-nord', journeyId: 'journey-1' });

    expect(result).toEqual({ ok: false, reason: 'no_channel_available' });
    expect(sent).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ action: 'email.no_channel_available' }));
  });

  it('adresse rejetee par le fournisseur : la tache reste ouverte, l echec est trace pour la RH', async () => {
    const { directory, markedSent } = fakeNotifications(context({ personalEmail: 'invalide@' }));
    const { mailer } = fakeMailer({ ok: false, reason: 'invalid_recipient', detail: 'adresse invalide' });
    const { audit, events } = fakeAudit();
    const ports: SendWelcomeEmailPorts = { notifications: directory, branding: fakeBranding(), templates, mailer, audit, portalUrl: 'https://app.test/portail' };

    const result = await sendWelcomeEmail(ports, { companyId: 'company-nord', journeyId: 'journey-1' });

    expect(result).toEqual({ ok: false, reason: 'send_failed', detail: 'adresse invalide' });
    expect(markedSent).toEqual([]);
    expect(events).toContainEqual(
      expect.objectContaining({ action: 'email.delivery_failed', payload: expect.objectContaining({ reason: 'invalid_recipient' }) }),
    );
  });

  it('idempotent : un email deja envoye n est jamais renvoye', async () => {
    const { directory } = fakeNotifications(
      context({ personalEmail: 'alice@perso.example', welcomeEmailSentAt: '2026-04-01T00:00:00.000Z' }),
    );
    const { mailer, sent } = fakeMailer({ ok: true, messageId: 'msg-4' });
    const { audit } = fakeAudit();
    const ports: SendWelcomeEmailPorts = { notifications: directory, branding: fakeBranding(), templates, mailer, audit, portalUrl: 'https://app.test/portail' };

    const result = await sendWelcomeEmail(ports, { companyId: 'company-nord', journeyId: 'journey-1' });

    expect(result).toEqual({ ok: true, status: 'already_sent' });
    expect(sent).toEqual([]);
  });

  it('parcours introuvable : echec explicite plutot qu une exception', async () => {
    const { directory } = fakeNotifications(null);
    const { mailer } = fakeMailer({ ok: true, messageId: 'unused' });
    const { audit } = fakeAudit();
    const ports: SendWelcomeEmailPorts = { notifications: directory, branding: fakeBranding(), templates, mailer, audit, portalUrl: 'https://app.test/portail' };

    const result = await sendWelcomeEmail(ports, { companyId: 'company-nord', journeyId: 'journey-1' });

    expect(result).toEqual({ ok: false, reason: 'journey_not_found' });
  });

  it('cas limite : societe sans branding resolu, le gabarit de repli reste envoyable', async () => {
    const { directory } = fakeNotifications(context({ personalEmail: 'alice@perso.example' }));
    const { mailer, sent } = fakeMailer({ ok: true, messageId: 'msg-5' });
    const { audit } = fakeAudit();
    const ports: SendWelcomeEmailPorts = { notifications: directory, branding: fakeBranding(null), templates, mailer, audit, portalUrl: 'https://app.test/portail' };

    const result = await sendWelcomeEmail(ports, { companyId: 'company-nord', journeyId: 'journey-1' });

    expect(result).toMatchObject({ ok: true, status: 'sent' });
    expect(sent).toEqual([{ to: 'alice@perso.example' }]);
  });
});

