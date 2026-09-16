import { redirect } from 'next/navigation';
import { landingArea } from '@/domain/companies/access';
import { currentSession } from '@/lib/session';

/**
 * Chaque role a sa porte d'entree ; la racine ne fait qu'y conduire. Un compte
 * connecte mais sans societe n'est pas renvoye vers la connexion : il irait s'y
 * reconnecter en boucle. Il entre dans l'espace authentifie, qui lui explique.
 */
export default async function HomePage() {
  const session = await currentSession();

  if (!session.ok) {
    if (session.failure.reason === 'signed_out') {
      redirect('/connexion');
    }
    redirect('/portail');
  }

  const landing = landingArea(session.context.membership.role);
  const path = landing === 'cockpit' ? '/cockpit' : landing === 'equipment' ? '/materiel' : '/portail';
  redirect(path);
}
