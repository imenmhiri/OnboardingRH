import type { EquipmentStatus } from '@/domain/equipment/equipment';

/** Formes brutes des lignes Supabase utilisees par l'ecran matériel. */
export interface JourneyRow {
  readonly id: string;
  readonly employee_name: string;
  readonly arrival_date: string;
  readonly site_id: string | null;
  readonly status: string;
}

export interface CatalogItemRow {
  readonly id: string;
  readonly name: string;
  readonly category: 'computer' | 'badge' | 'accessory';
}

export interface EquipmentRequestRow {
  readonly id: string;
  readonly journey_id: string;
  readonly task_id: string | null;
  readonly catalog_item_id: string;
  readonly status: EquipmentStatus;
  readonly unit_reference: string | null;
}
