import { describe, expect, it } from 'vitest';
import { differenceInCalendarDays, parsePlainDate, type PlainDate } from './plain-date';
import { createWorkingCalendar } from './working-calendar';
import {
  computeDueDate,
  type Deadline,
  type DeadlineRule,
  hasMoved,
  isOverdue,
  rescheduleForArrivalDate,
  scheduleDeadlines,
  workingDaysLate,
} from './due-date';

const d = (iso: string): PlainDate => parsePlainDate(iso);

const calendar = createWorkingCalendar({
  holidays: [d('2026-04-06'), d('2026-05-01'), d('2026-05-14')],
});

// Un parcours minimal : compte IT avant l'arrivee, materiel le jour J,
// point de fin de premiere semaine.
const rules: readonly DeadlineRule[] = [
  { taskId: 'it-account', offsetInWorkingDays: -2 },
  { taskId: 'equipment-handover', offsetInWorkingDays: 0 },
  { taskId: 'week-one-review', offsetInWorkingDays: 5 },
];

describe('computeDueDate', () => {
  it('place une echeance anterieure a l arrivee en jours ouvres', () => {
    expect(computeDueDate(d('2026-03-02'), -2, calendar)).toBe('2026-02-26');
  });

  it('place l echeance du jour J sur l arrivee elle-meme', () => {
    expect(computeDueDate(d('2026-03-02'), 0, calendar)).toBe('2026-03-02');
  });

  it('traverse un jour ferie sans le compter', () => {
    // Arrivee le jeudi 2 avril, +2 ouvres : vendredi 3, lundi 6 ferie, mardi 7.
    expect(computeDueDate(d('2026-04-02'), 2, calendar)).toBe('2026-04-07');
  });
});

describe('scheduleDeadlines', () => {
  it('instancie toutes les echeances du parcours', () => {
    expect(scheduleDeadlines(rules, d('2026-03-02'), calendar)).toEqual([
      { taskId: 'it-account', dueDate: '2026-02-26' },
      { taskId: 'equipment-handover', dueDate: '2026-03-02' },
      { taskId: 'week-one-review', dueDate: '2026-03-09' },
    ]);
  });
});

describe('cas limite : date d arrivee reportee', () => {
  it('recalcule l ensemble des echeances depuis la nouvelle arrivee', () => {
    const initial = scheduleDeadlines(rules, d('2026-03-02'), calendar);
    const changes = rescheduleForArrivalDate(rules, initial, d('2026-04-02'), calendar);

    expect(changes).toEqual([
      { taskId: 'it-account', dueDate: '2026-03-31', previousDueDate: '2026-02-26', shiftedByWorkingDays: 23 },
      { taskId: 'equipment-handover', dueDate: '2026-04-02', previousDueDate: '2026-03-02', shiftedByWorkingDays: 23 },
      { taskId: 'week-one-review', dueDate: '2026-04-10', previousDueDate: '2026-03-09', shiftedByWorkingDays: 23 },
    ]);
    expect(changes.every(hasMoved)).toBe(true);
  });

  it('recalcule au lieu de translater : le report calendaire de l arrivee n est pas celui des echeances', () => {
    const initial = scheduleDeadlines(rules, d('2026-04-03'), calendar);
    const changes = rescheduleForArrivalDate(rules, initial, d('2026-04-07'), calendar);
    const weekOne = changes.find((change) => change.taskId === 'week-one-review');

    // L'arrivee glisse de 4 jours calendaires (week-end + lundi de Paques),
    // mais le point de fin de premiere semaine, deja au-dela du ferie, ne
    // glisse que d'un jour : translater les echeances serait faux.
    expect(differenceInCalendarDays(d('2026-04-03'), d('2026-04-07'))).toBe(4);
    expect(weekOne?.previousDueDate).toBe('2026-04-13');
    expect(weekOne?.dueDate).toBe('2026-04-14');
    expect(differenceInCalendarDays(d('2026-04-13'), d('2026-04-14'))).toBe(1);
    expect(weekOne?.shiftedByWorkingDays).toBe(1);
  });

  it('avance aussi les echeances quand l arrivee est anticipee', () => {
    const initial = scheduleDeadlines(rules, d('2026-03-09'), calendar);
    const changes = rescheduleForArrivalDate(rules, initial, d('2026-03-02'), calendar);
    expect(changes.map((change) => change.shiftedByWorkingDays)).toEqual([-5, -5, -5]);
  });

  it('accepte une tache ajoutee au parcours apres coup', () => {
    const initial: readonly Deadline[] = [{ taskId: 'it-account', dueDate: '2026-02-26' as PlainDate }];
    const changes = rescheduleForArrivalDate(rules, initial, d('2026-03-02'), calendar);
    const added = changes.find((change) => change.taskId === 'week-one-review');

    expect(added?.previousDueDate).toBeNull();
    expect(added?.shiftedByWorkingDays).toBe(0);
    expect(added ? hasMoved(added) : true).toBe(false);
  });
});

describe('retard', () => {
  it('ne compte aucun retard avant ou le jour de l echeance', () => {
    expect(workingDaysLate(d('2026-03-09'), d('2026-03-06'), calendar)).toBe(0);
    expect(workingDaysLate(d('2026-03-09'), d('2026-03-09'), calendar)).toBe(0);
    expect(isOverdue(d('2026-03-09'), d('2026-03-09'), calendar)).toBe(false);
  });

  it('compte le retard en jours ouvres, week-end exclu', () => {
    // Echeance vendredi 6, on est lundi 9 : un seul jour ouvre de retard.
    expect(workingDaysLate(d('2026-03-06'), d('2026-03-09'), calendar)).toBe(1);
    expect(isOverdue(d('2026-03-06'), d('2026-03-09'), calendar)).toBe(true);
  });

  it('ne compte pas un jour ferie comme un jour de retard', () => {
    // Echeance vendredi 3 avril, on est mardi 7 : lundi 6 ferie ne compte pas.
    expect(workingDaysLate(d('2026-04-03'), d('2026-04-07'), calendar)).toBe(1);
  });
});
