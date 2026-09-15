/**
 * Cycle de vie d'une demande de materiel : un ordinateur, un badge, un
 * accessoire. Les six etats sont ceux du cahier des charges ; « annulee »
 * s'ajoute pour la meme raison qu'une tache peut l'etre — un parcours qui
 * s'interrompt ne doit pas laisser une demande en suspens indefiniment.
 */

export const EQUIPMENT_STATUSES = [
  'requested',
  'ordered',
  'assigned',
  'handed_over',
  'acknowledged',
  'returned',
  'cancelled',
] as const;

export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export interface EquipmentRequest {
  readonly id: string;
  readonly companyId: string;
  readonly journeyId: string;
  /** La tache dont la remise conditionne la fin — souvent « accueil et remise du materiel ». */
  readonly taskId: string | null;
  readonly catalogItemId: string;
  readonly status: EquipmentStatus;
}

const ALLOWED_TRANSITIONS: Readonly<Record<EquipmentStatus, readonly EquipmentStatus[]>> = {
  requested: ['ordered', 'cancelled'],
  ordered: ['assigned', 'cancelled'],
  // « Attribue puis repris avant l'arrivee » : retour a requested, pas un etat
  // a part — le materiel redevient simplement a affecter.
  assigned: ['handed_over', 'requested', 'cancelled'],
  handed_over: ['acknowledged', 'cancelled'],
  // Reouvrir un accuse revient a le contester ; rare, mais pas a exclure.
  acknowledged: ['returned', 'handed_over'],
  returned: [],
  cancelled: [],
};

export type EquipmentTransitionRefusal =
  | { readonly code: 'same_status' }
  | { readonly code: 'terminal_status'; readonly from: EquipmentStatus }
  | { readonly code: 'illegal_transition'; readonly from: EquipmentStatus; readonly to: EquipmentStatus };

export type EquipmentTransitionResult =
  | { readonly ok: true; readonly request: EquipmentRequest }
  | { readonly ok: false; readonly refusal: EquipmentTransitionRefusal };

export function canTransitionEquipment(from: EquipmentStatus, to: EquipmentStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Applique une transition. Chaque refus porte un code, pas seulement un
 * booleen : l'interface doit pouvoir dire *pourquoi*, pas seulement que
 * l'action a echoue.
 */
export function transitionEquipment(
  request: EquipmentRequest,
  to: EquipmentStatus,
): EquipmentTransitionResult {
  if (request.status === to) {
    return { ok: false, refusal: { code: 'same_status' } };
  }
  if (ALLOWED_TRANSITIONS[request.status].length === 0) {
    return { ok: false, refusal: { code: 'terminal_status', from: request.status } };
  }
  if (!canTransitionEquipment(request.status, to)) {
    return { ok: false, refusal: { code: 'illegal_transition', from: request.status, to } };
  }
  return { ok: true, request: { ...request, status: to } };
}

/** Vrai pour la transition precise du cas limite « attribue puis repris ». */
export function isReclaim(from: EquipmentStatus, to: EquipmentStatus): boolean {
  return from === 'assigned' && to === 'requested';
}

/** Une demande reglee ne bloque plus rien, qu'elle ait servi ou non. */
export function isSettled(status: EquipmentStatus): boolean {
  return status === 'acknowledged' || status === 'returned' || status === 'cancelled';
}

/**
 * Cas limite : accuse de reception jamais signe. Le materiel a quitte le
 * stock (remis en main propre ou par colis) mais personne n'a confirme
 * l'avoir recu — la demande reste ouverte, et c'est elle qui doit remonter au
 * cockpit plutot que de se perdre dans une liste de taches.
 */
export function isAwaitingAcknowledgement(request: EquipmentRequest): boolean {
  return request.status === 'handed_over';
}

/**
 * Une tache qui attend ce materiel reste bloquee tant que la remise n'est pas
 * accusee ni la demande annulee — une demande remise mais pas confirmee ne
 * doit jamais laisser croire que la tache est faite.
 */
export function blocksDependentTask(request: EquipmentRequest): boolean {
  return request.taskId !== null && !isSettled(request.status);
}
