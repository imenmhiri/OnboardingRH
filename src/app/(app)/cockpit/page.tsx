import { FileStack } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { canAccess } from '@/domain/companies/access';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Cockpit RH — OnboardingRH' };

export default async function CockpitPage() {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }
  // Un role sans acces est renvoye vers son espace, pas laisse devant un refus.
  if (!canAccess(session.context.membership.role, 'cockpit')) {
    redirect('/portail');
  }
  const canBuildJourneys = canAccess(session.context.membership.role, 'journey_builder');

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="font-display text-3xl tracking-tight text-text">Cockpit RH</h1>
          <p className="text-text-muted">
            Arrivées à venir, tâches bloquées et satisfaction, pour {session.context.membership.companyName}.
          </p>
        </div>
        {canBuildJourneys ? (
          <Button asChild variant="secondary">
            <Link href="/parcours">
              <FileStack aria-hidden className="size-4" />
              Créateur de parcours
            </Link>
          </Button>
        ) : null}
      </header>

      <Card>
        <CardHeader title="Arrivées à venir" description="Les quatre prochaines semaines." />
        <CardBody>
          <EmptyState
            title="Aucune arrivée enregistrée"
            description="Les parcours apparaîtront ici dès qu’une embauche sera validée."
          />
        </CardBody>
      </Card>
    </div>
  );
}
