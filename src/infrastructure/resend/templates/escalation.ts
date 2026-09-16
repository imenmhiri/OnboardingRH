import type { CompanyBranding } from '@/lib/branding';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import { formatFrenchDate, renderEmail, type RenderedEmail } from './layout';

/**
 * Construit et teste des a present ; pas encore appele par un declencheur
 * reel (attend W2 — retard critique, T-22).
 */
export interface EscalationEmailInput {
  readonly managerName: string;
  readonly ownerName: string;
  readonly taskTitle: string;
  readonly dueDate: PlainDate;
  readonly portalUrl: string;
  readonly branding: CompanyBranding;
}

export function renderEscalationEmail(input: EscalationEmailInput): RenderedEmail {
  const subject = `Escalade : ${input.taskTitle} toujours ouverte`;
  const dueLabel = formatFrenchDate(input.dueDate);

  return renderEmail(subject, input.branding, {
    heading: `Une tache reste bloquee malgre la relance`,
    paragraphs: [
      `Bonjour ${input.managerName},`,
      `La tache « ${input.taskTitle} », attribuee a ${input.ownerName} et attendue pour le ${dueLabel}, est toujours ouverte le lendemain de la relance.`,
      `Le parcours d'integration est impacte : votre intervention est necessaire pour la debloquer.`,
    ],
    cta: { label: 'Voir la tache', url: input.portalUrl },
    footerNote: `Escalade automatique OnboardingRH pour ${input.branding.name}, tracee dans le journal d'audit.`,
  });
}
