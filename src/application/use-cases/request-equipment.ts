import type { AuditTrail } from '@/application/ports/audit-trail';
import type { EquipmentRepository, EquipmentRequestRecord } from '@/application/ports/equipment-repository';

export interface RequestEquipmentInput {
  readonly companyId: string;
  readonly journeyId: string;
  /** La tache dont la remise conditionne la fin, si le catalogue le prevoit. */
  readonly taskId: string | null;
  readonly catalogItemIds: readonly string[];
  readonly requestedBy: string;
}

export type RequestEquipmentResult =
  | { readonly ok: true; readonly requests: readonly EquipmentRequestRecord[] }
  | { readonly ok: false; readonly reason: 'empty_selection' };

/**
 * Ouvre une ou plusieurs demandes de materiel pour un parcours, depuis le
 * catalogue de la societe. Une selection vide est un refus explicite plutot
 * qu'une ecriture qui ne fait rien silencieusement.
 */
export async function requestEquipment(
  ports: { repository: EquipmentRepository; audit: AuditTrail },
  input: RequestEquipmentInput,
): Promise<RequestEquipmentResult> {
  if (input.catalogItemIds.length === 0) {
    return { ok: false, reason: 'empty_selection' };
  }

  const requests = await ports.repository.insertMany(
    input.catalogItemIds.map((catalogItemId) => ({
      companyId: input.companyId,
      journeyId: input.journeyId,
      taskId: input.taskId,
      catalogItemId,
    })),
  );

  await ports.audit.record({
    companyId: input.companyId,
    actorId: input.requestedBy,
    action: 'equipment.requested',
    journeyId: input.journeyId,
    payload: { requestIds: requests.map((request) => request.id), catalogItemIds: input.catalogItemIds },
  });

  return { ok: true, requests };
}
