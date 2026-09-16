import { LayoutDashboard } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { markGroupOrdered, transitionRequest } from './actions';
import { AssignEquipmentDialog } from './assign-equipment-dialog';
import { RequestEquipmentDialog } from './request-equipment-dialog';
import type { CatalogItemRow, EquipmentRequestRow, JourneyRow } from './types';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { StatusBadge, type StatusTone } from '@/components/ui/status';
import { canAccess } from '@/domain/companies/access';
import { groupRequestsForOrder } from '@/domain/equipment/order-grouping';
import type { EquipmentRequest, EquipmentStatus } from '@/domain/equipment/equipment';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Matériel — OnboardingRH' };

const STATUS_LABEL: Record<EquipmentStatus, string> = {
  requested: 'Demandé',
  ordered: 'Commandé',
  assigned: 'Attribué',
  handed_over: 'Remis',
  acknowledged: 'Accusé reçu',
  returned: 'Retourné',
  cancelled: 'Annulée',
};

const STATUS_TONE: Record<EquipmentStatus, StatusTone> = {
  requested: 'warning',
  ordered: 'progress',
  assigned: 'progress',
  handed_over: 'danger',
  acknowledged: 'success',
  returned: 'neutral',
  cancelled: 'cancelled',
};

const ERROR_MESSAGES: Record<string, string> = {
  parcours_requis: 'Choisissez un parcours avant de valider la demande.',
  selection_vide: 'Choisissez au moins un article du catalogue avant de valider.',
  transition_refusee: 'Cette action n’est plus possible dans l’état actuel de la demande. Rechargez la page.',
};

export default async function MaterielPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ erreur?: string }>;
}) {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }
  if (!canAccess(session.context.membership.role, 'equipment')) {
    redirect('/portail');
  }
  const { companyId, companyName } = session.context.membership;
  const canViewCockpit = canAccess(session.context.membership.role, 'cockpit');
  const { erreur } = await searchParams;

  const client = await createSupabaseServerClient();

  const [
    { data: journeyRows, error: journeysError },
    { data: catalogRows, error: catalogError },
    { data: equipmentRows, error: equipmentError },
  ] = await Promise.all([
    client
      .from('journeys')
      .select('id, employee_name, arrival_date, site_id, status')
      .eq('company_id', companyId)
      .in('status', ['scheduled', 'in_progress'])
      .order('arrival_date'),
    client
      .from('equipment_catalog_items')
      .select('id, name, category')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('name'),
    client
      .from('equipment_requests')
      .select('id, journey_id, task_id, catalog_item_id, status, unit_reference')
      .eq('company_id', companyId),
  ]);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-3xl tracking-tight text-text">Matériel</h1>
          <p className="text-text-muted">
            Demandes, préparation et remise du matériel pour {companyName}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canViewCockpit ? (
            <Button asChild variant="secondary">
              <Link href="/cockpit">
                <LayoutDashboard aria-hidden className="size-4" />
                Cockpit RH
              </Link>
            </Button>
          ) : null}
          {journeyRows && catalogRows ? (
            <RequestEquipmentDialog
              journeys={journeyRows as JourneyRow[]}
              catalogItems={catalogRows as CatalogItemRow[]}
            />
          ) : null}
        </div>
      </header>

      {erreur && ERROR_MESSAGES[erreur] ? (
        <p role="alert" className="rounded-[var(--radius)] bg-danger-soft px-4 py-3 text-sm text-danger">
          {ERROR_MESSAGES[erreur]}
        </p>
      ) : null}

      {journeysError || catalogError || equipmentError ? (
        <Card>
          <CardBody>
            <ErrorState description="Impossible de charger le matériel pour le moment. Réessayez dans un instant." />
          </CardBody>
        </Card>
      ) : (
        <MaterielContent
          journeys={(journeyRows ?? []) as JourneyRow[]}
          catalogItems={(catalogRows ?? []) as CatalogItemRow[]}
          equipmentRequests={(equipmentRows ?? []) as EquipmentRequestRow[]}
          companyId={companyId}
        />
      )}
    </div>
  );
}

function MaterielContent({
  journeys,
  catalogItems,
  equipmentRequests,
  companyId,
}: {
  readonly journeys: readonly JourneyRow[];
  readonly catalogItems: readonly CatalogItemRow[];
  readonly equipmentRequests: readonly EquipmentRequestRow[];
  readonly companyId: string;
}) {
  const journeyById = new Map(journeys.map((journey) => [journey.id, journey]));
  const catalogNameById = new Map(catalogItems.map((item) => [item.id, item.name]));

  const domainRequests: EquipmentRequest[] = equipmentRequests.map((row) => ({
    id: row.id,
    companyId,
    journeyId: row.journey_id,
    taskId: row.task_id,
    catalogItemId: row.catalog_item_id,
    status: row.status,
  }));

  const orderGroups = groupRequestsForOrder(domainRequests).map((group) => ({
    ...group,
    catalogName: catalogNameById.get(group.catalogItemId) ?? 'Matériel',
    employeeNames: group.journeyIds.map((id) => journeyById.get(id)?.employee_name).filter((name): name is string => Boolean(name)),
  }));

  // La file ne montre que ce qui reste a preparer ; une demande reglee (accusee,
  // retournee, annulee) n'a plus rien a faire preparer par l'IT ou la RH.
  const openRequests = equipmentRequests.filter(
    (row) => row.status !== 'acknowledged' && row.status !== 'returned' && row.status !== 'cancelled',
  );
  const requestsByJourney = new Map<string, EquipmentRequestRow[]>();
  for (const request of openRequests) {
    if (!journeyById.has(request.journey_id)) continue;
    requestsByJourney.set(request.journey_id, [...(requestsByJourney.get(request.journey_id) ?? []), request]);
  }
  const journeysWithOpenRequests = journeys.filter((journey) => (requestsByJourney.get(journey.id) ?? []).length > 0);

  return (
    <>
      <Card>
        <CardHeader
          title="Commandes à grouper"
          description="Même modèle demandé pour plusieurs arrivées : une seule commande à passer."
        />
        <CardBody>
          {orderGroups.length === 0 ? (
            <EmptyState
              title="Rien à commander"
              description="Aucune demande en attente de commande pour le moment."
            />
          ) : (
            <ul className="space-y-3">
              {orderGroups.map((group) => (
                <li
                  key={`${group.catalogItemId}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-border p-4"
                >
                  <div>
                    <p className="font-medium text-text">
                      {group.catalogName} <span className="font-normal text-text-muted">× {group.quantity}</span>
                    </p>
                    <p className="text-sm text-text-muted">
                      Pour {group.employeeNames.join(', ') || 'des arrivées à préciser'}
                    </p>
                  </div>
                  <form action={markGroupOrdered.bind(null, group.requestIds)}>
                    <Button type="submit" variant="secondary" size="sm">
                      Marquer commandé
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="File de préparation, par arrivée"
          description="Ce qu'il reste à attribuer, remettre ou faire confirmer avant chaque échéance."
        />
        <CardBody>
          {journeysWithOpenRequests.length === 0 ? (
            <EmptyState
              title="Tout est prêt"
              description="Aucun matériel en attente de préparation pour une arrivée à venir."
            />
          ) : (
            <ul className="space-y-4">
              {journeysWithOpenRequests.map((journey) => (
                <li key={journey.id} className="rounded-[var(--radius)] border border-border p-4">
                  <p className="font-medium text-text">
                    {journey.employee_name}{' '}
                    <span className="font-normal text-text-muted">— échéance le {journey.arrival_date}</span>
                  </p>
                  <ul className="mt-3 space-y-2">
                    {(requestsByJourney.get(journey.id) ?? []).map((request) => (
                      <li
                        key={request.id}
                        className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-2 text-sm first:border-t-0 first:pt-0"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-text">{catalogNameById.get(request.catalog_item_id) ?? 'Matériel'}</span>
                          {request.unit_reference ? (
                            <span className="text-text-muted">({request.unit_reference})</span>
                          ) : null}
                          <StatusBadge tone={STATUS_TONE[request.status]} label={STATUS_LABEL[request.status]} />
                        </div>
                        <RequestActions request={request} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function RequestActions({ request }: { readonly request: EquipmentRequestRow }) {
  switch (request.status) {
    case 'requested':
      return <span className="text-xs text-text-muted">À grouper dans une commande ci-dessus</span>;
    case 'ordered':
      return <AssignEquipmentDialog requestId={request.id} itemLabel="ce matériel" />;
    case 'assigned':
      return (
        <div className="flex flex-wrap gap-2">
          <form action={transitionRequest.bind(null, request.id, 'handed_over')}>
            <Button type="submit" size="sm">
              Remettre
            </Button>
          </form>
          <form action={transitionRequest.bind(null, request.id, 'requested')}>
            <Button type="submit" variant="ghost" size="sm">
              Reprendre l’attribution
            </Button>
          </form>
        </div>
      );
    case 'handed_over':
      return <span className="text-xs text-text-muted">En attente de l’accusé de réception par l’employé</span>;
    default:
      return null;
  }
}
