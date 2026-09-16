import { describe, expect, it } from 'vitest';
import { parsePlainDate, type PlainDate } from '@/domain/scheduling/plain-date';
import { createWorkingCalendar } from '@/domain/scheduling/working-calendar';
import type { WorkingCalendar } from '@/domain/scheduling/working-calendar';
import type { Task } from '@/domain/tasks/task';
import type { EscalationPolicy } from '@/domain/escalation/escalation-policy';
import type { CalendarDirectory } from '@/application/ports/calendar-directory';
import type { CompanyDirectory } from '@/application/ports/company-directory';
import type { Mailer, SendResult } from '@/application/ports/mailer';
import type {
  EscalationJourneySource,
  EscalationRepository,
  PersonContact,
} from '@/application/ports/escalation-repository';
import { resendEmailTemplates } from '@/infrastructure/resend/email-templates';
import { runCriticalDelayScan, type CriticalDelayScanPorts } from './run-critical-delay-scan';
import { fakeAudit } from './document-test-fixtures';

const d = parsePlainDate;
const templates = resendEmailTemplates();

const CALENDAR = createWorkingCalendar({ holidays: [d('2026-04-06')] });

function task(overrides: Partial<Task> & Pick<Task, 'id'>): Task {
  return {
    journeyId: 'journey-1',
    title: `Tâche ${overrides.id}`,
    ownerRole: 'it',
    ownerId: 'user-it',
    dependsOn: [],
    status: 'pending',
    dueDate: d('2026-04-01'),
    expectedDocument: null,
    sharedKey: null,
    criticality: 'standard',
    ...overrides,
  };
}

const POLICY: EscalationPolicy = {
  companyId: 'company-nord',
  standard: [
    { afterWorkingDaysLate: 1, recipient: 'owner' },
    { afterWorkingDaysLate: 3, recipient: 'manager' },
  ],
  critical: [
    { afterWorkingDaysLate: 1, recipient: 'manager' },
    { afterWorkingDaysLate: 2, recipient: 'hr_admin' },
  ],
};

const CONTACTS: Record<string, PersonContact> = {
  'user-it': { id: 'user-it', name: 'Ines Tavares', email: 'ines@atelier-nord.demo' },
  'user-manager': { id: 'user-manager', name: 'Marc Manceau', email: 'marc@atelier-nord.demo' },
  'user-rh': { id: 'user-rh', name: 'Rachel Renard', email: 'rachel@atelier-nord.demo' },
};

function fakeEscalationRepository(options: {
  journeys?: readonly EscalationJourneySource[];
  policy?: EscalationPolicy | null;
  lastReminders?: ReadonlyMap<string, PlainDate>;
  hrAdminIds?: readonly string[];
}) {
  const journeys = options.journeys ?? [];
  const repository: EscalationRepository = {
    async journeysWithTasks() {
      return journeys;
    },
    async policyFor() {
      return options.policy === undefined ? POLICY : options.policy;
    },
    async hrAdminIds() {
      return options.hrAdminIds ?? ['user-rh'];
    },
    async lastReminderDates() {
      return options.lastReminders ?? new Map();
    },
    async personContact(personId: string) {
      return CONTACTS[personId] ?? null;
    },
  };
  return repository;
}

function fakeCalendar(calendar: WorkingCalendar = CALENDAR): CalendarDirectory {
  return { async calendarFor() { return calendar; } };
}

function fakeBranding(): CompanyDirectory {
  return {
    async membershipsOf() { return []; },
    async brandingOf() { return { name: 'Atelier Nord', primary: 'oklch(0.48 0.16 264)', accent: 'oklch(0.74 0.13 162)', logoUrl: null }; },
  };
}

function fakeMailer(result: SendResult = { ok: true, messageId: 'msg-1' }) {
  const sent: { to: string; subject: string }[] = [];
  const mailer: Mailer = {
    async send(message) {
      sent.push({ to: message.to.email, subject: message.subject });
      return result;
    },
  };
  return { mailer, sent };
}

function ports(overrides: Partial<CriticalDelayScanPorts> = {}): { ports: CriticalDelayScanPorts; sent: { to: string; subject: string }[]; events: ReturnType<typeof fakeAudit>['events'] } {
  const { mailer, sent } = fakeMailer();
  const { audit, events } = fakeAudit();
  const base: CriticalDelayScanPorts = {
    escalation: fakeEscalationRepository({}),
    calendar: fakeCalendar(),
    branding: fakeBranding(),
    templates,
    mailer,
    audit,
    portalUrl: 'https://app.test/portail',
    ...overrides,
  };
  return { ports: base, sent, events };
}

const TODAY = d('2026-04-10');

describe('runCriticalDelayScan', () => {
  it('tache critique en tres grand retard : escalade directement a la RH (donnees demo Diego)', async () => {
    const journeys: EscalationJourneySource[] = [
      {
        journeyId: 'journey-diego',
        employeeName: 'Diego Retardé',
        siteId: null,
        managerId: 'user-manager',
        status: 'active',
        tasks: [task({ id: 'it-account', dueDate: d('2026-03-31'), criticality: 'critical' })],
      },
    ];
    const { ports: p, sent, events } = ports({ escalation: fakeEscalationRepository({ journeys }) });

    const result = await runCriticalDelayScan(p, { companyId: 'company-nord', today: TODAY, dryRun: false });

    expect(result.skipped).toBe(false);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]).toMatchObject({
      recipientRole: 'hr_admin',
      recipientId: 'user-rh',
      template: 'escalation',
      sent: true,
    });
    expect(sent).toEqual([{ to: 'rachel@atelier-nord.demo', subject: expect.stringContaining('Escalade') }]);
    expect(events).toContainEqual(expect.objectContaining({ action: 'task.reminder_sent', payload: expect.objectContaining({ level: 'hr_admin' }) }));
  });

  it('tache standard : releve d abord le proprietaire puis, plus tard, le manager', async () => {
    const oneDay: EscalationJourneySource[] = [
      { journeyId: 'j1', employeeName: 'Alice', siteId: null, managerId: 'user-manager', status: 'active', tasks: [task({ id: 't1', dueDate: d('2026-04-09') })] },
    ];
    const { ports: p1 } = ports({ escalation: fakeEscalationRepository({ journeys: oneDay }) });
    const r1 = await runCriticalDelayScan(p1, { companyId: 'company-nord', today: TODAY, dryRun: false });
    expect(r1.notifications[0]).toMatchObject({ recipientRole: 'owner', template: 'reminder' });

    const threeDaysLate: EscalationJourneySource[] = [
      { journeyId: 'j1', employeeName: 'Alice', siteId: null, managerId: 'user-manager', status: 'active', tasks: [task({ id: 't1', dueDate: d('2026-04-07') })] },
    ];
    const { ports: p2 } = ports({ escalation: fakeEscalationRepository({ journeys: threeDaysLate }) });
    const r2 = await runCriticalDelayScan(p2, { companyId: 'company-nord', today: TODAY, dryRun: false });
    expect(r2.notifications[0]).toMatchObject({ recipientRole: 'manager', template: 'escalation' });
  });

  it('cas limite : relance deja envoyee aujourd hui, pas de doublon', async () => {
    const journeys: EscalationJourneySource[] = [
      { journeyId: 'j1', employeeName: 'Alice', siteId: null, managerId: 'user-manager', status: 'active', tasks: [task({ id: 't1', dueDate: d('2026-04-09') })] },
    ];
    const { ports: p, sent } = ports({
      escalation: fakeEscalationRepository({ journeys, lastReminders: new Map([['t1', TODAY]]) }),
    });

    const result = await runCriticalDelayScan(p, { companyId: 'company-nord', today: TODAY, dryRun: false });

    expect(result.notifications).toEqual([]);
    expect(result.refusals).toContainEqual(expect.objectContaining({ taskId: 't1', code: 'already_reminded_today' }));
    expect(sent).toEqual([]);
  });

  it('cas limite : tache bloquee par une autre, seule la cause racine actionnable est prevenue', async () => {
    const journeys: EscalationJourneySource[] = [
      {
        journeyId: 'j1',
        employeeName: 'Bruno',
        siteId: null,
        managerId: 'user-manager',
        status: 'active',
        tasks: [
          task({ id: 'contract', ownerId: 'user-it', dueDate: d('2026-04-07') }),
          task({ id: 'it-account', ownerId: 'user-manager', dueDate: d('2026-04-08'), dependsOn: ['contract'] }),
        ],
      },
    ];
    const { ports: p } = ports({ escalation: fakeEscalationRepository({ journeys }) });

    const result = await runCriticalDelayScan(p, { companyId: 'company-nord', today: TODAY, dryRun: false });

    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]?.taskId).toBe('contract');
  });

  it('cas limite : jour ferie de la societe, aucune relance, le passage est saute', async () => {
    const journeys: EscalationJourneySource[] = [
      { journeyId: 'j1', employeeName: 'Alice', siteId: null, managerId: 'user-manager', status: 'active', tasks: [task({ id: 't1', dueDate: d('2026-04-01') })] },
    ];
    const { ports: p, sent } = ports({ escalation: fakeEscalationRepository({ journeys }) });

    const result = await runCriticalDelayScan(p, { companyId: 'company-nord', today: d('2026-04-06'), dryRun: false });

    expect(result.skipped).toBe(true);
    expect(result.skippedReason).toBe('non_working_day');
    expect(result.notifications).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('execution a blanc : rapporte qui serait prevenu, sans rien envoyer ni tracer', async () => {
    const journeys: EscalationJourneySource[] = [
      { journeyId: 'j1', employeeName: 'Alice', siteId: null, managerId: 'user-manager', status: 'active', tasks: [task({ id: 't1', dueDate: d('2026-04-09') })] },
    ];
    const { ports: p, sent, events } = ports({ escalation: fakeEscalationRepository({ journeys }) });

    const result = await runCriticalDelayScan(p, { companyId: 'company-nord', today: TODAY, dryRun: true });

    expect(result.notifications).toEqual([
      expect.objectContaining({
        taskId: 't1',
        taskTitle: 'Tâche t1',
        recipientRole: 'owner',
        recipientName: 'Ines Tavares',
        workingDaysLate: 1,
        sent: false,
      }),
    ]);
    expect(sent).toEqual([]);
    expect(events).toEqual([]);
  });
});
