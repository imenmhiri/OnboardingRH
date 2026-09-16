import type { CompanyBranding } from '@/lib/branding';
import type { PlainDate } from '@/domain/scheduling/plain-date';
import type { EmailChannel } from '@/domain/notifications/recipient-resolution';

/**
 * Rendu HTML/texte des gabarits transactionnels. Un port plutot qu'un import
 * direct de `src/infrastructure/resend/templates` : le rendu touche a la
 * presentation (HTML, marque), donc vit en infrastructure, mais
 * l'application ne doit dependre que de cette interface (voir la regle de
 * dependance de CLAUDE.md et `eslint.config.mjs`).
 */

export interface RenderedEmail {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
}

export interface WelcomeEmailTemplateInput {
  readonly employeeName: string;
  readonly arrivalDate: PlainDate;
  readonly portalUrl: string;
  readonly branding: CompanyBranding;
  readonly channel: EmailChannel;
  readonly managerName: string | null;
}

export interface ReminderEmailTemplateInput {
  readonly ownerName: string;
  readonly taskTitle: string;
  readonly dueDate: PlainDate;
  readonly workingDaysLate: number;
  readonly portalUrl: string;
  readonly branding: CompanyBranding;
}

export interface EscalationEmailTemplateInput {
  /** Le destinataire de l'escalade — un manager, ou une RH si le niveau l'exige. */
  readonly managerName: string;
  /** Le proprietaire de la tache en retard, jamais le destinataire ici. */
  readonly ownerName: string;
  readonly taskTitle: string;
  readonly dueDate: PlainDate;
  readonly portalUrl: string;
  readonly branding: CompanyBranding;
}

export interface QuestionnaireEmailTemplateInput {
  readonly employeeName: string;
  /** "J+7" ou "J+30". */
  readonly milestoneLabel: string;
  readonly surveyUrl: string;
  readonly branding: CompanyBranding;
}

export interface EmailTemplates {
  renderWelcome(input: WelcomeEmailTemplateInput): RenderedEmail;
  renderReminder(input: ReminderEmailTemplateInput): RenderedEmail;
  renderEscalation(input: EscalationEmailTemplateInput): RenderedEmail;
  renderQuestionnaire(input: QuestionnaireEmailTemplateInput): RenderedEmail;
}
