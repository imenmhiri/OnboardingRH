import { isWorkingDay } from '@/domain/scheduling/working-calendar';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import { selectEscalationCandidates, type EscalationSource } from '@/domain/escalation/escalation-candidates';
import { decideEscalation, type Recipient } from '@/domain/escalation/escalation-policy';
import { FALLBACK_BRANDING } from '@/lib/branding';
import type { AuditTrail } from '@/application/ports/audit-trail';
import type { CalendarDirectory } from '@/application/ports/calendar-directory';
import type { CompanyDirectory } from '@/application/ports/company-directory';
import type { EmailTemplates } from '@/application/ports/email-templates';
import type { EscalationRepository } from '@/application/ports/escalation-repository';
import type { Mailer } from '@/application/ports/mailer';

/**
 * W2 : un passage par jour ouvre qui relance les taches en retard et
 * escalade selon la politique de la societe (domain/escalation, T-13). Ce cas
 * d'usage n'invente aucune regle : il charge les donnees, appelle
 * `selectEscalationCandidates` puis `decideEscalation`, et traduit chaque
 * decision positive en un envoi reel (T-24) trace dans l'audit (T-06).
 *
 * Mapping gabarit <-> destinataire (aucun troisieme gabarit construit par
 * T-24 pour la RH specifiquement) : le niveau `owner` envoie une relance
 * directe (`renderReminder`, addressee au proprietaire de la tache) ; les
 * niveaux `manager` et `hr_admin` envoient une escalade (`renderEscalation`),
 * addressee a la personne effectivement resolue par `decideEscalation` —
 * manager ou RH selon le seuil franchi — le gabarit ne nomme jamais le role
 * dans le texte, seulement les deux personnes (destinataire, proprietaire).
 */

export interface CriticalDelayScanInput {
  readonly companyId: string;
  readonly today: PlainDate;
  /** Calcule tout, n'envoie ni n'ecrit rien : sert a repondre « qui, et pourquoi ». */
  readonly dryRun: boolean;
}

export interface DelayScanNotification {
  readonly journeyId: string;
  readonly employeeName: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly workingDaysLate: number;
  readonly recipientRole: Recipient;
  readonly recipientId: string;
  readonly recipientName: string | null;
  readonly template: 'reminder' | 'escalation';
  readonly sent: boolean;
  readonly sendReason?: 'invalid_recipient' | 'provider_error' | 'no_email';
}

export interface DelayScanRefusal {
  readonly journeyId: string;
  readonly employeeName: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly workingDaysLate: number;
  readonly code: string;
}

export interface CriticalDelayScanResult {
  readonly companyId: string;
  readonly today: PlainDate;
  readonly dryRun: boolean;
  /** Vrai si le passage entier a ete saute, sans meme charger les parcours. */
  readonly skipped: boolean;
  readonly skippedReason?: 'non_working_day' | 'no_policy_configured';
  readonly notifications: readonly DelayScanNotification[];
  readonly refusals: readonly DelayScanRefusal[];
}

export interface CriticalDelayScanPorts {
  readonly escalation: EscalationRepository;
  readonly calendar: CalendarDirectory;
  readonly branding: CompanyDirectory;
  readonly templates: EmailTemplates;
  readonly mailer: Mailer;
  readonly audit: AuditTrail;
  readonly portalUrl: string;
}

const SYSTEM_ACTOR = null;

function templateFor(recipient: Recipient): 'reminder' | 'escalation' {
  return recipient === 'owner' ? 'reminder' : 'escalation';
}

export async function runCriticalDelayScan(
  ports: CriticalDelayScanPorts,
  input: CriticalDelayScanInput,
): Promise<CriticalDelayScanResult> {
  const { companyId, today, dryRun } = input;

  // Jour ferie de la societe : aucune relance ce jour-la, le passage entier
  // est saute plutot que de compter sur la math du retard pour tomber a zero.
  const companyCalendar = await ports.calendar.calendarFor(companyId, null);
  if (!isWorkingDay(today, companyCalendar)) {
    return {
      companyId,
      today,
      dryRun,
      skipped: true,
      skippedReason: 'non_working_day',
      notifications: [],
      refusals: [],
    };
  }

  const policy = await ports.escalation.policyFor(companyId);
  if (!policy) {
    return {
      companyId,
      today,
      dryRun,
      skipped: true,
      skippedReason: 'no_policy_configured',
      notifications: [],
      refusals: [],
    };
  }

  const journeys = await ports.escalation.journeysWithTasks(companyId);
  const hrAdminIds = await ports.escalation.hrAdminIds(companyId);

  const allTaskIds = journeys.flatMap((journey) => journey.tasks.map((task) => task.id));
  const lastReminderByTaskId = await ports.escalation.lastReminderDates(companyId, allTaskIds);

  const notifications: DelayScanNotification[] = [];
  const refusals: DelayScanRefusal[] = [];

  for (const journey of journeys) {
    if (journey.tasks.length === 0) {
      continue;
    }
    const journeyCalendar = await ports.calendar.calendarFor(companyId, journey.siteId);

    const sources: EscalationSource[] = journey.tasks.map((task) => ({
      task,
      journeyStatus: journey.status,
      criticality: task.criticality,
      recipients: { ownerId: task.ownerId, managerId: journey.managerId, hrAdminIds },
    }));

    const candidates = selectEscalationCandidates(sources, journeyCalendar, today, lastReminderByTaskId);

    for (const candidate of candidates) {
      const decision = decideEscalation(policy, candidate, today);

      if (!decision.ok) {
        refusals.push({
          journeyId: journey.journeyId,
          employeeName: journey.employeeName,
          taskId: candidate.taskId,
          taskTitle: candidate.title,
          workingDaysLate: candidate.workingDaysLate,
          code: decision.refusal.code,
        });
        continue;
      }

      const { level, recipientId, workingDaysLate } = decision.decision;
      const recipientContact = await ports.escalation.personContact(recipientId);
      const template = templateFor(level.recipient);
      const task = journey.tasks.find((t) => t.id === candidate.taskId);
      const dueDate = task?.dueDate ?? today;

      if (dryRun) {
        notifications.push({
          journeyId: journey.journeyId,
          employeeName: journey.employeeName,
          taskId: candidate.taskId,
          taskTitle: candidate.title,
          workingDaysLate,
          recipientRole: level.recipient,
          recipientId,
          recipientName: recipientContact?.name ?? null,
          template,
          sent: false,
        });
        continue;
      }

      if (!recipientContact?.email) {
        await ports.audit.record({
          companyId,
          actorId: SYSTEM_ACTOR,
          action: 'email.no_channel_available',
          journeyId: journey.journeyId,
          taskId: candidate.taskId,
          payload: { template, recipientRole: level.recipient, recipientId, origin: 'w2-critical-delay' },
        });
        notifications.push({
          journeyId: journey.journeyId,
          employeeName: journey.employeeName,
          taskId: candidate.taskId,
          taskTitle: candidate.title,
          workingDaysLate,
          recipientRole: level.recipient,
          recipientId,
          recipientName: recipientContact?.name ?? null,
          template,
          sent: false,
          sendReason: 'no_email',
        });
        continue;
      }

      const branding = (await ports.branding.brandingOf(companyId)) ?? FALLBACK_BRANDING;
      const ownerContact = task?.ownerId ? await ports.escalation.personContact(task.ownerId) : null;

      const rendered =
        template === 'reminder'
          ? ports.templates.renderReminder({
              ownerName: recipientContact.name ?? 'vous',
              taskTitle: candidate.title,
              dueDate,
              workingDaysLate,
              portalUrl: ports.portalUrl,
              branding,
            })
          : ports.templates.renderEscalation({
              managerName: recipientContact.name ?? 'vous',
              ownerName: ownerContact?.name ?? 'la personne assignee',
              taskTitle: candidate.title,
              dueDate,
              portalUrl: ports.portalUrl,
              branding,
            });

      const sendResult = await ports.mailer.send({
        to: { email: recipientContact.email, ...(recipientContact.name ? { name: recipientContact.name } : {}) },
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (!sendResult.ok) {
        await ports.audit.record({
          companyId,
          actorId: SYSTEM_ACTOR,
          action: 'email.delivery_failed',
          journeyId: journey.journeyId,
          taskId: candidate.taskId,
          payload: {
            template,
            recipientRole: level.recipient,
            recipientId,
            reason: sendResult.reason,
            detail: sendResult.detail,
            origin: 'w2-critical-delay',
          },
        });
        notifications.push({
          journeyId: journey.journeyId,
          employeeName: journey.employeeName,
          taskId: candidate.taskId,
          taskTitle: candidate.title,
          workingDaysLate,
          recipientRole: level.recipient,
          recipientId,
          recipientName: recipientContact.name,
          template,
          sent: false,
          sendReason: sendResult.reason,
        });
        continue;
      }

      // Action nommee par T-13 des sa cloture : c'est elle qui repond « la
      // derniere relance de cette tache a-t-elle deja ete envoyee aujourd'hui ? »
      await ports.audit.record({
        companyId,
        actorId: SYSTEM_ACTOR,
        action: 'task.reminder_sent',
        journeyId: journey.journeyId,
        taskId: candidate.taskId,
        payload: {
          level: level.recipient,
          afterWorkingDaysLate: level.afterWorkingDaysLate,
          recipientId,
          workingDaysLate,
          messageId: sendResult.messageId,
          template,
          origin: 'w2-critical-delay',
        },
      });

      notifications.push({
        journeyId: journey.journeyId,
        employeeName: journey.employeeName,
        taskId: candidate.taskId,
        taskTitle: candidate.title,
        workingDaysLate,
        recipientRole: level.recipient,
        recipientId,
        recipientName: recipientContact.name,
        template,
        sent: true,
      });
    }
  }

  return { companyId, today, dryRun, skipped: false, notifications, refusals };
}
