import type { EmailTemplates } from '@/application/ports/email-templates';
import { renderWelcomeEmail } from './templates/welcome';

/**
 * Implementation du port EmailTemplates. Les quatre autres gabarits
 * (tache assignee, relance, escalade, questionnaire — `./templates/*`) sont
 * construits et testes mais n'ont pas encore de methode ici : ils attendent
 * un declencheur reel (T-22/T-23/le flux d'attribution des taches) avant
 * d'etre exposes par ce port, pour ne pas cabler un appelant qui n'existe pas.
 */
export function resendEmailTemplates(): EmailTemplates {
  return {
    renderWelcome: renderWelcomeEmail,
  };
}
