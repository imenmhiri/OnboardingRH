import { describe, expect, it } from 'vitest';
import { requestEquipment } from './request-equipment';
import { fakeAudit, fakeEquipmentRepository } from './equipment-test-fixtures';

describe('requestEquipment', () => {
  it('cree une demande par article du catalogue selectionne', async () => {
    const { repository, records } = fakeEquipmentRepository();
    const { audit, events } = fakeAudit();

    const result = await requestEquipment(
      { repository, audit },
      {
        companyId: 'company-1',
        journeyId: 'journey-1',
        taskId: 'task-welcome',
        catalogItemIds: ['catalog-laptop', 'catalog-badge'],
        requestedBy: 'user-hr',
      },
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.requests).toHaveLength(2);
    expect(records.size).toBe(2);
    expect([...records.values()].every((r) => r.status === 'requested')).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]?.action).toBe('equipment.requested');
  });

  it('refuse une selection vide plutot que de ne rien ecrire en silence', async () => {
    const { repository } = fakeEquipmentRepository();
    const { audit, events } = fakeAudit();

    const result = await requestEquipment(
      { repository, audit },
      { companyId: 'company-1', journeyId: 'journey-1', taskId: null, catalogItemIds: [], requestedBy: 'user-hr' },
    );

    expect(result).toEqual({ ok: false, reason: 'empty_selection' });
    expect(events).toHaveLength(0);
  });
});
