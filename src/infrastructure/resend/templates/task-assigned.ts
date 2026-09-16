import type { CompanyBranding } from '@/lib/branding';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import { formatFrenchDate, renderEmail, type RenderedEmail } from './layout';

/**
 * Construit et teste des a present ; pas encore appele par un declencheur
 * reel (attend le flux d'attribution des taches, hors perimetre T-24).
 */
export interface TaskAssignedEmailInput {
  readonly ownerName: string;
  readonly taskTitle: string;
  readonly dueDate: PlainDate;
  readonly journeyEmployeeName: string;
  readonly portalUrl: string;
  readonly branding: CompanyBranding;
}

export function renderTaskAssignedEmail(input: TaskAssignedEmailInput): RenderedEmail {
  const subject = `Nouvelle tache : ${input.taskTitle}`;
  const dueLabel = formatFrenchDate(input.dueDate);

  return renderEmail(subject, input.branding, {
    heading: `Une tache vous est confiee`,
    paragraphs: [
      `Bonjour ${input.ownerName},`,
      `La tache « ${input.taskTitle} » vous est attribuee dans le cadre de l'arrivee de ${input.journeyEmployeeName}, a realiser avant le ${dueLabel}.`,
      `Vous retrouverez le detail, les pieces attendues et les dependances sur votre portail.`,
    ],
    cta: { label: 'Voir la tache', url: input.portalUrl },
    footerNote: `Notification automatique OnboardingRH pour ${input.branding.name}.`,
  });
}
