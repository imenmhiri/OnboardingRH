import { redirect } from 'next/navigation';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/states';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Mon intégration — OnboardingRH' };

export default async function PortalPage() {
  const session = await currentSession();
  if (!session.ok) {
    redirect('/connexion');
  }
  const { user, membership } = session.context;

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

      <Card>
        <CardHeader title="Mon parcours" description="Progression de votre intégration." />
        <CardBody>
          <EmptyState
            title="Votre parcours n’est pas encore ouvert"
            description="Il apparaîtra dès que votre arrivée sera enregistrée par votre service RH."
          />
        </CardBody>
      </Card>
    </div>
  );
}
