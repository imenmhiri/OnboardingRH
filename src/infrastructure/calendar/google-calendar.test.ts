import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildGoogleEventBody, createGoogleCalendar, createGoogleCalendarFromEnv, type FetchLike } from './google-calendar';
import type { CalendarEventInput } from '@/application/ports/calendar';

const INPUT: CalendarEventInput = {
  title: 'Créer le compte IT',
  description: 'Étape d\'intégration — voir le portail employé pour le détail.',
  startsAt: '2026-09-21T09:00:00',
  endsAt: '2026-09-21T10:00:00',
  timeZone: 'Europe/Paris',
  attendeeEmails: ['it@atelier-nord.demo'],
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('buildGoogleEventBody', () => {
  it('carries only the generic title and description, never invents new copy', () => {
    const body = buildGoogleEventBody(INPUT);
    expect(body.summary).toBe(INPUT.title);
    expect(body.description).toBe(INPUT.description);
    expect(body.start).toEqual({ dateTime: INPUT.startsAt, timeZone: INPUT.timeZone });
    expect(body.attendees).toEqual([{ email: 'it@atelier-nord.demo' }]);
  });

  it('omits attendees entirely when none could be resolved', () => {
    const body = buildGoogleEventBody({ ...INPUT, attendeeEmails: [] });
    expect(body.attendees).toBeUndefined();
  });
});

describe('createGoogleCalendar', () => {
  function fakeFetch(handlers: { token?: Response; event?: Response }): FetchLike {
    return vi.fn(async (url: string) => {
      if (url.includes('oauth2.googleapis.com')) {
        return handlers.token ?? jsonResponse(200, { access_token: 'fake-token' });
      }
      return handlers.event ?? jsonResponse(200, { id: 'evt-1' });
    });
  }

  it('exchanges the refresh token then creates the event with the resolved access token', async () => {
    const fetchImpl = fakeFetch({});
    const calendar = createGoogleCalendar({
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'refresh',
      calendarId: 'cal-1',
      fetchImpl,
    });

    const result = await calendar.createEvent(INPUT);

    expect(result).toEqual({ ok: true, externalEventId: 'evt-1' });
    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls[0]?.[0]).toBe('https://oauth2.googleapis.com/token');
    const eventCall = calls[1];
    expect(eventCall?.[0]).toBe('https://www.googleapis.com/calendar/v3/calendars/cal-1/events');
    const eventInit = eventCall?.[1] as RequestInit;
    expect(eventInit.method).toBe('POST');
    expect((eventInit.headers as Record<string, string>)['authorization']).toBe('Bearer fake-token');
  });

  it('reports a provider_error, never throwing, when the refresh token is rejected', async () => {
    const fetchImpl = fakeFetch({
      token: jsonResponse(400, { error: 'invalid_grant', error_description: 'Bad Request' }),
    });
    const calendar = createGoogleCalendar({
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'refresh',
      calendarId: 'cal-1',
      fetchImpl,
    });

    const result = await calendar.createEvent(INPUT);

    expect(result).toEqual({ ok: false, reason: 'provider_error', detail: 'Bad Request' });
  });

  it('moves an event with PATCH on its own id, never creating a new one', async () => {
    const fetchImpl = fakeFetch({ event: jsonResponse(200, { id: 'evt-1' }) });
    const calendar = createGoogleCalendar({
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'refresh',
      calendarId: 'cal-1',
      fetchImpl,
    });

    const result = await calendar.updateEvent('evt-1', { ...INPUT, startsAt: '2026-09-28T09:00:00', endsAt: '2026-09-28T10:00:00' });

    expect(result).toEqual({ ok: true, externalEventId: 'evt-1' });
    const calls = (fetchImpl as ReturnType<typeof vi.fn>).mock.calls;
    const eventCall = calls[1];
    expect(eventCall?.[0]).toBe('https://www.googleapis.com/calendar/v3/calendars/cal-1/events/evt-1');
    expect((eventCall?.[1] as RequestInit).method).toBe('PATCH');
  });

  it('cancels an event with DELETE and treats a 204 as success', async () => {
    const fetchImpl = fakeFetch({ event: new Response(null, { status: 204 }) });
    const calendar = createGoogleCalendar({
      clientId: 'id',
      clientSecret: 'secret',
      refreshToken: 'refresh',
      calendarId: 'cal-1',
      fetchImpl,
    });

    const result = await calendar.cancelEvent('evt-1');

    expect(result).toEqual({ ok: true });
  });
});

describe('createGoogleCalendarFromEnv', () => {
  const ENV_KEYS = [
    'GOOGLE_CALENDAR_CLIENT_ID',
    'GOOGLE_CALENDAR_CLIENT_SECRET',
    'GOOGLE_CALENDAR_REFRESH_TOKEN',
    'GOOGLE_CALENDAR_CALENDAR_ID',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] !== undefined) process.env[key] = saved[key];
      else delete process.env[key];
    }
  });

  it('returns a degraded calendar (never throws) when credentials are missing', async () => {
    const calendar = createGoogleCalendarFromEnv();
    const result = await calendar.createEvent(INPUT);
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('provider_error');
  });
});
