import { describe, expect, it, vi } from 'vitest';
import { createResendMailer, type ResendLikeClient } from './mailer';

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
