import { randomUUID } from 'node:crypto';
import { parsePlainDate, isBefore, type PlainDate } from '@/domain/scheduling/plain-date';
import { resolveWelcomeEmailSendDate } from '@/domain/scheduling/due-date';
import { selectTemplate, type JourneyTemplate } from '@/domain/templates/journey-template';
import { instantiateJourney, type InstantiationDefect } from '@/domain/templates/journey-instantiation';
import type { AssignmentDirectory } from '@/application/ports/assignment-directory';
import type { AuditTrail } from '@/application/ports/audit-trail';
import type { CalendarDirectory } from '@/application/ports/calendar-directory';
import type { Clock } from '@/application/ports/clock';
import type { JourneyRepository } from '@/application/ports/journey-repository';
import type { TemplateRepository } from '@/application/ports/template-repository';
import { toJourneyTemplate } from './manage-journey-templates';
import { assignJourneyOwners } from './assign-journey-owners';

/**
 * W1 : une embauche validee devient un parcours complet. Ce cas d'usage est
 * tout ce que le webhook n8n appelle — la selection du template, le calcul des
 * echeances et la resolution des responsables restent dans le domaine ; ici on
 * ne fait qu'orchestrer et persister.
 */

export interface ValidatedHireInput {
  readonly companyId: string;
  readonly siteId: string;
  readonly jobFamily: string;
  readonly contractType: string;
  readonly employeeName: string;
  /** Renseigne seulement si l'ATS relie deja l'embauche a un compte existant. */
  readonly employeeId: string | null;
  readonly managerId: string | null;
  readonly arrivalDate: string;
  /** Reference externe (ATS/HRIS) : porte l'idempotence du webhook. */
  readonly hireReference: string;
  /** Seule adresse qui joint un employe sans compte encore cree (voir T-24). */
  readonly personalEmail: string | null;
}

export type CreateJourneyResult =
  | {
      readonly ok: true;
      readonly journeyId: string;
      readonly status: 'created';
      readonly arrivalInPast: boolean;
      /** Date a laquelle n8n doit declencher l'envoi differe de l'email de bienvenue (T-24). */
      readonly sendWelcomeEmailAt: PlainDate;
    }
  | { readonly ok: true; readonly journeyId: string; readonly status: 'duplicate' }
  | { readonly ok: false; readonly reason: 'invalid_arrival_date' }
  | { readonly ok: false; readonly reason: 'no_match' }
  | { readonly ok: false; readonly reason: 'ambiguous_match'; readonly templateIds: readonly string[] }
  | { readonly ok: false; readonly reason: 'invalid_template'; readonly defects: readonly InstantiationDefect[] };

export interface CreateJourneyPorts {
  readonly templates: TemplateRepository;
  readonly journeys: JourneyRepository;
  readonly calendar: CalendarDirectory;
  readonly directory: AssignmentDirectory;
  readonly audit: AuditTrail;
  readonly clock: Clock;
}

/**
 * Zero acteur humain derriere un webhook : `null` s'ecrit dans audit_events,
 * l'origine reste tracee dans le payload de chaque evenement.
 */
const SYSTEM_ACTOR = null;

export async function createJourneyFromValidatedHire(
  ports: CreateJourneyPorts,
  input: ValidatedHireInput,
): Promise<CreateJourneyResult> {
  const existing = await ports.journeys.findByHireReference(input.companyId, input.hireReference);
  if (existing) {
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'journey.duplicate_hire_ignored',
      journeyId: existing.journeyId,
      payload: { origin: 'w1-validated-hire', hireReference: input.hireReference },
    });
    return { ok: true, journeyId: existing.journeyId, status: 'duplicate' };
  }

  let arrivalDate: PlainDate;
  try {
    arrivalDate = parsePlainDate(input.arrivalDate);
  } catch {
    return { ok: false, reason: 'invalid_arrival_date' };
  }

  const summaries = await ports.templates.listByCompany(input.companyId);
  const candidates: readonly JourneyTemplate[] = summaries.map((summary) => ({
    id: summary.id,
    companyId: summary.companyId,
    name: summary.name,
    criteria: summary.criteria,
    taskDefinitions: [],
  }));

  const selection = selectTemplate(candidates, {
    companyId: input.companyId,
    jobFamily: input.jobFamily,
    siteId: input.siteId,
    contractType: input.contractType,
  });

  if (!selection.ok) {
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'journey.template_selection_failed',
      payload: {
        origin: 'w1-validated-hire',
        hireReference: input.hireReference,
        reason: selection.reason,
        ...(selection.reason === 'ambiguous_match' ? { templateIds: selection.templateIds } : {}),
      },
    });
    return selection.reason === 'no_match'
      ? { ok: false, reason: 'no_match' }
      : { ok: false, reason: 'ambiguous_match', templateIds: selection.templateIds };
  }

  const detail = await ports.templates.findById(selection.template.id);
  if (!detail) {
    // Course improbable : le template a disparu entre la selection et la
    // lecture. On la traite comme une absence de correspondance plutot que de
    // planter, puisque c'est ce que l'appelant doit constater.
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'journey.template_selection_failed',
      payload: { origin: 'w1-validated-hire', hireReference: input.hireReference, reason: 'template_vanished' },
    });
    return { ok: false, reason: 'no_match' };
  }
  const template = toJourneyTemplate(detail);

  const calendar = await ports.calendar.calendarFor(input.companyId, input.siteId);
  const journeyId = randomUUID();
  const idByKey = new Map(template.taskDefinitions.map((def) => [def.key, randomUUID()]));

  const instantiation = instantiateJourney({
    template,
    journeyId,
    arrivalDate,
    calendar,
    idFor: (key) => idByKey.get(key) ?? `${journeyId}:${key}`,
  });

  if (!instantiation.ok) {
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'journey.instantiation_failed',
      payload: {
        origin: 'w1-validated-hire',
        hireReference: input.hireReference,
        templateId: template.id,
        defects: instantiation.defects,
      },
    });
    return { ok: false, reason: 'invalid_template', defects: instantiation.defects };
  }

  const today = ports.clock.today();
  const arrivalInPast = isBefore(arrivalDate, today);

  const insertResult = await ports.journeys.insertJourney({
    id: journeyId,
    companyId: input.companyId,
    siteId: input.siteId,
    templateId: template.id,
    employeeName: input.employeeName,
    employeeId: input.employeeId,
    jobFamily: input.jobFamily,
    contractType: input.contractType,
    managerId: input.managerId,
    arrivalDate,
    hireReference: input.hireReference,
    personalEmail: input.personalEmail,
  });

  if (!insertResult.ok) {
    // La contrainte unique a gagne la course contre la verification prealable :
    // meme conclusion que si on l'avait vue en premier.
    const concurrent = await ports.journeys.findByHireReference(input.companyId, input.hireReference);
    if (concurrent) {
      return { ok: true, journeyId: concurrent.journeyId, status: 'duplicate' };
    }
    throw new Error(`Parcours non cree pour ${input.hireReference} : contrainte d'unicite sans ligne retrouvee.`);
  }

  await ports.journeys.insertTasks(input.companyId, journeyId, instantiation.tasks);

  await ports.audit.record({
    companyId: input.companyId,
    actorId: SYSTEM_ACTOR,
    action: 'journey.created',
    journeyId,
    payload: {
      origin: 'w1-validated-hire',
      hireReference: input.hireReference,
      templateId: template.id,
      arrivalDate,
      taskCount: instantiation.tasks.length,
    },
  });

  if (arrivalInPast) {
    // Une embauche saisie en retard reste acceptee : le parcours doit exister
    // quand meme, avec ses echeances deja passees rendues visibles au cockpit,
    // plutot que d'etre refusee et de disparaitre silencieusement.
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'journey.arrival_in_past',
      journeyId,
      payload: { origin: 'w1-validated-hire', arrivalDate, today },
    });
  }

  const outcome = await assignJourneyOwners(
    { directory: ports.directory, audit: ports.audit },
    { companyId: input.companyId, journeyId, tasks: instantiation.tasks, actorId: SYSTEM_ACTOR },
  );

  const notifiedOwners = new Set<string>();
  for (const assignment of outcome.assignments) {
    if (assignment.assignment?.kind === 'person') {
      await ports.journeys.assignOwner(assignment.taskId, assignment.assignment.ownerId);
      notifiedOwners.add(assignment.assignment.ownerId);
    }
  }

  // Le point d'accroche pour T-24 (email) / T-25 (agenda) : la trace dit qui
  // devrait etre notifie et de quoi, sans jamais envoyer quoi que ce soit tant
  // que ces tickets n'ont pas livre l'integration reelle.
  for (const ownerId of notifiedOwners) {
    await ports.audit.record({
      companyId: input.companyId,
      actorId: SYSTEM_ACTOR,
      action: 'journey.owner_notification_pending',
      journeyId,
      payload: { origin: 'w1-validated-hire', ownerId, deferredTo: 'T-24' },
    });
  }

  const sendWelcomeEmailAt = resolveWelcomeEmailSendDate(arrivalDate, calendar);

  await ports.audit.record({
    companyId: input.companyId,
    actorId: SYSTEM_ACTOR,
    action: 'journey.welcome_email_pending',
    journeyId,
    payload: {
      origin: 'w1-validated-hire',
      employeeId: input.employeeId,
      arrivalDate,
      sendWelcomeEmailAt,
      note: 'Envoi differe, cale sur la date d\'arrivee — le webhook n8n attend sendWelcomeEmailAt avant d\'appeler /api/notifications/welcome-email (T-24).',
    },
  });

  await ports.audit.record({
    companyId: input.companyId,
    actorId: SYSTEM_ACTOR,
    action: 'journey.calendar_events_pending',
    journeyId,
    payload: { origin: 'w1-validated-hire', arrivalDate, deferredTo: 'T-25' },
  });

  return { ok: true, journeyId, status: 'created', arrivalInPast, sendWelcomeEmailAt };
}
