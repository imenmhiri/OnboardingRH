import { describe, expect, it } from 'vitest';
import { parsePlainDate, type PlainDate } from './plain-date';
import {
  addWorkingDays,
  countWorkingDaysBetween,
  createWorkingCalendar,
  isWorkingDay,
  mergeHolidays,
  nextWorkingDay,
  previousWorkingDay,
  shiftToWorkingDay,
} from './working-calendar';

const d = (iso: string): PlainDate => parsePlainDate(iso);

// 2026-03-02 is a Monday; 2026-04-06 is Easter Monday in France.
const frenchCalendar = createWorkingCalendar({
  holidays: [d('2026-04-06'), d('2026-05-01'), d('2026-05-14')],
});

describe('createWorkingCalendar', () => {
  it('applique samedi et dimanche par defaut', () => {
    const calendar = createWorkingCalendar();
    expect(isWorkingDay(d('2026-03-06'), calendar)).toBe(true);
    expect(isWorkingDay(d('2026-03-07'), calendar)).toBe(false);
    expect(isWorkingDay(d('2026-03-08'), calendar)).toBe(false);
  });

  it('accepte un week-end different sans toucher au code', () => {
    const gulfCalendar = createWorkingCalendar({ weekend: ['friday', 'saturday'] });
    expect(isWorkingDay(d('2026-03-06'), gulfCalendar)).toBe(false);
    expect(isWorkingDay(d('2026-03-08'), gulfCalendar)).toBe(true);
  });

  it('refuse un calendrier sans aucun jour travaille', () => {
    expect(() =>
      createWorkingCalendar({
        weekend: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
      }),
    ).toThrow(RangeError);
  });
});

describe('mergeHolidays', () => {
  it('fusionne les feries societe et site sans doublon, triés', () => {
    const company = [d('2026-05-01'), d('2026-04-06')];
    const site = [d('2026-04-06'), d('2026-07-14')];
    expect(mergeHolidays(company, site)).toEqual(['2026-04-06', '2026-05-01', '2026-07-14']);
  });
});

describe('isWorkingDay', () => {
  it('exclut les week-ends et les jours feries configures', () => {
    expect(isWorkingDay(d('2026-04-03'), frenchCalendar)).toBe(true);
    expect(isWorkingDay(d('2026-04-04'), frenchCalendar)).toBe(false);
    expect(isWorkingDay(d('2026-04-06'), frenchCalendar)).toBe(false);
  });
});

describe('navigation entre jours ouvres', () => {
  it('saute le week-end', () => {
    expect(nextWorkingDay(d('2026-03-06'), frenchCalendar)).toBe('2026-03-09');
    expect(previousWorkingDay(d('2026-03-09'), frenchCalendar)).toBe('2026-03-06');
  });

  it('saute un pont ferie', () => {
    // Vendredi 3 avril -> lundi 6 ferie -> mardi 7.
    expect(nextWorkingDay(d('2026-04-03'), frenchCalendar)).toBe('2026-04-07');
  });

  it('normalise une date non travaillee dans la direction demandee', () => {
    expect(shiftToWorkingDay(d('2026-03-07'), frenchCalendar, 'forward')).toBe('2026-03-09');
    expect(shiftToWorkingDay(d('2026-03-07'), frenchCalendar, 'backward')).toBe('2026-03-06');
    expect(shiftToWorkingDay(d('2026-03-09'), frenchCalendar)).toBe('2026-03-09');
  });
});

describe('addWorkingDays', () => {
  it('ajoute des jours ouvres en ignorant week-ends et feries', () => {
    expect(addWorkingDays(d('2026-03-02'), 5, frenchCalendar)).toBe('2026-03-09');
    expect(addWorkingDays(d('2026-04-02'), 2, frenchCalendar)).toBe('2026-04-07');
  });

  it('recule pour un delai negatif', () => {
    expect(addWorkingDays(d('2026-03-09'), -5, frenchCalendar)).toBe('2026-03-02');
    expect(addWorkingDays(d('2026-04-07'), -2, frenchCalendar)).toBe('2026-04-02');
  });

  it('normalise au jour ouvre le plus proche pour un delai nul', () => {
    expect(addWorkingDays(d('2026-03-07'), 0, frenchCalendar)).toBe('2026-03-09');
    expect(addWorkingDays(d('2026-03-09'), 0, frenchCalendar)).toBe('2026-03-09');
  });

  it('est reversible depuis un jour ouvre', () => {
    const start = d('2026-03-02');
    for (const offset of [1, 3, 7, 20]) {
      expect(addWorkingDays(addWorkingDays(start, offset, frenchCalendar), -offset, frenchCalendar)).toBe(
        start,
      );
    }
  });

  it('refuse un delai non entier', () => {
    expect(() => addWorkingDays(d('2026-03-02'), 1.5, frenchCalendar)).toThrow(RangeError);
  });
});

describe('countWorkingDaysBetween', () => {
  it('compte de maniere coherente avec addWorkingDays', () => {
    const start = d('2026-03-02');
    const end = addWorkingDays(start, 7, frenchCalendar);
    expect(countWorkingDaysBetween(start, end, frenchCalendar)).toBe(7);
  });

  it('renvoie un compte negatif quand la cible precede l origine', () => {
    expect(countWorkingDaysBetween(d('2026-03-09'), d('2026-03-02'), frenchCalendar)).toBe(-5);
  });

  it('renvoie zero pour la meme date', () => {
    expect(countWorkingDaysBetween(d('2026-03-02'), d('2026-03-02'), frenchCalendar)).toBe(0);
  });

  it('ignore les jours feries de la periode', () => {
    // Du jeudi 2 au mardi 7 avril : vendredi 3 et mardi 7 ouvres, lundi 6 ferie.
    expect(countWorkingDaysBetween(d('2026-04-02'), d('2026-04-07'), frenchCalendar)).toBe(2);
  });
});
