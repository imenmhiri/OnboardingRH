import type { EmailTemplates } from '@/application/ports/email-templates';
import { renderWelcomeEmail } from './templates/welcome';
import { renderReminderEmail } from './templates/reminder';
import { renderEscalationEmail } from './templates/escalation';

/**
 * Implementation du port EmailTemplates. Relance et escalade sont branchees
 * par W2 (T-22) ; tache assignee et questionnaire restent construits et
 * testes (`./templates/*`) mais sans declencheur reel (T-23 / le flux
 * d'attribution des taches), donc pas encore exposes ici.
 */
export function resendEmailTemplates(): EmailTemplates {
  return {
    renderWelcome: renderWelcomeEmail,
    renderReminder: renderReminderEmail,
    renderEscalation: renderEscalationEmail,
  };
}
