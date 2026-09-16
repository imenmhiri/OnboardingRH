import type {
  EquipmentRepository,
  EquipmentRequestRecord,
  NewEquipmentRequest,
} from '@/application/ports/equipment-repository';
import type { EquipmentStatus } from '@/domain/equipment/equipment';
import { createSupabaseServerClient } from './server-client';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

interface EquipmentRequestRow {
  readonly id: string;
  readonly company_id: string;
  readonly journey_id: string;
  readonly task_id: string | null;
  readonly catalog_item_id: string;
  readonly status: EquipmentStatus;
  readonly unit_reference: string | null;
}

const COLUMNS = 'id, company_id, journey_id, task_id, catalog_item_id, status, unit_reference';

function toRecord(row: EquipmentRequestRow): EquipmentRequestRecord {
  return {
    id: row.id,
    companyId: row.company_id,
    journeyId: row.journey_id,
    taskId: row.task_id,
    catalogItemId: row.catalog_item_id,
    status: row.status,
    unitReference: row.unit_reference,
  };
}

export function supabaseEquipmentRepository(client: SupabaseClient): EquipmentRepository {
  return {
    async insertMany(requests: readonly NewEquipmentRequest[]): Promise<readonly EquipmentRequestRecord[]> {
      if (requests.length === 0) {
        return [];
      }
      const { data, error } = await client
        .from('equipment_requests')
        .insert(
          requests.map((request) => ({
            company_id: request.companyId,
            journey_id: request.journeyId,
            task_id: request.taskId,
            catalog_item_id: request.catalogItemId,
          })),
        )
        .select(COLUMNS);

      if (error || !data) {
        throw new Error(`Creation des demandes de materiel impossible : ${error?.message ?? 'inconnu'}`);
      }
      return (data as EquipmentRequestRow[]).map(toRecord);
    },

    async findById(id: string): Promise<EquipmentRequestRecord | null> {
      const { data, error } = await client
        .from('equipment_requests')
        .select(COLUMNS)
        .eq('id', id)
        .maybeSingle();

      if (error || !data) {
        return null;
      }
      return toRecord(data as EquipmentRequestRow);
    },

    async updateStatus(
      id: string,
      status: EquipmentStatus,
      unitReference: string | null,
    ): Promise<EquipmentRequestRecord> {
      const { data, error } = await client
        .from('equipment_requests')
        .update({ status, unit_reference: unitReference })
        .eq('id', id)
        .select(COLUMNS)
        .single();

      if (error || !data) {
        throw new Error(`Mise a jour de la demande de materiel impossible : ${error?.message ?? 'inconnu'}`);
      }
      return toRecord(data as EquipmentRequestRow);
    },
  };
}
