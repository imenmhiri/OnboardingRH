import type { AuditEvent, AuditTrail } from '@/application/ports/audit-trail';
import type {
  EquipmentRepository,
  EquipmentRequestRecord,
  NewEquipmentRequest,
} from '@/application/ports/equipment-repository';

/** Doublures en memoire, pas des mocks : de vraies implementations des ports. */

export function fakeEquipmentRepository(seed: readonly EquipmentRequestRecord[] = []) {
  const records = new Map(seed.map((request) => [request.id, request]));
  let nextId = 1;
  const repository: EquipmentRepository = {
    async insertMany(requests: readonly NewEquipmentRequest[]) {
      const created = requests.map((request) => {
        const record: EquipmentRequestRecord = {
          id: `equip-${nextId++}`,
          ...request,
          status: 'requested',
          unitReference: null,
        };
        records.set(record.id, record);
        return record;
      });
      return created;
    },
    async findById(id) {
      return records.get(id) ?? null;
    },
    async updateStatus(id, status, unitReference) {
      const existing = records.get(id);
      if (!existing) {
        throw new Error(`Demande de materiel introuvable : ${id}`);
      }
      const updated: EquipmentRequestRecord = { ...existing, status, unitReference };
      records.set(id, updated);
      return updated;
    },
  };
  return { repository, records };
}

export function fakeAudit() {
  const events: AuditEvent[] = [];
  const audit: AuditTrail = {
    async record(event) {
      events.push(event);
    },
  };
  return { audit, events };
}

export function equipmentRequestRecord(overrides: Partial<EquipmentRequestRecord> = {}): EquipmentRequestRecord {
  return {
    id: 'equip-1',
    companyId: 'company-1',
    journeyId: 'journey-1',
    taskId: 'task-1',
    catalogItemId: 'catalog-1',
    status: 'requested',
    unitReference: null,
    ...overrides,
  };
}
