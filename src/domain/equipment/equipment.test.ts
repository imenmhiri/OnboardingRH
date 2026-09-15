import { describe, expect, it } from 'vitest';
import {
  blocksDependentTask,
  canTransitionEquipment,
  type EquipmentRequest,
  isAwaitingAcknowledgement,
  isReclaim,
  isSettled,
  transitionEquipment,
} from './equipment';

function request(overrides: Partial<EquipmentRequest> & Pick<EquipmentRequest, 'status'>): EquipmentRequest {
  return {
    id: 'req-1',
    companyId: 'company-1',
    journeyId: 'journey-1',
    taskId: 'task-welcome',
    catalogItemId: 'laptop-standard',
    ...overrides,
  };
}

describe('canTransitionEquipment', () => {
  it('autorise le cycle de vie normal', () => {
    expect(canTransitionEquipment('requested', 'ordered')).toBe(true);
    expect(canTransitionEquipment('ordered', 'assigned')).toBe(true);
    expect(canTransitionEquipment('assigned', 'handed_over')).toBe(true);
    expect(canTransitionEquipment('handed_over', 'acknowledged')).toBe(true);
    expect(canTransitionEquipment('acknowledged', 'returned')).toBe(true);
  });

  it('rend restitue et annule terminaux', () => {
    expect(canTransitionEquipment('returned', 'assigned')).toBe(false);
    expect(canTransitionEquipment('cancelled', 'requested')).toBe(false);
  });

  it('interdit de sauter une etape', () => {
    expect(canTransitionEquipment('requested', 'assigned')).toBe(false);
    expect(canTransitionEquipment('ordered', 'handed_over')).toBe(false);
  });
});

describe('transitionEquipment', () => {
  it('renvoie la demande mise a jour sans muter l originale', () => {
    const original = request({ status: 'requested' });
    const result = transitionEquipment(original, 'ordered');

    expect(result.ok).toBe(true);
    expect(result.ok && result.request.status).toBe('ordered');
    expect(original.status).toBe('requested');
  });

  it('refuse une transition vers le meme statut, avec un motif', () => {
    const result = transitionEquipment(request({ status: 'ordered' }), 'ordered');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.refusal.code).toBe('same_status');
  });

  it('refuse de sortir d un statut terminal, avec un motif', () => {
    const result = transitionEquipment(request({ status: 'returned' }), 'assigned');
    expect(!result.ok && result.refusal).toEqual({ code: 'terminal_status', from: 'returned' });
  });

  it('refuse une transition illegale, avec la paire en cause', () => {
    const result = transitionEquipment(request({ status: 'requested' }), 'handed_over');
    expect(!result.ok && result.refusal).toEqual({
      code: 'illegal_transition',
      from: 'requested',
      to: 'handed_over',
    });
  });
});

describe('cas limite : materiel attribue puis repris avant l arrivee', () => {
  it('autorise le retour a requested depuis assigned', () => {
    const result = transitionEquipment(request({ status: 'assigned' }), 'requested');
    expect(result.ok).toBe(true);
    expect(result.ok && result.request.status).toBe('requested');
  });

  it('distingue la reprise d une simple annulation', () => {
    expect(isReclaim('assigned', 'requested')).toBe(true);
    expect(isReclaim('assigned', 'cancelled')).toBe(false);
    expect(isReclaim('requested', 'ordered')).toBe(false);
  });

  it('un materiel repris redevient normalement affectable', () => {
    const reclaimed = transitionEquipment(request({ status: 'assigned' }), 'requested');
    const reassigned =
      reclaimed.ok && transitionEquipment(reclaimed.request, 'ordered');
    expect(reassigned && reassigned.ok).toBe(true);
  });
});

describe('cas limite : accuse de reception jamais signe', () => {
  it('une remise sans accuse reste ouverte', () => {
    const handedOver = request({ status: 'handed_over' });
    expect(isAwaitingAcknowledgement(handedOver)).toBe(true);
    expect(isSettled(handedOver.status)).toBe(false);
  });

  it('la demande bloque la tache tant qu elle n est pas reglee', () => {
    expect(blocksDependentTask(request({ status: 'handed_over' }))).toBe(true);
    expect(blocksDependentTask(request({ status: 'acknowledged' }))).toBe(false);
  });

  it('une demande sans tache liee ne bloque jamais rien', () => {
    expect(blocksDependentTask(request({ status: 'handed_over', taskId: null }))).toBe(false);
  });

  it('une demande annulee ne bloque plus, meme jamais accusee', () => {
    expect(blocksDependentTask(request({ status: 'cancelled' }))).toBe(false);
    expect(isAwaitingAcknowledgement(request({ status: 'cancelled' }))).toBe(false);
  });

  it('cesse d attendre un accuse une fois la remise confirmee', () => {
    expect(isAwaitingAcknowledgement(request({ status: 'acknowledged' }))).toBe(false);
  });
});
