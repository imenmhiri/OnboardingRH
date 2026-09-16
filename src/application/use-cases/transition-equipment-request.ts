import type { AuditTrail } from '@/application/ports/audit-trail';
import type { EquipmentRepository, EquipmentRequestRecord } from '@/application/ports/equipment-repository';
import {
  isReclaim,
  transitionEquipment,
  type EquipmentRequest,
  type EquipmentStatus,
  type EquipmentTransitionRefusal,
} from '@/domain/equipment/equipment';

export interface TransitionEquipmentRequestInput {
  readonly requestId: string;
  readonly to: EquipmentStatus;
  readonly actorId: string;
  /** Fourni au passage vers "assigned" : le numero de serie ou de badge affecte. */
  readonly unitReference?: string | null;
}

export type TransitionEquipmentRequestResult =
  | { readonly ok: true; readonly request: EquipmentRequestRecord }
  | { readonly ok: false; readonly reason: 'not_found' }
  | { readonly ok: false; readonly reason: 'refused'; readonly refusal: EquipmentTransitionRefusal };

/**
 * Fait avancer (ou reculer, pour la reprise avant l'arrivee) une demande de
 * materiel. La legalite du mouvement vient exclusivement de
 * `domain/equipment` — jamais recalculee ici ni dans l'UI, seulement rejouee.
 */
export async function transitionEquipmentRequest(
  ports: { repository: EquipmentRepository; audit: AuditTrail },
  input: TransitionEquipmentRequestInput,
): Promise<TransitionEquipmentRequestResult> {
  const record = await ports.repository.findById(input.requestId);
  if (!record) {
    return { ok: false, reason: 'not_found' };
  }

  const domainRequest: EquipmentRequest = {
    id: record.id,
    companyId: record.companyId,
    journeyId: record.journeyId,
    taskId: record.taskId,
    catalogItemId: record.catalogItemId,
    status: record.status,
  };

  const result = transitionEquipment(domainRequest, input.to);
  if (!result.ok) {
    return { ok: false, reason: 'refused', refusal: result.refusal };
  }

  const reclaimed = isReclaim(record.status, input.to);
  // Une unite reprise avant l'arrivee redevient a affecter : le numero deja
  // donne ne designe plus rien tant qu'une nouvelle affectation n'a pas eu
  // lieu. Sinon, on ne touche au numero que lorsqu'on en recoit un nouveau.
  const nextUnitReference = reclaimed
    ? null
    : (input.unitReference ?? record.unitReference);

  const updated = await ports.repository.updateStatus(record.id, input.to, nextUnitReference);

  await ports.audit.record({
    companyId: record.companyId,
    actorId: input.actorId,
    action: reclaimed ? 'equipment.reclaimed' : 'equipment.transitioned',
    journeyId: record.journeyId,
    ...(record.taskId ? { taskId: record.taskId } : {}),
    payload: { requestId: record.id, from: record.status, to: input.to, unitReference: nextUnitReference },
  });

  return { ok: true, request: updated };
}
