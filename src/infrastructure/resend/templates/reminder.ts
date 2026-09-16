import type { CompanyBranding } from '@/lib/branding';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import { formatFrenchDate, renderEmail, type RenderedEmail } from './layout';

/**
 * Construit et teste des a present ; pas encore appele par un declencheur
 * reel (attend W2 — retard critique, T-22).
 */
export interface ReminderEmailInput {
  readonly ownerName: string;
  readonly taskTitle: string;
  readonly dueDate: PlainDate;
  readonly workingDaysLate: number;
  readonly portalUrl: string;
  readonly branding: CompanyBranding;
}

export function renderReminderEmail(input: ReminderEmailInput): RenderedEmail {
  const subject = `Echeance depassee : ${input.taskTitle}`;
  const dueLabel = formatFrenchDate(input.dueDate);
  const lateLabel = input.workingDaysLate <= 1 ? '1 jour ouvre' : `${input.workingDaysLate} jours ouvres`;

  return renderEmail(subject, input.branding, {
    heading: `« ${input.taskTitle} » est en retard`,
    paragraphs: [
      `Bonjour ${input.ownerName},`,
      `La tache « ${input.taskTitle} » etait attendue pour le ${dueLabel} et accuse desormais ${lateLabel} de retard.`,
      `Merci de la traiter des que possible, ou d'indiquer ce qui la bloque : le parcours en depend.`,
    ],
    cta: { label: 'Traiter la tache', url: input.portalUrl },
    footerNote: `Relance automatique OnboardingRH pour ${input.branding.name}. Sans traitement, un manager sera prevenu.`,
  });
}
