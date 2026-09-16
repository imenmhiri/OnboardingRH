import { redirect } from 'next/navigation';
import { AcknowledgeEquipmentButton } from './acknowledge-equipment-button';
import { DocumentLinkButton } from './document-link-button';
import { DocumentUploadDialog } from './document-upload-dialog';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { StatusBadge } from '@/components/ui/status';
import { isAwaitingAcknowledgement, type EquipmentStatus } from '@/domain/equipment/equipment';
import { addCalendarDays, comparePlainDates, parsePlainDate } from '@/domain/scheduling/plain-date';
import type { OwnerRole, TaskStatus } from '@/domain/tasks/task';
import { supabaseTaskDocumentRepository } from '@/infrastructure/supabase/task-documents';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Mon intégration — OnboardingRH' };

const ROLE_LABELS: Record<OwnerRole, string> = {
  hr_admin: 'Ressources humaines',
  manager: 'Manager',
  it: 'Informatique',
  employee: 'Employé',
};

const STATUS_TONE: Record<TaskStatus, 'neutral' | 'progress' | 'success' | 'cancelled'> = {
  pending: 'neutral',
  in_progress: 'progress',
  done: 'success',
  cancelled: 'cancelled',
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: 'À faire',
  in_progress: 'En cours',
  done: 'Faite',
  cancelled: 'Annulée',
};

interface JourneyRow {
  id: string;
  company_id: string;
  arrival_date: string;
  end_date: string | null;
  status: string;
  manager_id: string | null;
}

interface TaskRow {
  id: string;
  title: string;
  owner_role: OwnerRole;
  owner_id: string | null;
  status: TaskStatus;
  due_on: string;
  expected_document: string | null;
}

interface EquipmentRequestRow {
  id: string;
  task_id: string | null;
  catalog_item_id: string;
  status: EquipmentStatus;
}

export default async function PortalPage() {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }
  const { user, membership } = session.context;

  const client = await createSupabaseServerClient();
  const { data: journeyRow } = await client
    .from('journeys')
    .select('id, company_id, arrival_date, end_date, status, manager_id')
    .eq('employee_id', user.id)
    .maybeSingle();
  const journey = journeyRow as JourneyRow | null;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wide text-text-subtle">
          {membership.companyName}
        </p>
        <h1 className="font-display text-3xl tracking-tight text-text">
          Bienvenue{user.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}.
        </h1>
        <p className="max-w-2xl text-text-muted">
          Vous retrouverez ici vos documents, vos contacts et l’agenda de votre première semaine.
        </p>
      </header>

      {!journey ? (
        <Card>
          <CardHeader title="Mon parcours" description="Progression de votre intégration." />
          <CardBody>
            <EmptyState
              title="Votre parcours n’est pas encore ouvert"
              description="Il apparaîtra dès que votre arrivée sera enregistrée par votre service RH."
            />
          </CardBody>
        </Card>
      ) : (
        <JourneyContent journeyId={journey.id} arrivalDate={journey.arrival_date} employeeId={user.id} managerId={journey.manager_id} companyId={journey.company_id} />
      )}
    </div>
  );
}

async function JourneyContent({
  journeyId,
  arrivalDate,
  employeeId,
  managerId,
  companyId,
}: {
  readonly journeyId: string;
  readonly arrivalDate: string;
  readonly employeeId: string;
  readonly managerId: string | null;
  readonly companyId: string;
}) {
  const client = await createSupabaseServerClient();

  const [{ data: taskRows }, documents, { data: managerProfile }, { data: staffMembers }, { data: equipmentRows }] =
    await Promise.all([
      client
        .from('tasks')
        .select('id, title, owner_role, owner_id, status, due_on, expected_document')
        .eq('journey_id', journeyId)
        .order('due_on'),
      supabaseTaskDocumentRepository(client).listByJourney(journeyId),
      managerId
        ? client.from('profiles').select('full_name').eq('id', managerId).maybeSingle()
        : Promise.resolve({ data: null }),
      client
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', companyId)
        .in('role', ['hr_admin', 'it']),
      client
        .from('equipment_requests')
        .select('id, task_id, catalog_item_id, status')
        .eq('journey_id', journeyId),
    ]);

  const tasks = (taskRows ?? []) as TaskRow[];
  // Un document deja atteint pour une tache ne signifie pas que l employe l a
  // fourni : la RH peut y avoir attache une piece de reference a lire. Seul un
  // document qu il a lui-meme depose leve le besoin de le fournir.
  const providedByEmployee = new Set(
    documents.filter((doc) => doc.uploadedBy === employeeId).map((doc) => doc.taskId),
  );

  // Requete separee plutot qu'une jointure imbriquee : la forme d'un embed
  // Supabase (objet ou tableau) depend de contraintes de schema que le typage
  // local ne connait pas, et une jointure mal typee vaut mieux evitee que
  // devinee.
  const staff = (staffMembers ?? []) as { user_id: string; role: OwnerRole }[];
  const { data: staffProfiles } = staff.length
    ? await client.from('profiles').select('id, full_name').in('id', staff.map((m) => m.user_id))
    : { data: [] as { id: string; full_name: string }[] };
  const staffNameById = new Map((staffProfiles ?? []).map((p) => [p.id, p.full_name]));

  const done = tasks.filter((t) => t.status === 'done').length;
  const progressPercent = tasks.length > 0 ? Math.round((done / tasks.length) * 100) : 0;

  const arrival = parsePlainDate(arrivalDate);
  const weekEnd = addCalendarDays(arrival, 7);
  const firstWeekTasks = tasks.filter(
    (t) => comparePlainDates(parsePlainDate(t.due_on), arrival) >= 0 && comparePlainDates(parsePlainDate(t.due_on), weekEnd) <= 0,
  );

  const myOpenTasksNeedingDocument = tasks.filter(
    (t) => t.owner_id === employeeId && t.expected_document !== null && !providedByEmployee.has(t.id),
  );
  const documentsToRead = documents.filter((doc) => doc.uploadedBy !== employeeId);

  const equipmentToAcknowledge = (equipmentRows ?? []).filter((row: EquipmentRequestRow) =>
    isAwaitingAcknowledgement({
      id: row.id,
      companyId,
      journeyId,
      taskId: row.task_id,
      catalogItemId: row.catalog_item_id,
      status: row.status,
    }),
  );
  const equipmentCatalogIds = [...new Set(equipmentToAcknowledge.map((row: EquipmentRequestRow) => row.catalog_item_id))];
  const { data: equipmentCatalogRows } = equipmentCatalogIds.length
    ? await client.from('equipment_catalog_items').select('id, name').in('id', equipmentCatalogIds)
    : { data: [] as { id: string; name: string }[] };
  const equipmentNameById = new Map((equipmentCatalogRows ?? []).map((row) => [row.id, row.name]));

  const contacts = [
    ...(managerProfile ? [{ name: managerProfile.full_name, role: 'manager' as const }] : []),
    ...staff
      .map((m) => ({ name: staffNameById.get(m.user_id), role: m.role }))
      .filter((c): c is { name: string; role: OwnerRole } => Boolean(c.name)),
  ];

  return (
    <>
      <Card>
        <CardHeader
          title="Mon parcours"
          description={`${done} tâche${done > 1 ? 's' : ''} sur ${tasks.length} terminée${done > 1 ? 's' : ''}.`}
        />
        <CardBody className="space-y-4">
          <div
            role="progressbar"
            aria-valuenow={progressPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progression de mon intégration"
            className="h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken"
          >
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progressPercent}%` }} />
          </div>
          {tasks.length === 0 ? (
            <EmptyState title="Aucune étape pour le moment" description="Les prochaines étapes de votre intégration apparaîtront ici." />
          ) : (
            <ul className="space-y-2">
              {tasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2 text-sm">
                  <span className="text-text">{task.title}</span>
                  <StatusBadge tone={STATUS_TONE[task.status]} label={STATUS_LABEL[task.status]} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Agenda de ma première semaine" description={`Du ${arrivalDate} au ${weekEnd}.`} />
        <CardBody>
          {firstWeekTasks.length === 0 ? (
            <EmptyState title="Rien de prévu pour l’instant" description="Votre agenda se remplira à l’approche de votre arrivée." />
          ) : (
            <ul className="space-y-2">
              {firstWeekTasks.map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text">{task.title}</span>
                  <span className="text-text-muted">{task.due_on}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Mes documents" description="Ce que vous devez lire, et ce que vous devez fournir." />
        <CardBody className="space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-text">À lire</h3>
            {documentsToRead.length === 0 ? (
              <p className="text-sm text-text-muted">Aucun document à lire pour le moment.</p>
            ) : (
              <ul className="space-y-2">
                {documentsToRead.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2 text-sm">
                    <span className="text-text">{doc.fileName}</span>
                    <DocumentLinkButton documentId={doc.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-text">À fournir</h3>
            {myOpenTasksNeedingDocument.length === 0 ? (
              <p className="text-sm text-text-muted">Aucune pièce à fournir pour le moment.</p>
            ) : (
              <ul className="space-y-2">
                {myOpenTasksNeedingDocument.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2 text-sm">
                    <span className="text-text">{task.expected_document}</span>
                    <DocumentUploadDialog taskId={task.id} journeyId={journeyId} label={task.expected_document ?? ''} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Mon matériel"
          description="Ce qui vous a été remis et attend votre confirmation."
        />
        <CardBody>
          {equipmentToAcknowledge.length === 0 ? (
            <EmptyState
              title="Rien à confirmer pour le moment"
              description="Le matériel qui vous sera remis apparaîtra ici pour confirmation."
            />
          ) : (
            <ul className="space-y-2">
              {equipmentToAcknowledge.map((request: EquipmentRequestRow) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-border px-3 py-2 text-sm"
                >
                  <span className="text-text">
                    {equipmentNameById.get(request.catalog_item_id) ?? 'Matériel'}
                  </span>
                  <AcknowledgeEquipmentButton
                    requestId={request.id}
                    itemName={equipmentNameById.get(request.catalog_item_id) ?? 'ce matériel'}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Contacts utiles" />
        <CardBody>
          {contacts.length === 0 ? (
            <p className="text-sm text-text-muted">Aucun contact renseigné pour le moment.</p>
          ) : (
            <ul className="space-y-2">
              {contacts.map((contact, index) => (
                <li key={index} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-text">{contact.name}</span>
                  <span className="text-text-muted">{ROLE_LABELS[contact.role]}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}
