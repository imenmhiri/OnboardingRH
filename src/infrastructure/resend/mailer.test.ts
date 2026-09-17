import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResendMailer, createResendMailerFromEnv, type ResendLikeClient } from './mailer';

type SendReturn = ReturnType<ResendLikeClient['emails']['send']>;

function fakeClient(behaviour: () => SendReturn): ResendLikeClient {
  return { emails: { send: vi.fn(behaviour) } };
}

describe('createResendMailer', () => {
  it('renvoie un succes avec l identifiant du message', async () => {
    const client = fakeClient(() => Promise.resolve({ data: { id: 'msg-1' }, error: null }));
    const mailer = createResendMailer(client, 'onboarding@atelier-nord.demo');

    const result = await mailer.send({
      to: { email: 'alice@perso.example' },
      subject: 'Bienvenue',
      html: '<p>Bienvenue</p>',
      text: 'Bienvenue',
    });

    expect(result).toEqual({ ok: true, messageId: 'msg-1' });
    expect(client.emails.send).toHaveBeenCalledWith(
      expect.objectContaining({ from: 'onboarding@atelier-nord.demo', to: ['alice@perso.example'] }),
    );
  });

  it('cas limite : adresse invalide ou rejetee, l echec est explicite et non avale', async () => {
    const client = fakeClient(() =>
      Promise.resolve({ data: null, error: { message: 'Invalid `to` field', name: 'validation_error' } }),
    );
    const mailer = createResendMailer(client, 'onboarding@atelier-nord.demo');

    const result = await mailer.send({
      to: { email: 'pas-une-adresse' },
      subject: 'Bienvenue',
      html: '<p>Bienvenue</p>',
      text: 'Bienvenue',
    });

    expect(result).toEqual({ ok: false, reason: 'invalid_recipient', detail: 'Invalid `to` field' });
  });

  it('distingue une panne du fournisseur d une adresse invalide', async () => {
    const client = fakeClient(() =>
      Promise.resolve({ data: null, error: { message: 'Internal error', name: 'internal_server_error' } }),
    );
    const mailer = createResendMailer(client, 'onboarding@atelier-nord.demo');

    const result = await mailer.send({
      to: { email: 'alice@perso.example' },
      subject: 'Bienvenue',
      html: '<p>Bienvenue</p>',
      text: 'Bienvenue',
    });

    expect(result).toEqual({ ok: false, reason: 'provider_error', detail: 'Internal error' });
  });

  it('defaut reel decouvert en verification T-24 : une cle d API invalide (401) porte le meme nom d erreur que Resend utilise pour une adresse malformee ("validation_error") — le statusCode doit trancher plutot que le nom seul', async () => {
    const client = fakeClient(() =>
      Promise.resolve({ data: null, error: { message: 'API key is invalid', name: 'validation_error', statusCode: 401 } }),
    );
    const mailer = createResendMailer(client, 'onboarding@atelier-nord.demo');

    const result = await mailer.send({
      to: { email: 'alice@perso.example' },
      subject: 'Bienvenue',
      html: '<p>Bienvenue</p>',
      text: 'Bienvenue',
    });

    expect(result).toEqual({ ok: false, reason: 'provider_error', detail: 'API key is invalid' });
  });

  it('capture une exception reseau au lieu de la laisser remonter sans contexte', async () => {
    const client: ResendLikeClient = { emails: { send: vi.fn(() => Promise.reject(new Error('fetch failed'))) } };
    const mailer = createResendMailer(client, 'onboarding@atelier-nord.demo');

    const result = await mailer.send({
      to: { email: 'alice@perso.example' },
      subject: 'Bienvenue',
      html: '<p>Bienvenue</p>',
      text: 'Bienvenue',
    });

    expect(result).toEqual({ ok: false, reason: 'provider_error', detail: 'fetch failed' });
  });
});

describe('createResendMailerFromEnv', () => {
  const ENV_KEYS = ['RESEND_API_KEY', 'RESEND_FROM'] as const;
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

  it(
    'defaut reel constate en production (T-27) : sans RESEND_API_KEY/RESEND_FROM, ' +
      'la fabrique lancait une exception non attrapee — un webhook comme W2/W3 renvoyait ' +
      '500 au lieu d un JSON avec une erreur typee. Elle degrade desormais proprement, ' +
      'meme discipline que createUnconfiguredCalendar (T-25)',
    async () => {
      const mailer = createResendMailerFromEnv();
      const result = await mailer.send({
        to: { email: 'alice@perso.example' },
        subject: 'Bienvenue',
        html: '<p>Bienvenue</p>',
        text: 'Bienvenue',
      });
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.reason).toBe('provider_error');
      expect(result.ok === false && result.detail).toContain('RESEND_API_KEY');
    },
  );
});
