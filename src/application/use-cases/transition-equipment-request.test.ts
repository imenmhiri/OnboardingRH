import { describe, expect, it } from 'vitest';
import { transitionEquipmentRequest } from './transition-equipment-request';
import { equipmentRequestRecord, fakeAudit, fakeEquipmentRepository } from './equipment-test-fixtures';

describe('transitionEquipmentRequest', () => {
  it('refuse une demande introuvable', async () => {
    const { repository } = fakeEquipmentRepository();
    const { audit } = fakeAudit();

    const result = await transitionEquipmentRequest(
      { repository, audit },
      { requestId: 'unknown', to: 'ordered', actorId: 'user-it' },
    );

    expect(result).toEqual({ ok: false, reason: 'not_found' });
  });

  it('refuse une transition illegale et ne touche pas au dossier', async () => {
    const seed = equipmentRequestRecord({ id: 'equip-1', status: 'requested' });
    const { repository, records } = fakeEquipmentRepository([seed]);
    const { audit, events } = fakeAudit();

    // requested -> assigned saute l'etape "commande", interdite par le domaine.
    const result = await transitionEquipmentRequest(
      { repository, audit },
      { requestId: 'equip-1', to: 'assigned', actorId: 'user-it', unitReference: 'SN-001' },
    );

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toBe('refused');
    expect(records.get('equip-1')?.status).toBe('requested');
    expect(events).toHaveLength(0);
  });

  it('attribue une unite identifiee en passant a "assigned"', async () => {
    const seed = equipmentRequestRecord({ id: 'equip-1', status: 'ordered' });
    const { repository } = fakeEquipmentRepository([seed]);
    const { audit, events } = fakeAudit();

    const result = await transitionEquipmentRequest(
      { repository, audit },
      { requestId: 'equip-1', to: 'assigned', actorId: 'user-it', unitReference: 'SN-042' },
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.request.status).toBe('assigned');
    expect(result.ok && result.request.unitReference).toBe('SN-042');
    expect(events[0]?.action).toBe('equipment.transitioned');
  });

  it('reprend une unite avant l arrivee et efface son numero', async () => {
    const seed = equipmentRequestRecord({ id: 'equip-1', status: 'assigned', unitReference: 'SN-042' });
    const { repository } = fakeEquipmentRepository([seed]);
    const { audit, events } = fakeAudit();

    const result = await transitionEquipmentRequest(
      { repository, audit },
      { requestId: 'equip-1', to: 'requested', actorId: 'user-it' },
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.request.status).toBe('requested');
    expect(result.ok && result.request.unitReference).toBeNull();
    expect(events[0]?.action).toBe('equipment.reclaimed');
  });

  it('confirme la remise puis l accuse de reception', async () => {
    const seed = equipmentRequestRecord({ id: 'equip-1', status: 'assigned', taskId: 'task-welcome' });
    const { repository } = fakeEquipmentRepository([seed]);
    const { audit } = fakeAudit();

    const handedOver = await transitionEquipmentRequest(
      { repository, audit },
      { requestId: 'equip-1', to: 'handed_over', actorId: 'user-it' },
    );
    expect(handedOver.ok && handedOver.request.status).toBe('handed_over');

    const acknowledged = await transitionEquipmentRequest(
      { repository, audit },
      { requestId: 'equip-1', to: 'acknowledged', actorId: 'user-employee' },
    );
    expect(acknowledged.ok && acknowledged.request.status).toBe('acknowledged');
  });
});
