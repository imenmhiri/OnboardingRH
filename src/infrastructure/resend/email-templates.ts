import type { EmailTemplates } from '@/application/ports/email-templates';
import { renderWelcomeEmail } from './templates/welcome';
import { renderReminderEmail } from './templates/reminder';
import { renderEscalationEmail } from './templates/escalation';
import { renderQuestionnaireEmail } from './templates/questionnaire';

/**
 * Implementation du port EmailTemplates. Relance et escalade sont branchees
 * par W2 (T-22), questionnaire par W3 (T-23) ; tache assignee reste
 * construite et testee (`./templates/task-assigned.ts`... a verifier) mais
 * sans declencheur reel (flux d'attribution des taches), donc pas encore
 * exposee ici.
 */
export function resendEmailTemplates(): EmailTemplates {
  return {
    renderWelcome: renderWelcomeEmail,
    renderReminder: renderReminderEmail,
    renderEscalation: renderEscalationEmail,
    renderQuestionnaire: renderQuestionnaireEmail,
  };
}
