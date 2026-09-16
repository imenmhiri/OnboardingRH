import type { EquipmentStatus } from '@/domain/equipment/equipment';

export interface EquipmentRequestRecord {
  readonly id: string;
  readonly companyId: string;
  readonly journeyId: string;
  readonly taskId: string | null;
  readonly catalogItemId: string;
  readonly status: EquipmentStatus;
  /** Numero de serie ou de badge une fois une unite physique affectee. */
  readonly unitReference: string | null;
}

export interface NewEquipmentRequest {
  readonly companyId: string;
  readonly journeyId: string;
  readonly taskId: string | null;
  readonly catalogItemId: string;
}

export interface EquipmentRepository {
  insertMany(requests: readonly NewEquipmentRequest[]): Promise<readonly EquipmentRequestRecord[]>;
  findById(id: string): Promise<EquipmentRequestRecord | null>;
  updateStatus(
    id: string,
    status: EquipmentStatus,
    unitReference: string | null,
  ): Promise<EquipmentRequestRecord>;
}
