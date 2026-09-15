import { comparePlainDates, type PlainDate } from '../scheduling/plain-date';

/**
 * Decide qui relancer et a quel niveau, pour une tache en retard. Cette
 * fonction ne fait qu'envoi rien : c'est un jugement pur, l'envoi appartient a
 * l'infrastructure (T-24) et son declenchement a un workflow (T-22).
 */

export type Criticality = 'standard' | 'critical';

export type Recipient = 'owner' | 'manager' | 'hr_admin';

export interface EscalationLevel {
  /** Ce niveau s'applique a partir de ce retard, en jours ouvres. */
  readonly afterWorkingDaysLate: number;
  readonly recipient: Recipient;
}

/**
 * Les seuils d'une societe pour un niveau de criticite. Une donnee, jamais une
 * constante : deux societes peuvent tolerer des retards differents avant
 * d'escalader, et une tache critique n'a pas les memes seuils qu'une tache
 * ordinaire.
 */
export interface EscalationPolicy {
  readonly companyId: string;
  readonly standard: readonly EscalationLevel[];
  readonly critical: readonly EscalationLevel[];
}

export interface EscalationRecipients {
  readonly ownerId: string | null;
  readonly managerId: string | null;
  readonly hrAdminIds: readonly string[];
}

export interface EscalationCandidateInput {
  readonly taskId: string;
  readonly title: string;
  readonly workingDaysLate: number;
  readonly criticality: Criticality;
  readonly recipients: EscalationRecipients;
  /** Null si aucune relance n'a jamais ete envoyee pour cette tache. */
  readonly lastReminderSentOn: PlainDate | null;
}

export interface EscalationDecision {
  readonly taskId: string;
  readonly level: EscalationLevel;
  readonly recipientId: string;
  readonly workingDaysLate: number;
}

export type EscalationRefusal =
  | { readonly code: 'not_late' }
  | { readonly code: 'already_reminded_today' }
  | { readonly code: 'no_threshold_reached' }
  | { readonly code: 'recipient_unresolved'; readonly recipient: Recipient };

export type EscalationResult =
  | { readonly ok: true; readonly decision: EscalationDecision }
  | { readonly ok: false; readonly refusal: EscalationRefusal };

function levelsFor(policy: EscalationPolicy, criticality: Criticality): readonly EscalationLevel[] {
  return criticality === 'critical' ? policy.critical : policy.standard;
}

/**
 * Le niveau le plus eleve dont le seuil est atteint. Les niveaux ne sont pas
 * supposes tries : on prend le maximum, pas le premier qui correspond.
 */
function highestReachedLevel(
  levels: readonly EscalationLevel[],
  workingDaysLate: number,
): EscalationLevel | null {
  const reached = levels.filter((level) => workingDaysLate >= level.afterWorkingDaysLate);
  if (reached.length === 0) {
    return null;
  }
  return reached.reduce((highest, level) =>
    level.afterWorkingDaysLate > highest.afterWorkingDaysLate ? level : highest,
  );
}

function personFor(recipient: Recipient, recipients: EscalationRecipients): string | null {
  switch (recipient) {
    case 'owner':
      return recipients.ownerId;
    case 'manager':
      return recipients.managerId;
    case 'hr_admin':
      // Plusieurs RH possibles : on trie pour que deux appels a la meme
      // date donnent la meme personne, sans dependre de l'ordre d'arrivee.
      return [...recipients.hrAdminIds].sort()[0] ?? null;
  }
}

/**
 * Decide la relance d'une tache. La garde anti-harcelement est verifiee avant
 * tout le reste : une tache deja relancee aujourd'hui ne l'est pas une
 * deuxieme fois, meme si un niveau plus haut serait atteint.
 */
export function decideEscalation(
  policy: EscalationPolicy,
  input: EscalationCandidateInput,
  today: PlainDate,
): EscalationResult {
  if (input.workingDaysLate <= 0) {
    return { ok: false, refusal: { code: 'not_late' } };
  }
  if (
    input.lastReminderSentOn !== null &&
    comparePlainDates(input.lastReminderSentOn, today) === 0
  ) {
    return { ok: false, refusal: { code: 'already_reminded_today' } };
  }

  const level = highestReachedLevel(levelsFor(policy, input.criticality), input.workingDaysLate);
  if (!level) {
    return { ok: false, refusal: { code: 'no_threshold_reached' } };
  }

  const recipientId = personFor(level.recipient, input.recipients);
  if (!recipientId) {
    return { ok: false, refusal: { code: 'recipient_unresolved', recipient: level.recipient } };
  }

  return {
    ok: true,
    decision: { taskId: input.taskId, level, recipientId, workingDaysLate: input.workingDaysLate },
  };
}
