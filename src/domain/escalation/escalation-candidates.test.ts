import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '../scheduling/plain-date';
import { createWorkingCalendar } from '../scheduling/working-calendar';
import { selectEscalationCandidates, type EscalationSource } from './escalation-candidates';

const d = parsePlainDate;

function task(overrides: Partial<EscalationSource['task']> & Pick<EscalationSource['task'], 'id'>) {
  return {
    journeyId: 'journey-1',
    title: `Tâche ${overrides.id}`,
    ownerRole: 'it' as const,
    ownerId: 'user-it',
    dependsOn: [],
    status: 'pending' as const,
    dueDate: d('2026-04-01'),
    expectedDocument: null,
    sharedKey: null,
    criticality: 'standard' as const,
    ...overrides,
  };
}

function source(overrides: Partial<EscalationSource> = {}): EscalationSource {
  return {
    task: task({ id: 't1' }),
    journeyStatus: 'active',
    criticality: 'standard',
    recipients: { ownerId: 'user-it', managerId: 'user-manager', hrAdminIds: ['user-rh'] },
    ...overrides,
  };
}

const calendar = createWorkingCalendar({ holidays: [d('2026-04-06')] });

describe('cas limite : tache bloquee par une autre', () => {
  it('ne genere une candidature que pour la cause racine actionnable, pas la victime', () => {
    const root = source({ task: task({ id: 'contract', dueDate: d('2026-03-20') }) });
    const victim = source({
      task: task({ id: 'it-account', dueDate: d('2026-03-25'), dependsOn: ['contract'] }),
      recipients: { ownerId: 'user-it', managerId: 'user-manager', hrAdminIds: ['user-rh'] },
    });

    const candidates = selectEscalationCandidates([root, victim], calendar, d('2026-04-10'), new Map());

    expect(candidates.map((c) => c.taskId)).toEqual(['contract']);
  });

  it('ne cree aucune candidature quand meme la cause racine n est pas en retard', () => {
    const root = source({ task: task({ id: 'contract', dueDate: d('2026-04-20') }) });
    const victim = source({ task: task({ id: 'it-account', dueDate: d('2026-04-21'), dependsOn: ['contract'] }) });

    const candidates = selectEscalationCandidates([root, victim], calendar, d('2026-04-10'), new Map());
    expect(candidates).toEqual([]);
  });

  it('remonte la victime des que la cause racine est soldee', () => {
    const root = source({ task: task({ id: 'contract', dueDate: d('2026-03-20'), status: 'done' }) });
    const victim = source({ task: task({ id: 'it-account', dueDate: d('2026-03-25'), dependsOn: ['contract'] }) });

    const candidates = selectEscalationCandidates([root, victim], calendar, d('2026-04-10'), new Map());
    expect(candidates.map((c) => c.taskId)).toEqual(['it-account']);
  });
});

describe('cas limite : tache annulee ou parcours interrompu', () => {
  it('n escalade jamais une tache annulee', () => {
    const candidates = selectEscalationCandidates(
      [source({ task: task({ id: 't1', dueDate: d('2026-03-01'), status: 'cancelled' }) })],
      calendar,
      d('2026-04-10'),
      new Map(),
    );
    expect(candidates).toEqual([]);
  });

  it('n escalade plus rien une fois le parcours interrompu, meme en retard', () => {
    const candidates = selectEscalationCandidates(
      [source({ task: task({ id: 't1', dueDate: d('2026-03-01') }), journeyStatus: 'interrupted' })],
      calendar,
      d('2026-04-10'),
      new Map(),
    );
    expect(candidates).toEqual([]);
  });

  it('n escalade pas une tache dont la dependance annulee levait le blocage', () => {
    const cancelled = source({ task: task({ id: 'contract', dueDate: d('2026-03-20'), status: 'cancelled' }) });
    const now_actionable = source({
      task: task({ id: 'it-account', dueDate: d('2026-03-25'), dependsOn: ['contract'] }),
    });

    const candidates = selectEscalationCandidates([cancelled, now_actionable], calendar, d('2026-04-10'), new Map());
    // Le contrat annule leve le blocage : it-account redevient actionnable et,
    // etant en retard, doit etre candidate.
    expect(candidates.map((c) => c.taskId)).toEqual(['it-account']);
  });
});

describe('cas limite : retard sur un pont ferie', () => {
  it('ne compte pas les jours feries comme du retard', () => {
    // Echeance vendredi 3 avril ; aujourd'hui mardi 7. Lundi 6 est ferie : un
    // seul jour ouvre de retard, pas deux jours calendaires.
    const local = createWorkingCalendar({ holidays: [d('2026-04-06')] });
    const candidates = selectEscalationCandidates(
      [source({ task: task({ id: 't1', dueDate: d('2026-04-03') }) })],
      local,
      d('2026-04-07'),
      new Map(),
    );
    expect(candidates[0]?.workingDaysLate).toBe(1);
  });
});

describe('assemblage general', () => {
  it('reporte la derniere relance depuis la carte fournie', () => {
    const candidates = selectEscalationCandidates(
      [source({ task: task({ id: 't1', dueDate: d('2026-04-01') }) })],
      calendar,
      d('2026-04-10'),
      new Map([['t1', d('2026-04-09')]]),
    );
    expect(candidates[0]?.lastReminderSentOn).toBe('2026-04-09');
  });

  it('ne casse pas sur un graphe invalide, et ne relance personne', () => {
    const candidates = selectEscalationCandidates(
      [source({ task: task({ id: 't1', dueDate: d('2026-03-01'), dependsOn: ['t1'] }) })],
      calendar,
      d('2026-04-10'),
      new Map(),
    );
    expect(candidates).toEqual([]);
  });
});
