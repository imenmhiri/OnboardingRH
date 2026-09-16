'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requestEquipment } from '@/application/use-cases/request-equipment';
import {
  transitionEquipmentRequest,
  type TransitionEquipmentRequestResult,
} from '@/application/use-cases/transition-equipment-request';
import { canAccess } from '@/domain/companies/access';
import type { EquipmentStatus } from '@/domain/equipment/equipment';
import { supabaseAuditTrail } from '@/infrastructure/supabase/audit-trail';
import { supabaseEquipmentRepository } from '@/infrastructure/supabase/equipment-requests';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import { currentSession } from '@/lib/session';

/**
 * Garde commune : la RH et l'IT seules atteignent cet ecran. La RLS refuserait
 * de toute facon l'ecriture, mais un refus explicite evite un aller-retour
 * reseau pour rien et nomme la raison.
 */
async function requireEquipmentAccess() {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }
  if (!canAccess(session.context.membership.role, 'equipment')) {
    redirect('/portail');
  }
  return session.context;
}

function ports(client: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  return {
    repository: supabaseEquipmentRepository(client),
    audit: supabaseAuditTrail(client),
  };
}

export async function createEquipmentRequest(formData: FormData): Promise<void> {
  const session = await requireEquipmentAccess();
  const journeyId = String(formData.get('journeyId') ?? '').trim();
  const catalogItemIds = formData.getAll('catalogItemIds').map(String);

  if (!journeyId) {
    redirect('/materiel?erreur=parcours_requis');
  }

  const client = await createSupabaseServerClient();
  const result = await requestEquipment(ports(client), {
    companyId: session.membership.companyId,
    journeyId,
    taskId: null,
    catalogItemIds,
    requestedBy: session.user.id,
  });

  if (!result.ok) {
    redirect('/materiel?erreur=selection_vide');
  }

  revalidatePath('/materiel');
  redirect('/materiel');
}

function redirectOnRefusal(result: TransitionEquipmentRequestResult): void {
  if (!result.ok) {
    redirect('/materiel?erreur=transition_refusee');
  }
}

/** Une transition sans donnee supplementaire : commander, remettre, reprendre, annuler. */
export async function transitionRequest(requestId: string, to: EquipmentStatus): Promise<void> {
  const session = await requireEquipmentAccess();
  const client = await createSupabaseServerClient();
  const result = await transitionEquipmentRequest(ports(client), {
    requestId,
    to,
    actorId: session.user.id,
  });
  redirectOnRefusal(result);

  revalidatePath('/materiel');
  redirect('/materiel');
}

/** Marque commandee une commande groupee : meme modele, plusieurs arrivees. */
export async function markGroupOrdered(requestIds: readonly string[]): Promise<void> {
  const session = await requireEquipmentAccess();
  const client = await createSupabaseServerClient();
  const equipmentPorts = ports(client);

  for (const requestId of requestIds) {
    const result = await transitionEquipmentRequest(equipmentPorts, {
      requestId,
      to: 'ordered',
      actorId: session.user.id,
    });
    redirectOnRefusal(result);
  }

  revalidatePath('/materiel');
  redirect('/materiel');
}

export interface AssignState {
  readonly error: string | null;
}

export async function assignEquipment(
  requestId: string,
  _previous: AssignState,
  formData: FormData,
): Promise<AssignState> {
  const session = await requireEquipmentAccess();
  const unitReference = String(formData.get('unitReference') ?? '').trim();
  if (!unitReference) {
    return { error: 'Indiquez un numéro de série ou de badge.' };
  }

  const client = await createSupabaseServerClient();
  const result = await transitionEquipmentRequest(ports(client), {
    requestId,
    to: 'assigned',
    actorId: session.user.id,
    unitReference,
  });

  if (!result.ok) {
    return {
      error:
        result.reason === 'not_found'
          ? 'Cette demande n’existe plus.'
          : 'Cette attribution n’est plus possible dans l’état actuel de la demande.',
    };
  }

  revalidatePath('/materiel');
  return { error: null };
}
