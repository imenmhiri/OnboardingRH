import { describe, expect, it } from 'vitest';
import { parsePlainDate } from './plain-date';
import { eventWindowFor } from './event-window';

describe('eventWindowFor', () => {
  it('builds a fixed one-hour local slot for the given date', () => {
    expect(eventWindowFor(parsePlainDate('2026-09-21'))).toEqual({
      startsAt: '2026-09-21T09:00:00',
      endsAt: '2026-09-21T10:00:00',
    });
  });

  it('is deterministic across calls for the same date', () => {
    const date = parsePlainDate('2026-03-02');
    expect(eventWindowFor(date)).toEqual(eventWindowFor(date));
  });
});
