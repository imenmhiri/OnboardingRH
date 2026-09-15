import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  comparePlainDates,
  differenceInCalendarDays,
  fromEpochDay,
  isValidPlainDate,
  parsePlainDate,
  toEpochDay,
  weekdayOf,
} from './plain-date';

describe('parsePlainDate', () => {
  it('accepte une date ISO valide', () => {
    expect(parsePlainDate('2026-03-02')).toBe('2026-03-02');
  });

  it('refuse un format non ISO', () => {
    expect(() => parsePlainDate('02/03/2026')).toThrow(RangeError);
    expect(() => parsePlainDate('2026-3-2')).toThrow(RangeError);
  });

  it('refuse un jour qui n existe pas', () => {
    expect(() => parsePlainDate('2026-02-30')).toThrow(/does not exist/);
    expect(() => parsePlainDate('2025-02-29')).toThrow(/does not exist/);
    expect(() => parsePlainDate('2026-13-01')).toThrow(RangeError);
  });

  it('accepte le 29 fevrier d une annee bissextile', () => {
    expect(isValidPlainDate('2028-02-29')).toBe(true);
    expect(isValidPlainDate('2000-02-29')).toBe(true);
    expect(isValidPlainDate('1900-02-29')).toBe(false);
  });
});

describe('conversion en jours epoch', () => {
  it('place le 1er janvier 1970 au jour zero', () => {
    expect(toEpochDay(parsePlainDate('1970-01-01'))).toBe(0);
    expect(fromEpochDay(0)).toBe('1970-01-01');
  });

  it('fait l aller-retour sur une plage de dates', () => {
    for (const iso of ['1999-12-31', '2000-01-01', '2026-03-02', '2100-02-28']) {
      const date = parsePlainDate(iso);
      expect(fromEpochDay(toEpochDay(date))).toBe(iso);
    }
  });
});

describe('weekdayOf', () => {
  it('nomme le jour de la semaine', () => {
    expect(weekdayOf(parsePlainDate('1970-01-01'))).toBe('thursday');
    expect(weekdayOf(parsePlainDate('2026-03-02'))).toBe('monday');
    expect(weekdayOf(parsePlainDate('2026-03-07'))).toBe('saturday');
    expect(weekdayOf(parsePlainDate('2026-03-08'))).toBe('sunday');
  });
});

describe('arithmetique calendaire', () => {
  it('franchit les fins de mois et les annees bissextiles', () => {
    expect(addCalendarDays(parsePlainDate('2026-02-28'), 1)).toBe('2026-03-01');
    expect(addCalendarDays(parsePlainDate('2028-02-28'), 1)).toBe('2028-02-29');
    expect(addCalendarDays(parsePlainDate('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addCalendarDays(parsePlainDate('2026-01-01'), -1)).toBe('2025-12-31');
  });

  it('compte les jours entre deux dates, signe compris', () => {
    const from = parsePlainDate('2026-03-02');
    const to = parsePlainDate('2026-03-09');
    expect(differenceInCalendarDays(from, to)).toBe(7);
    expect(differenceInCalendarDays(to, from)).toBe(-7);
    expect(comparePlainDates(from, to)).toBeLessThan(0);
    expect(comparePlainDates(from, from)).toBe(0);
  });
});
