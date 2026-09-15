import { redirect } from 'next/navigation';
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

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl tracking-tight text-text">Cockpit RH</h1>
        <p className="text-text-muted">
          Arrivées à venir, tâches bloquées et satisfaction, pour {session.context.membership.companyName}.
        </p>
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
