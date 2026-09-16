import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import type { TemplateDetail } from '@/application/ports/template-repository';
import type { ValidatedHireInput } from './create-journey-from-validated-hire';
import { createJourneyFromValidatedHire } from './create-journey-from-validated-hire';
import { fakeAudit } from './document-test-fixtures';
import {
  fakeAssignmentDirectory,
  fakeCalendarDirectory,
  fakeClock,
  fakeJourneyRepository,
  fakeTemplateRepository,
} from './create-journey-test-fixtures';
import { fakeCalendar, fakeCalendarEventContext, fakeCalendarEventRepository } from './calendar-test-fixtures';

const d = parsePlainDate;

const COMPANY = 'company-nord';

const STANDARD_TEMPLATE: TemplateDetail = {
  id: 'template-standard',
  companyId: COMPANY,
  name: 'Parcours standard',
  criteria: { jobFamily: null, siteId: null, contractType: null },
  tasks: [
    {
      id: 'tt-contract',
      key: 'contract',
      title: 'Contrat signé',
      ownerRole: 'hr_admin',
      offsetInWorkingDays: -5,
      dependsOn: [],
      expectedDocument: 'contrat-signe',
      sharedKey: null,
      criticality: 'standard',
      position: 1,
    },
    {
      id: 'tt-it',
      key: 'it-account',
      title: 'Créer le compte IT',
      ownerRole: 'it',
      offsetInWorkingDays: -2,
      dependsOn: ['contract'],
      expectedDocument: null,
      sharedKey: null,
      criticality: 'standard',
      position: 2,
    },
    {
      id: 'tt-welcome',
      key: 'welcome',
      title: 'Accueil',
      ownerRole: 'manager',
      offsetInWorkingDays: 0,
      dependsOn: ['it-account'],
      expectedDocument: 'accuse-reception',
      sharedKey: null,
      criticality: 'standard',
      position: 3,
    },
  ],
};

function baseInput(overrides: Partial<ValidatedHireInput> = {}): ValidatedHireInput {
  return {
    companyId: COMPANY,
    siteId: 'site-lille',
    jobFamily: 'atelier',
    contractType: 'cdi',
    employeeName: 'Alice Arrivante',
    employeeId: null,
    managerId: 'user-manager',
    arrivalDate: '2026-04-20',
    hireReference: 'ats-hire-001',
    personalEmail: null,
    ...overrides,
  };
}

function ports(details: readonly TemplateDetail[] = [STANDARD_TEMPLATE]) {
  const templates = fakeTemplateRepository(details);
  const journeyRepo = fakeJourneyRepository();
  const calendar = fakeCalendarDirectory();
  const directory = fakeAssignmentDirectory();
  const { audit, events } = fakeAudit();
  const clock = fakeClock(d('2026-04-01'));
  const { repository: calendarEvents, rows: calendarEventRows } = fakeCalendarEventRepository();

  return {
    ports: {
      templates,
      journeys: journeyRepo.repository,
      calendar,
      directory,
      audit,
      clock,
      calendarEvents,
      calendarClient: fakeCalendar(),
      calendarContext: fakeCalendarEventContext(),
    },
    journeyRepo,
    events,
    calendarEventRows,
  };
}

describe('createJourneyFromValidatedHire', () => {
  it('cree le parcours, instancie les taches et attribue les responsables', async () => {
    const { ports: p, journeyRepo, events, calendarEventRows } = ports();

    const result = await createJourneyFromValidatedHire(p, baseInput());

    expect(result).toMatchObject({ ok: true, status: 'created', arrivalInPast: false, sendWelcomeEmailAt: '2026-04-15' });
    expect(result.ok && journeyRepo.journeys.has(result.journeyId)).toBe(true);

    const tasks = result.ok ? journeyRepo.tasksByJourney.get(result.journeyId) : undefined;
    expect(tasks).toHaveLength(3);
    expect(tasks?.find((t) => t.title === 'Contrat signé')?.dueDate).toBe('2026-04-13');

    // Le manager tient la chaine par defaut : la tache "welcome" lui revient.
    const welcomeTask = tasks?.find((t) => t.title === 'Accueil');
    expect(welcomeTask).toBeDefined();
    expect(welcomeTask && journeyRepo.owners.get(welcomeTask.id)).toBe('user-manager');

    // Regression T-25 : le decalage en jours ouvres de chaque tache doit être
    // persiste, sinon un report d'arrivee ulterieur (`reschedule-journey.ts`)
    // recalculerait toutes les echeances sur le meme jour (decalage 0 partout).
    const contractTask = tasks?.find((t) => t.title === 'Contrat signé');
    expect(contractTask && journeyRepo.offsetsByTask.get(contractTask.id)).toBe(-5);
    const itTask = tasks?.find((t) => t.title === 'Créer le compte IT');
    expect(itTask && journeyRepo.offsetsByTask.get(itTask.id)).toBe(-2);
    expect(welcomeTask && journeyRepo.offsetsByTask.get(welcomeTask.id)).toBe(0);

    expect(events.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        'journey.created',
        'journey.owner_notification_pending',
        'journey.welcome_email_pending',
        'calendar.event_created',
      ]),
    );
    expect(events.every((e) => e.actorId === null)).toBe(true);

    const welcomeEmailEvent = events.find((e) => e.action === 'journey.welcome_email_pending');
    expect(welcomeEmailEvent?.payload).toMatchObject({ sendWelcomeEmailAt: '2026-04-15' });

    // Seule la tache "Accueil" (echeance = date d'arrivee) tombe dans la
    // premiere semaine ; les autres taches de ce template sont anterieures a
    // l'arrivee et n'ont pas d'evenement.
    expect([...calendarEventRows.values()]).toHaveLength(1);
    expect([...calendarEventRows.values()][0]?.title).toBe('Accueil');
  });

  it('cas limite : meme embauche recue deux fois, aucun second parcours', async () => {
    const { ports: p, journeyRepo } = ports();

    const first = await createJourneyFromValidatedHire(p, baseInput());
    const second = await createJourneyFromValidatedHire(p, baseInput());

    expect(first.ok && first.status).toBe('created');
    expect(second).toMatchObject({ ok: true, status: 'duplicate' });
    expect(second.ok && first.ok && second.journeyId).toBe(first.ok && first.journeyId);
    expect(journeyRepo.journeys.size).toBe(1);
  });

  it('cas limite : aucun template ne correspond, echec explicite sans parcours cree', async () => {
    const { ports: p, journeyRepo, events } = ports([]);

    const result = await createJourneyFromValidatedHire(p, baseInput());

    expect(result).toEqual({ ok: false, reason: 'no_match' });
    expect(journeyRepo.journeys.size).toBe(0);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ action: 'journey.template_selection_failed', payload: { reason: 'no_match' } });
  });

  it('cas limite : deux templates a egalite, jamais un parcours devine', async () => {
    const ambiguousA: TemplateDetail = { ...STANDARD_TEMPLATE, id: 'template-a', criteria: { jobFamily: 'atelier', siteId: null, contractType: null } };
    const ambiguousB: TemplateDetail = { ...STANDARD_TEMPLATE, id: 'template-b', criteria: { jobFamily: null, siteId: 'site-lille', contractType: null } };
    const { ports: p, journeyRepo } = ports([ambiguousA, ambiguousB]);

    const result = await createJourneyFromValidatedHire(p, baseInput());

    expect(result).toMatchObject({ ok: false, reason: 'ambiguous_match', templateIds: ['template-a', 'template-b'] });
    expect(journeyRepo.journeys.size).toBe(0);
  });

  it('cas limite : date d arrivee dans le passe, acceptee et signalee', async () => {
    const { ports: p, events } = ports();

    const result = await createJourneyFromValidatedHire(p, baseInput({ arrivalDate: '2026-03-01' }));

    expect(result).toMatchObject({ ok: true, status: 'created', arrivalInPast: true });
    expect(events.map((e) => e.action)).toContain('journey.arrival_in_past');
  });

  it('rejette une date d arrivee mal formee', async () => {
    const { ports: p } = ports();

    const result = await createJourneyFromValidatedHire(p, baseInput({ arrivalDate: 'pas-une-date' }));

    expect(result).toEqual({ ok: false, reason: 'invalid_arrival_date' });
  });
});
