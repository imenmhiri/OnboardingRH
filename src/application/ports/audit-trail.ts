/**
 * Ecriture dans le journal d'audit. Volontairement sans lecture : la table est
 * en insertion seule (voir la migration de T-06), et une insertion suivie d'un
 * RETURNING echoue pour un membre non-RH — ce port n'en fait jamais.
 */
export interface AuditEvent {
  readonly companyId: string;
  readonly actorId: string;
  readonly action: string;
  readonly journeyId?: string;
  readonly taskId?: string;
  readonly payload?: Record<string, unknown>;
}

export interface AuditTrail {
  record(event: AuditEvent): Promise<void>;
}
