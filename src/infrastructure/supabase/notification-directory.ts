import type { NotificationDirectory, WelcomeEmailContext } from '@/application/ports/notification-directory';
import { parsePlainDate } from '@/domain/scheduling/plain-date';
import { createSupabaseServiceClient } from './service-client';

type SupabaseServiceClient = ReturnType<typeof createSupabaseServiceClient>;

/**
 * Cle de service requise : la resolution du canal lit auth.users (l'adresse
 * de connexion) pour l'employe et pour le manager, une lecture qu'un client
 * authentifie ordinaire ne peut pas faire.
 */
export function supabaseNotificationDirectory(client: SupabaseServiceClient): NotificationDirectory {
  return {
    async welcomeContextFor(companyId: string, journeyId: string): Promise<WelcomeEmailContext | null> {
      const { data: journey, error } = await client
        .from('journeys')
        .select('id, company_id, employee_id, employee_name, personal_email, manager_id, arrival_date, welcome_email_sent_at')
        .eq('id', journeyId)
        .eq('company_id', companyId)
        .maybeSingle();

      if (error || !journey) {
        return null;
      }

      let professionalEmail: string | null = null;
      if (journey.employee_id) {
        const { data: account } = await client.auth.admin.getUserById(journey.employee_id);
        professionalEmail = account.user?.email ?? null;
      }

      let managerEmail: string | null = null;
      let managerName: string | null = null;
      if (journey.manager_id) {
        const { data: account } = await client.auth.admin.getUserById(journey.manager_id);
        managerEmail = account.user?.email ?? null;

        const { data: managerProfile } = await client
          .from('profiles')
          .select('full_name')
          .eq('id', journey.manager_id)
          .maybeSingle();
        managerName = managerProfile?.full_name ?? null;
      }

      return {
        companyId: journey.company_id,
        journeyId: journey.id,
        employeeName: journey.employee_name,
        personalEmail: journey.personal_email,
        professionalEmail,
        managerEmail,
        managerName,
        arrivalDate: parsePlainDate(journey.arrival_date),
        welcomeEmailSentAt: journey.welcome_email_sent_at,
      };
    },

    async markWelcomeEmailSent(journeyId: string): Promise<void> {
      const { error } = await client
        .from('journeys')
        .update({ welcome_email_sent_at: new Date().toISOString() })
        .eq('id', journeyId);
      if (error) {
        throw new Error(`Marquage de l'envoi impossible pour ${journeyId} : ${error.message}`);
      }
    },
  };
}
