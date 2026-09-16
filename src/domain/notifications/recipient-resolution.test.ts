import { describe, expect, it } from 'vitest';
import { resolveRecipient } from './recipient-resolution';

describe('resolveRecipient', () => {
  it('choisit l email personnel quand il existe', () => {
    const result = resolveRecipient({
      personalEmail: 'alice@perso.example',
      professionalEmail: 'alice@atelier-nord.demo',
      managerEmail: 'manager@atelier-nord.demo',
    });
    expect(result).toEqual({ ok: true, channel: 'personal', email: 'alice@perso.example' });
  });

  it('cas limite : employe sans email personnel, bascule sur l adresse professionnelle', () => {
    const result = resolveRecipient({
      personalEmail: null,
      professionalEmail: 'alice@atelier-nord.demo',
      managerEmail: 'manager@atelier-nord.demo',
    });
    expect(result).toEqual({ ok: true, channel: 'professional', email: 'alice@atelier-nord.demo' });
  });

  it('bascule sur le manager quand ni l email personnel ni le professionnel n existent', () => {
    const result = resolveRecipient({
      personalEmail: null,
      professionalEmail: null,
      managerEmail: 'manager@atelier-nord.demo',
    });
    expect(result).toEqual({ ok: true, channel: 'manager', email: 'manager@atelier-nord.demo' });
  });

  it('echoue explicitement plutot que d abandonner en silence quand aucun canal n est joignable', () => {
    const result = resolveRecipient({ personalEmail: null, professionalEmail: null, managerEmail: null });
    expect(result).toEqual({ ok: false, reason: 'no_channel_available' });
  });

  it('ignore une chaine vide comme si l adresse etait absente', () => {
    const result = resolveRecipient({ personalEmail: '', professionalEmail: '', managerEmail: 'manager@atelier-nord.demo' });
    expect(result).toEqual({ ok: true, channel: 'manager', email: 'manager@atelier-nord.demo' });
  });
});
