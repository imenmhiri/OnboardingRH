import { FileStack, Users } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CreateTemplateDialog } from './create-template-dialog';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { canAccess } from '@/domain/companies/access';
import { listJourneyTemplates } from '@/application/use-cases/manage-journey-templates';
import { supabaseTemplateRepository } from '@/infrastructure/supabase/template-repository';
import { supabaseSiteDirectory } from '@/infrastructure/supabase/site-directory';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Créateur de parcours — OnboardingRH' };

function criteriaLabel(criteria: { jobFamily: string | null; siteId: string | null; contractType: string | null }): string {
  const parts = [criteria.jobFamily, criteria.contractType].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Tous métiers, tous contrats';
}

export default async function JourneyTemplatesPage() {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }
  if (!canAccess(session.context.membership.role, 'journey_builder')) {
    redirect('/');
  }

  const client = await createSupabaseServerClient();
  const repository = supabaseTemplateRepository(client);
  const siteDirectory = supabaseSiteDirectory(client);

  let templates: Awaited<ReturnType<typeof listJourneyTemplates>>;
  try {
    templates = await listJourneyTemplates(repository, session.context.membership.companyId);
  } catch {
    return (
      <div className="space-y-8">
        <PageHeader />
        <ErrorState description="Impossible de charger les templates pour le moment. Réessayez dans un instant." />
      </div>
    );
  }
  const sites = await siteDirectory.listByCompany(session.context.membership.companyId);

  return (
    <div className="space-y-8">
      <PageHeader action={<CreateTemplateDialog sites={sites} />} />

      {templates.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              title="Aucun template pour le moment"
              description="Créez un premier parcours : ses tâches seront proposées à chaque embauche correspondant à ses critères."
              action={<CreateTemplateDialog sites={sites} />}
            />
          </CardBody>
        </Card>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {templates.map((template) => (
            <li key={template.id}>
              <Link
                href={`/parcours/${template.id}`}
                className="block h-full rounded-[calc(var(--radius)+2px)] border border-border bg-surface-raised p-5 shadow-card transition-colors hover:border-border-strong"
              >
                <p className="font-display text-lg text-text">{template.name}</p>
                <p className="mt-1 text-sm text-text-muted">{criteriaLabel(template.criteria)}</p>
                <p className="mt-3 flex items-center gap-1.5 text-sm text-text-subtle">
                  <FileStack aria-hidden className="size-4" />
                  {template.taskCount} {template.taskCount > 1 ? 'tâches' : 'tâche'}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PageHeader({ action }: { readonly action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <h1 className="flex items-center gap-2 font-display text-3xl tracking-tight text-text">
          <Users aria-hidden className="size-7 text-brand" />
          Créateur de parcours
        </h1>
        <p className="max-w-2xl text-text-muted">
          Décrivez le parcours d’intégration une fois ; il s’appliquera à chaque embauche correspondant
          à ses critères.
        </p>
      </div>
      {action}
    </header>
  );
}
