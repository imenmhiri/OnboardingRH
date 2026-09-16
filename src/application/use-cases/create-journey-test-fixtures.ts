import type { Absence, AssignmentContext, OwnerSlot } from '@/domain/tasks/owner-resolution';
import type { OwnerRole, Task } from '@/domain/tasks/task';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import { createWorkingCalendar, type WorkingCalendar } from '@/domain/scheduling/working-calendar';
import type { AssignmentDirectory } from '@/application/ports/assignment-directory';
import type { CalendarDirectory } from '@/application/ports/calendar-directory';
import type { Clock } from '@/application/ports/clock';
import type { InsertJourneyResult, JourneyRepository, NewJourneyInput } from '@/application/ports/journey-repository';
import type { TemplateDetail, TemplateRepository, TemplateSummary } from '@/application/ports/template-repository';

/** Doublures en memoire, pas des mocks : de vraies implementations des ports. */

export function fakeTemplateRepository(details: readonly TemplateDetail[]): TemplateRepository {
  const byId = new Map(details.map((detail) => [detail.id, detail]));
  const summaries: TemplateSummary[] = details.map((detail) => ({
    id: detail.id,
    companyId: detail.companyId,
    name: detail.name,
    criteria: detail.criteria,
    taskCount: detail.tasks.length,
  }));

  return {
    async listByCompany(companyId: string) {
      return summaries.filter((summary) => summary.companyId === companyId);
    },
    async findById(templateId: string) {
      return byId.get(templateId) ?? null;
    },
    async create() {
      throw new Error('non utilise par ces tests');
    },
    async rename() {
      throw new Error('non utilise par ces tests');
    },
    async upsertTask() {
      throw new Error('non utilise par ces tests');
    },
    async deleteTask() {
      throw new Error('non utilise par ces tests');
    },
    async duplicate() {
      throw new Error('non utilise par ces tests');
    },
  };
}

export interface JourneyRow {
  readonly input: NewJourneyInput;
}

export function fakeJourneyRepository(overrides: Partial<JourneyRepository> = {}) {
  const journeys = new Map<string, JourneyRow>();
  const byHireReference = new Map<string, string>();
  const tasksByJourney = new Map<string, Task[]>();
  const owners = new Map<string, string | null>();

  const repository: JourneyRepository = {
    async findByHireReference(companyId: string, hireReference: string) {
      const journeyId = byHireReference.get(`${companyId}:${hireReference}`);
      return journeyId ? { journeyId } : null;
    },
    async insertJourney(input: NewJourneyInput): Promise<InsertJourneyResult> {
      const key = `${input.companyId}:${input.hireReference}`;
      if (byHireReference.has(key)) {
        return { ok: false, reason: 'duplicate_hire_reference' };
      }
      journeys.set(input.id, { input });
      byHireReference.set(key, input.id);
      return { ok: true };
    },
    async insertTasks(_companyId: string, journeyId: string, tasks: readonly Task[]) {
      tasksByJourney.set(journeyId, [...tasks]);
    },
    async assignOwner(taskId: string, ownerId: string | null) {
      owners.set(taskId, ownerId);
    },
    ...overrides,
  };

  return { repository, journeys, tasksByJourney, owners };
}

export function fakeCalendarDirectory(calendar: WorkingCalendar = createWorkingCalendar()): CalendarDirectory {
  return {
    async calendarFor() {
      return calendar;
    },
  };
}

export function fakeClock(today: PlainDate): Clock {
  return { today: () => today };
}

const DEFAULT_CONTEXT: AssignmentContext = {
  employeeId: null,
  managerId: 'user-manager',
  managerOfManagerId: null,
  hrAdminIds: ['user-rh'],
  itMemberIds: ['user-it'],
};

const DEFAULT_CHAINS: Record<string, readonly OwnerSlot[]> = {
  manager: ['manager', 'hr_admin'],
  it: ['it_team', 'hr_admin'],
  hr_admin: ['hr_admin'],
  employee: ['employee', 'manager'],
};

export function fakeAssignmentDirectory(
  overrides: Partial<AssignmentDirectory> = {},
  context: AssignmentContext = DEFAULT_CONTEXT,
  chains: Record<string, readonly OwnerSlot[]> = DEFAULT_CHAINS,
  absences: readonly Absence[] = [],
): AssignmentDirectory {
  return {
    fallbackChainFor: async (_companyId: string, role: OwnerRole) => chains[role] ?? [],
    contextFor: async () => context,
    absencesBetween: async () => absences,
    ...overrides,
  };
}
