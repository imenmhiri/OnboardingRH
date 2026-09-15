import type { AuditEvent, AuditTrail } from '@/application/ports/audit-trail';
import { createSupabaseServerClient } from './server-client';

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Ecrit dans audit_events sans jamais chainer .select() : un membre non-RH a le
 * droit d'inserer mais pas de relire (voir la migration de T-06), et
 * supabase-js ne demande une representation de la ligne inseree — l'equivalent
 * de RETURNING — que si .select() est explicitement chaine.
 */
export function supabaseAuditTrail(client: SupabaseClient): AuditTrail {
  return {
    async record(event: AuditEvent): Promise<void> {
      const { error } = await client.from('audit_events').insert({
        company_id: event.companyId,
        actor_id: event.actorId,
        action: event.action,
        journey_id: event.journeyId ?? null,
        task_id: event.taskId ?? null,
        payload: event.payload ?? {},
      });
      if (error) {
        throw new Error(`Ecriture d'audit impossible pour ${event.action} : ${error.message}`);
      }
    },
  };
}
