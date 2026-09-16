import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { createWorkingCalendar, type WorkingCalendar } from '@/domain/scheduling/working-calendar';
import { planSurveys } from '@/domain/surveys/survey-schedule';
import type { CalendarDirectory } from '@/application/ports/calendar-directory';
import type { CompanyDirectory } from '@/application/ports/company-directory';
import type { JourneyRepository } from '@/application/ports/journey-repository';
import type { Mailer, SendResult } from '@/application/ports/mailer';
import type {
  PlannedSurveyWrite,
  SurveyChannelKind,
  SurveyJourneySource,
  SurveyRecord,
  SurveyRepository,
} from '@/application/ports/survey-repository';
import { resendEmailTemplates } from '@/infrastructure/resend/email-templates';
import { fakeAudit } from './document-test-fixtures';
import { runDay30ReviewScan, type Day30ReviewScanPorts } from './run-day-30-review-scan';

const d = parsePlainDate;
const templates = resendEmailTemplates();
const CALENDAR = createWorkingCalendar();
const NOW_ISO = '2026-10-19T09:00:00.000Z';

function journeySource(overrides: Partial<SurveyJourneySource> & Pick<SurveyJourneySource, 'journeyId'>): SurveyJourneySource {
  return {
    companyId: 'company-nord',
    siteId: null,
    employeeName: 'Employe Test',
    workEmail: null,
    personalEmail: null,
    arrivalDate: d('2026-09-01'),
    endDate: null,
    status: 'in_progress',
    ...overrides,
  };
}

function surveyRecord(overrides: Partial<SurveyRecord> & Pick<SurveyRecord, 'id' | 'journeyId' | 'milestone'>): SurveyRecord {
  return {
    companyId: 'company-nord',
    scheduledOn: d('2026-10-19'),
    status: 'scheduled',
    cancelledReason: null,
    channel: null,
    sentAt: null,
    answeredAt: null,
    reminderSentAt: null,
    ...overrides,
  };
}

interface FakeSurveyRepo {
  repository: SurveyRepository;
  bySurveyId: Map<string, SurveyRecord>;
  reconciliations: PlannedSurveyWrite[];
}

function fakeSurveyRepository(journeys: readonly SurveyJourneySource[], seed: readonly SurveyRecord[] = []): FakeSurveyRepo {
  const bySurveyId = new Map(seed.map((s) => [s.id, s]));
  const reconciliations: PlannedSurveyWrite[] = [];
  let nextId = seed.length + 1;

  const repository: SurveyRepository = {
    async activeJourneySources() {
      return journeys;
    },
    async surveysForJourney(journeyId) {
      return [...bySurveyId.values()].filter((s) => s.journeyId === journeyId);
    },
    async reconcilePlannedSurvey(input) {
      reconciliations.push(input);
      const existing = [...bySurveyId.values()].find(
        (s) => s.journeyId === input.journeyId && s.milestone === input.milestone,
      );
      if (!existing) {
        const record = surveyRecord({
          id: `survey-${nextId++}`,
          journeyId: input.journeyId,
          milestone: input.milestone,
          companyId: input.companyId,
          scheduledOn: input.scheduledOn,
          status: input.status,
          cancelledReason: input.cancelledReason,
        });
        bySurveyId.set(record.id, record);
        return record;
      }
      // Une ligne deja envoyee/repondue ne se reecrit jamais.
      if (existing.status !== 'scheduled') {
        return existing;
      }
      const updated = { ...existing, scheduledOn: input.scheduledOn, status: input.status, cancelledReason: input.cancelledReason };
      bySurveyId.set(existing.id, updated);
      return updated;
    },
    async dueToSend(companyId, today) {
      return [...bySurveyId.values()].filter(
        (s) => s.companyId === companyId && s.status === 'scheduled' && s.scheduledOn <= today,
      );
    },
    async dueForReminder(companyId, sentBefore) {
      return [...bySurveyId.values()].filter(
        (s) => s.companyId === companyId && s.status === 'sent' && !s.reminderSentAt && s.sentAt !== null && s.sentAt <= sentBefore,
      );
    },
    async markSent(surveyId, channel: SurveyChannelKind) {
      const existing = bySurveyId.get(surveyId);
      if (!existing) return;
      bySurveyId.set(surveyId, { ...existing, status: 'sent', channel, sentAt: NOW_ISO });
    },
    async markReminderSent(surveyId) {
      const existing = bySurveyId.get(surveyId);
      if (!existing) return;
      bySurveyId.set(surveyId, { ...existing, reminderSentAt: NOW_ISO });
    },
  };
  return { repository, bySurveyId, reconciliations };
}

function fakeJourneyRepository() {
  const closed: { journeyId: string; status: string }[] = [];
  const repository: Pick<JourneyRepository, 'updateJourneyStatus'> & Partial<JourneyRepository> = {
    async updateJourneyStatus(journeyId, status) {
      closed.push({ journeyId, status });
    },
  };
  return { repository: repository as JourneyRepository, closed };
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

function buildPorts(options: {
  journeys: readonly SurveyJourneySource[];
  surveys?: readonly SurveyRecord[];
  mailerResult?: SendResult;
}): { ports: Day30ReviewScanPorts; surveyRepo: FakeSurveyRepo; journeyRepo: ReturnType<typeof fakeJourneyRepository>; sent: { to: string; subject: string }[]; events: ReturnType<typeof fakeAudit>['events'] } {
  const surveyRepo = fakeSurveyRepository(options.journeys, options.surveys ?? []);
  const journeyRepo = fakeJourneyRepository();
  const { mailer, sent } = fakeMailer(options.mailerResult);
  const { audit, events } = fakeAudit();
  const ports: Day30ReviewScanPorts = {
    surveys: surveyRepo.repository,
    journeys: journeyRepo.repository,
    calendar: fakeCalendar(),
    branding: fakeBranding(),
    templates,
    mailer,
    audit,
    portalUrl: 'https://app.test/portail',
    tokenSecret: 'test-secret',
  };
  return { ports, surveyRepo, journeyRepo, sent, events };
}

describe('runDay30ReviewScan', () => {
  it('cree les deux jalons pour un parcours actif sans questionnaire existant', async () => {
    const journey = journeySource({ journeyId: 'journey-1', arrivalDate: d('2026-09-01') });
    const { ports, surveyRepo } = buildPorts({ journeys: [journey] });

    const result = await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-09-16'), dryRun: false });

    expect(result.reconciledMilestones).toBe(2);
    const milestones = [...surveyRepo.bySurveyId.values()].map((s) => s.milestone).sort();
    expect(milestones).toEqual(['day_30', 'day_7']);
  });

  it('fin de contrat avant J+30 : aucun envoi, le parcours se clot quand meme (cas Diego)', async () => {
    const journey = journeySource({
      journeyId: 'diego',
      employeeName: 'Diego Retarde',
      arrivalDate: d('2026-09-01'),
      endDate: d('2026-09-19'),
      workEmail: 'diego@atelier-nord.demo',
    });
    // Le J+7 est deja repondu : seul le comportement du J+30 est sous test ici.
    const day7 = surveyRecord({
      id: 'diego-day7',
      journeyId: 'diego',
      milestone: 'day_7',
      status: 'answered',
      scheduledOn: d('2026-09-10'),
      answeredAt: '2026-09-11T00:00:00.000Z',
    });
    const { ports, surveyRepo, journeyRepo, sent } = buildPorts({ journeys: [journey], surveys: [day7] });

    const result = await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-10-19'), dryRun: false });

    const day30 = [...surveyRepo.bySurveyId.values()].find((s) => s.milestone === 'day_30');
    expect(day30?.status).toBe('cancelled');
    expect(day30?.cancelledReason).toBe('contract_ended_before');
    expect(sent).toEqual([]);
    expect(result.closedJourneys).toEqual([
      { journeyId: 'diego', employeeName: 'Diego Retarde', reason: 'day30_cancelled_contract_ended' },
    ]);
    expect(journeyRepo.closed).toEqual([{ journeyId: 'diego', status: 'completed' }]);
  });

  it('envoie par email quand une adresse existe, jamais un abandon silencieux', async () => {
    const journey = journeySource({
      journeyId: 'j-email',
      workEmail: 'employe@atelier-nord.demo',
      arrivalDate: d('2026-01-01'),
    });
    const day7 = surveyRecord({
      id: 'j-email-day7',
      journeyId: 'j-email',
      milestone: 'day_7',
      status: 'answered',
      scheduledOn: d('2026-01-12'),
      answeredAt: '2026-01-13T00:00:00.000Z',
    });
    const survey = surveyRecord({ id: 's-1', journeyId: 'j-email', milestone: 'day_30', scheduledOn: d('2026-09-16') });
    const { ports, surveyRepo, sent } = buildPorts({ journeys: [journey], surveys: [day7, survey] });

    const result = await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-09-16'), dryRun: false });

    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe('employe@atelier-nord.demo');
    expect(surveyRepo.bySurveyId.get('s-1')?.status).toBe('sent');
    expect(surveyRepo.bySurveyId.get('s-1')?.channel).toBe('email');
    expect(result.sent).toEqual([
      { journeyId: 'j-email', employeeName: 'Employe Test', surveyId: 's-1', milestone: 'day_30', channel: 'email', sent: true },
    ]);
  });

  it("bascule sur le portail quand l'employe n'a ni adresse professionnelle ni personnelle", async () => {
    const journey = journeySource({
      journeyId: 'j-portal',
      workEmail: null,
      personalEmail: null,
      arrivalDate: d('2026-01-01'),
    });
    const day7 = surveyRecord({
      id: 'j-portal-day7',
      journeyId: 'j-portal',
      milestone: 'day_7',
      status: 'answered',
      scheduledOn: d('2026-01-12'),
      answeredAt: '2026-01-13T00:00:00.000Z',
    });
    const survey = surveyRecord({ id: 's-2', journeyId: 'j-portal', milestone: 'day_30', scheduledOn: d('2026-09-16') });
    const { ports, surveyRepo, sent } = buildPorts({ journeys: [journey], surveys: [day7, survey] });

    await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-09-16'), dryRun: false });

    expect(sent).toEqual([]);
    const updated = surveyRepo.bySurveyId.get('s-2');
    expect(updated?.status).toBe('sent');
    expect(updated?.channel).toBe('portal_link');
  });

  it('relance une seule fois : la deuxieme passe ne renvoie rien', async () => {
    const journey = journeySource({ journeyId: 'j-remind', workEmail: 'employe@atelier-nord.demo' });
    const day7 = surveyRecord({
      id: 'j-remind-day7',
      journeyId: 'j-remind',
      milestone: 'day_7',
      status: 'answered',
      scheduledOn: d('2026-09-10'),
      answeredAt: '2026-09-11T00:00:00.000Z',
    });
    const survey = surveyRecord({
      id: 's-3',
      journeyId: 'j-remind',
      milestone: 'day_30',
      status: 'sent',
      channel: 'email',
      sentAt: '2026-09-16T09:00:00.000Z',
      scheduledOn: d('2026-09-16'),
    });
    const { ports, surveyRepo, sent } = buildPorts({ journeys: [journey], surveys: [day7, survey] });

    // 3 jours ouvres plus tard : la relance doit partir.
    const firstPass = await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-09-21'), dryRun: false });
    expect(firstPass.reminded).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(surveyRepo.bySurveyId.get('s-3')?.reminderSentAt).toBe(NOW_ISO);

    // Un second passage le meme jour, ou plus tard, ne relance jamais deux fois.
    const secondPass = await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-09-22'), dryRun: false });
    expect(secondPass.reminded).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it("ne relance pas avant le delai de 3 jours ouvres", async () => {
    const journey = journeySource({ journeyId: 'j-early', workEmail: 'employe@atelier-nord.demo' });
    const survey = surveyRecord({
      id: 's-4',
      journeyId: 'j-early',
      milestone: 'day_30',
      status: 'sent',
      channel: 'email',
      sentAt: '2026-09-16T09:00:00.000Z',
      scheduledOn: d('2026-09-16'),
    });
    const { ports } = buildPorts({ journeys: [journey], surveys: [survey] });

    const result = await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-09-17'), dryRun: false });
    expect(result.reminded).toEqual([]);
  });

  it('clot le parcours quand le J+30 est repondu', async () => {
    const journey = journeySource({ journeyId: 'j-answered' });
    const survey = surveyRecord({
      id: 's-5',
      journeyId: 'j-answered',
      milestone: 'day_30',
      status: 'answered',
      scheduledOn: d('2026-09-01'),
      answeredAt: '2026-09-02T00:00:00.000Z',
    });
    const { ports, journeyRepo } = buildPorts({ journeys: [journey], surveys: [survey] });

    const result = await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-09-16'), dryRun: false });

    expect(result.closedJourneys).toEqual([{ journeyId: 'j-answered', employeeName: 'Employe Test', reason: 'day30_answered' }]);
    expect(journeyRepo.closed).toEqual([{ journeyId: 'j-answered', status: 'completed' }]);
  });

  it('clot le parcours apres la fenetre de grace sans reponse post-relance', async () => {
    const journey = journeySource({ journeyId: 'j-giveup' });
    const survey = surveyRecord({
      id: 's-6',
      journeyId: 'j-giveup',
      milestone: 'day_30',
      status: 'sent',
      channel: 'email',
      sentAt: '2026-08-01T09:00:00.000Z',
      reminderSentAt: '2026-08-05T09:00:00.000Z',
      scheduledOn: d('2026-08-01'),
    });
    const { ports, journeyRepo } = buildPorts({ journeys: [journey], surveys: [survey] });

    const result = await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-08-13'), dryRun: false });

    expect(result.closedJourneys).toEqual([
      { journeyId: 'j-giveup', employeeName: 'Employe Test', reason: 'day30_reminder_window_elapsed' },
    ]);
    expect(journeyRepo.closed).toEqual([{ journeyId: 'j-giveup', status: 'completed' }]);
  });

  it('recale la date planifiee quand le parcours est reporte, sans toucher un questionnaire deja envoye', async () => {
    const postponedJourney = journeySource({ journeyId: 'j-postponed', arrivalDate: d('2026-10-01') });
    const staleSurvey = surveyRecord({
      id: 's-7',
      journeyId: 'j-postponed',
      milestone: 'day_7',
      status: 'scheduled',
      scheduledOn: d('2026-09-10'),
    });
    const alreadySent = surveyRecord({
      id: 's-8',
      journeyId: 'j-postponed',
      milestone: 'day_30',
      status: 'sent',
      channel: 'email',
      sentAt: '2026-09-20T09:00:00.000Z',
      scheduledOn: d('2026-09-20'),
    });
    const { ports, surveyRepo } = buildPorts({ journeys: [postponedJourney], surveys: [staleSurvey, alreadySent] });

    await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-09-16'), dryRun: false });

    const expectedPlan = planSurveys({ arrivalDate: d('2026-10-01'), endDate: null, calendar: CALENDAR });
    const expectedDay7 = expectedPlan.find((p) => p.milestone === 'day_7');
    const rescheduled = surveyRepo.bySurveyId.get('s-7');
    expect(rescheduled?.scheduledOn).toBe(expectedDay7?.scheduledOn);
    const untouched = surveyRepo.bySurveyId.get('s-8');
    expect(untouched?.scheduledOn).toBe(d('2026-09-20'));
    expect(untouched?.status).toBe('sent');
  });

  it('execution a blanc : ne cree, n envoie ni ne clot rien', async () => {
    const journey = journeySource({ journeyId: 'j-dry', workEmail: 'employe@atelier-nord.demo' });
    const { ports, surveyRepo, journeyRepo, sent } = buildPorts({ journeys: [journey] });

    const result = await runDay30ReviewScan(ports, { companyId: 'company-nord', today: d('2026-09-16'), dryRun: true });

    expect(result.sent).toEqual([]);
    expect(result.reminded).toEqual([]);
    expect(result.closedJourneys).toEqual([]);
    expect(surveyRepo.bySurveyId.size).toBe(0);
    expect(surveyRepo.reconciliations).toEqual([]);
    expect(journeyRepo.closed).toEqual([]);
    expect(sent).toEqual([]);
  });
});
