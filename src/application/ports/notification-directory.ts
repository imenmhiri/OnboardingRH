import type { PlainDate } from '@/domain/scheduling/plain-date';

/**
 * Ce dont l'email de bienvenue a besoin, resolu depuis le parcours : le nom
 * ne transite jamais dans un payload de webhook, il est lu ici au moment de
 * l'envoi (voir .claude/skills/n8n-workflow/SKILL.md, "Confidentialite").
 */
export interface WelcomeEmailContext {
  readonly companyId: string;
  readonly journeyId: string;
  readonly employeeName: string;
  readonly personalEmail: string | null;
  /** Adresse de connexion (auth.users) : n'existe que si un compte a deja ete cree. */
  readonly professionalEmail: string | null;
  readonly managerEmail: string | null;
  readonly managerName: string | null;
  readonly arrivalDate: PlainDate;
  /** Non nul si un envoi a deja reussi : l'appelant doit rester idempotent. */
  readonly welcomeEmailSentAt: string | null;
}

export interface NotificationDirectory {
  welcomeContextFor(companyId: string, journeyId: string): Promise<WelcomeEmailContext | null>;
  markWelcomeEmailSent(journeyId: string): Promise<void>;
}
