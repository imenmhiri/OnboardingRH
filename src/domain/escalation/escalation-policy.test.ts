import { describe, expect, it } from 'vitest';
import { parsePlainDate } from '../scheduling/plain-date';
import { decideEscalation, type EscalationCandidateInput, type EscalationPolicy } from './escalation-policy';

const d = parsePlainDate;

const policy: EscalationPolicy = {
  companyId: 'company-1',
  standard: [
    { afterWorkingDaysLate: 1, recipient: 'owner' },
    { afterWorkingDaysLate: 3, recipient: 'manager' },
    { afterWorkingDaysLate: 6, recipient: 'hr_admin' },
  ],
  critical: [
    { afterWorkingDaysLate: 1, recipient: 'manager' },
    { afterWorkingDaysLate: 2, recipient: 'hr_admin' },
  ],
};

function candidate(overrides: Partial<EscalationCandidateInput> = {}): EscalationCandidateInput {
  return {
    taskId: 't1',
    title: 'Créer le compte IT',
    workingDaysLate: 1,
    criticality: 'standard',
    recipients: { ownerId: 'user-owner', managerId: 'user-manager', hrAdminIds: ['user-rh'] },
    lastReminderSentOn: null,
    ...overrides,
  };
}

describe('decideEscalation', () => {
  it('ne relance rien tant que la tache n est pas en retard', () => {
    const result = decideEscalation(policy, candidate({ workingDaysLate: 0 }), d('2026-04-10'));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('not_late');
  });

  it('relance le proprietaire au premier seuil', () => {
    const result = decideEscalation(policy, candidate({ workingDaysLate: 1 }), d('2026-04-10'));
    expect(result.ok).toBe(true);
    expect(result.ok && result.decision.recipientId).toBe('user-owner');
    expect(result.ok && result.decision.level.recipient).toBe('owner');
  });

  it('escalade au manager passe le deuxieme seuil', () => {
    const result = decideEscalation(policy, candidate({ workingDaysLate: 3 }), d('2026-04-10'));
    expect(result.ok && result.decision.recipientId).toBe('user-manager');
  });

  it('escalade a la RH passe le troisieme seuil', () => {
    const result = decideEscalation(policy, candidate({ workingDaysLate: 8 }), d('2026-04-10'));
    expect(result.ok && result.decision.recipientId).toBe('user-rh');
  });

  it('prend le niveau le plus eleve atteint, pas le premier', () => {
    // 4 jours de retard : seuils 1 et 3 atteints, pas 6. Le plus haut est 3 (manager).
    const result = decideEscalation(policy, candidate({ workingDaysLate: 4 }), d('2026-04-10'));
    expect(result.ok && result.decision.level.afterWorkingDaysLate).toBe(3);
  });

  it('une tache critique escalade plus vite qu une tache standard', () => {
    const standard = decideEscalation(policy, candidate({ workingDaysLate: 1, criticality: 'standard' }), d('2026-04-10'));
    const critical = decideEscalation(policy, candidate({ workingDaysLate: 1, criticality: 'critical' }), d('2026-04-10'));

    expect(standard.ok && standard.decision.level.recipient).toBe('owner');
    expect(critical.ok && critical.decision.level.recipient).toBe('manager');
  });

  it('signale un destinataire non resolu plutot que d inventer quelqu un', () => {
    const result = decideEscalation(
      policy,
      candidate({ workingDaysLate: 8, recipients: { ownerId: null, managerId: null, hrAdminIds: [] } }),
      d('2026-04-10'),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal).toEqual({ code: 'recipient_unresolved', recipient: 'hr_admin' });
  });

  it('designe toujours la meme RH parmi plusieurs, sans dependre de l ordre', () => {
    const a = decideEscalation(
      policy,
      candidate({ workingDaysLate: 8, recipients: { ownerId: null, managerId: null, hrAdminIds: ['user-rh-b', 'user-rh-a'] } }),
      d('2026-04-10'),
    );
    const b = decideEscalation(
      policy,
      candidate({ workingDaysLate: 8, recipients: { ownerId: null, managerId: null, hrAdminIds: ['user-rh-a', 'user-rh-b'] } }),
      d('2026-04-10'),
    );
    expect(a.ok && a.decision.recipientId).toBe(b.ok && b.decision.recipientId);
  });
});

describe('garde anti-harcelement : une relance par tache et par jour ouvre', () => {
  it('refuse une deuxieme relance le meme jour', () => {
    const result = decideEscalation(
      policy,
      candidate({ workingDaysLate: 1, lastReminderSentOn: d('2026-04-10') }),
      d('2026-04-10'),
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('already_reminded_today');
  });

  it('autorise une nouvelle relance le jour ouvre suivant', () => {
    const result = decideEscalation(
      policy,
      candidate({ workingDaysLate: 2, lastReminderSentOn: d('2026-04-10') }),
      d('2026-04-13'),
    );
    expect(result.ok).toBe(true);
  });

  it('refuse la garde meme quand un niveau plus haut serait atteint le meme jour', () => {
    const result = decideEscalation(
      policy,
      candidate({ workingDaysLate: 8, lastReminderSentOn: d('2026-04-10') }),
      d('2026-04-10'),
    );
    expect(!result.ok && result.refusal.code).toBe('already_reminded_today');
  });
});
