import { describe, expect, it } from 'vitest';
import { parsePlainDate } from './plain-date';
import { firstWeekEnd, isWithinFirstWeek } from './first-week';

describe('isWithinFirstWeek', () => {
  const arrival = parsePlainDate('2026-09-21');

  it('includes the arrival date itself', () => {
    expect(isWithinFirstWeek(arrival, arrival)).toBe(true);
  });

  it('includes the last day of the window', () => {
    expect(isWithinFirstWeek(firstWeekEnd(arrival), arrival)).toBe(true);
  });

  it('excludes a date the day after the window', () => {
    expect(isWithinFirstWeek(parsePlainDate('2026-09-29'), arrival)).toBe(false);
  });

  it('excludes a date before the arrival', () => {
    expect(isWithinFirstWeek(parsePlainDate('2026-09-18'), arrival)).toBe(false);
  });
});
