import type { Calendar, CalendarEventInput, CalendarEventResult, CalendarVoidResult } from '@/application/ports/calendar';

/**
 * Sous-ensemble de `fetch` dont ce module a besoin. L'injecter plutôt que
 * d'appeler `fetch` en dur dans le port permet de le remplacer par un client
 * factice en test, sans jamais toucher au réseau ni exiger de jeton réel —
 * même principe que `ResendLikeClient` en T-24.
 */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface GoogleCalendarOptions {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly refreshToken: string;
  readonly calendarId: string;
  readonly fetchImpl?: FetchLike;
}

interface GoogleEventBody {
  readonly summary: string;
  readonly description: string;
  readonly start: { readonly dateTime: string; readonly timeZone: string };
  readonly end: { readonly dateTime: string; readonly timeZone: string };
  readonly attendees?: readonly { readonly email: string }[];
}

export function buildGoogleEventBody(input: CalendarEventInput): GoogleEventBody {
  return {
    summary: input.title,
    description: input.description,
    start: { dateTime: input.startsAt, timeZone: input.timeZone },
    end: { dateTime: input.endsAt, timeZone: input.timeZone },
    ...(input.attendeeEmails.length > 0
      ? { attendees: input.attendeeEmails.map((email) => ({ email })) }
      : {}),
  };
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3';

async function fetchAccessToken(options: GoogleCalendarOptions, fetchImpl: FetchLike): Promise<
  { readonly ok: true; readonly token: string } | { readonly ok: false; readonly detail: string }
> {
  try {
    const response = await fetchImpl(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: options.clientId,
        client_secret: options.clientSecret,
        refresh_token: options.refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
    const body = (await response.json()) as { access_token?: string; error?: string; error_description?: string };
    if (!response.ok || !body.access_token) {
      return { ok: false, detail: body.error_description ?? body.error ?? `HTTP ${response.status}` };
    }
    return { ok: true, token: body.access_token };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

async function callGoogle(
  fetchImpl: FetchLike,
  token: string,
  method: string,
  url: string,
  body?: unknown,
): Promise<{ readonly ok: true; readonly json: { id?: string } } | { readonly ok: false; readonly detail: string }> {
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 204) {
      return { ok: true, json: {} };
    }
    const json = (await response.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
    if (!response.ok) {
      return { ok: false, detail: json.error?.message ?? `HTTP ${response.status}` };
    }
    return { ok: true, json };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Implémentation réelle de l'API REST Google Calendar (OAuth2 par jeton de
 * rafraîchissement — un compte de service dédié au calendrier de la société,
 * pas le compte personnel d'un employé). Un jeton d'accès est demandé à
 * chaque appel plutôt que mis en cache : le volume (quelques évènements par
 * arrivée) ne justifie pas la complexité d'un cache à invalider, et ça garde
 * l'implémentation sans état entre deux requêtes HTTP Next.js.
 */
export function createGoogleCalendar(options: GoogleCalendarOptions): Calendar {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = `${EVENTS_ENDPOINT}/calendars/${encodeURIComponent(options.calendarId)}/events`;

  async function withToken<T>(
    run: (token: string) => Promise<T>,
    onTokenFailure: (detail: string) => T,
  ): Promise<T> {
    const token = await fetchAccessToken(options, fetchImpl);
    if (!token.ok) {
      return onTokenFailure(token.detail);
    }
    return run(token.token);
  }

  return {
    async createEvent(input: CalendarEventInput): Promise<CalendarEventResult> {
      return withToken(
        async (token) => {
          const result = await callGoogle(fetchImpl, token, 'POST', baseUrl, buildGoogleEventBody(input));
          if (!result.ok) {
            return { ok: false, reason: 'provider_error', detail: result.detail };
          }
          if (!result.json.id) {
            return { ok: false, reason: 'provider_error', detail: 'Reponse Google sans identifiant d\'evenement.' };
          }
          return { ok: true, externalEventId: result.json.id };
        },
        (detail) => ({ ok: false, reason: 'provider_error', detail }),
      );
    },

    async updateEvent(externalEventId: string, input: CalendarEventInput): Promise<CalendarEventResult> {
      return withToken(
        async (token) => {
          const url = `${baseUrl}/${encodeURIComponent(externalEventId)}`;
          const result = await callGoogle(fetchImpl, token, 'PATCH', url, buildGoogleEventBody(input));
          if (!result.ok) {
            return { ok: false, reason: 'provider_error', detail: result.detail };
          }
          return { ok: true, externalEventId: result.json.id ?? externalEventId };
        },
        (detail) => ({ ok: false, reason: 'provider_error', detail }),
      );
    },

    async cancelEvent(externalEventId: string): Promise<CalendarVoidResult> {
      return withToken(
        async (token) => {
          const url = `${baseUrl}/${encodeURIComponent(externalEventId)}`;
          const result = await callGoogle(fetchImpl, token, 'DELETE', url);
          if (!result.ok) {
            return { ok: false, reason: 'provider_error', detail: result.detail };
          }
          return { ok: true };
        },
        (detail) => ({ ok: false, reason: 'provider_error', detail }),
      );
    },
  };
}

/**
 * Calendrier de repli quand les identifiants Google manquent : chaque appel
 * échoue proprement en `provider_error`, jamais par une exception. C'est ce
 * qui permet à `createFirstWeekCalendarEvents` de tracer l'échec dans
 * `audit_events` et de continuer — la création du parcours (W1) ne doit
 * jamais échouer faute d'agenda configuré, ni le portail employé dépendre
 * d'un appel Google réussi pour s'afficher (voir la DoD du ticket).
 */
function createUnconfiguredCalendar(missing: readonly string[]): Calendar {
  const detail = `Agenda non configure — variable(s) manquante(s) : ${missing.join(', ')}.`;
  return {
    async createEvent() {
      return { ok: false, reason: 'provider_error', detail };
    },
    async updateEvent() {
      return { ok: false, reason: 'provider_error', detail };
    },
    async cancelEvent() {
      return { ok: false, reason: 'provider_error', detail };
    },
  };
}

/**
 * Lit les identifiants depuis l'environnement — jamais en dur dans le dépôt.
 * Une variable manquante ne fait pas échouer tôt l'appelant : elle renvoie un
 * calendrier de repli qui échoue proprement à chaque appel, tracé comme
 * n'importe quelle panne du fournisseur. La création du parcours (W1) ne
 * dépend jamais de l'agenda. `createResendMailerFromEnv` (T-24) suivait à
 * l'origine une règle différente (échec immédiat) ; l'incohérence a provoqué
 * un vrai 500 en production (T-27, W2/W3 sans clé Resend) et a été corrigée
 * pour suivre exactement cette même discipline.
 */
export function createGoogleCalendarFromEnv(): Calendar {
  const clientId = process.env['GOOGLE_CALENDAR_CLIENT_ID'];
  const clientSecret = process.env['GOOGLE_CALENDAR_CLIENT_SECRET'];
  const refreshToken = process.env['GOOGLE_CALENDAR_REFRESH_TOKEN'];
  const calendarId = process.env['GOOGLE_CALENDAR_CALENDAR_ID'];

  const missing = (
    [
      ['GOOGLE_CALENDAR_CLIENT_ID', clientId],
      ['GOOGLE_CALENDAR_CLIENT_SECRET', clientSecret],
      ['GOOGLE_CALENDAR_REFRESH_TOKEN', refreshToken],
      ['GOOGLE_CALENDAR_CALENDAR_ID', calendarId],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    return createUnconfiguredCalendar(missing);
  }

  return createGoogleCalendar({
    clientId: clientId as string,
    clientSecret: clientSecret as string,
    refreshToken: refreshToken as string,
    calendarId: calendarId as string,
  });
}
