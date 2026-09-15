import { signOut } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/states';

/**
 * Deux impasses possibles apres une connexion reussie. Chacune dit ce qui se
 * passe et ce qu'il faut faire, au lieu d'afficher une page vide.
 */
export function NoMembership({
  email,
  reason,
}: {
  readonly email: string | null;
  readonly reason: 'no_membership' | 'company_missing';
}) {
  const description =
    reason === 'no_membership'
      ? `Votre compte ${email ?? ''} n'est rattaché à aucune société. Demandez à votre service RH de vous ajouter, puis reconnectez-vous.`
      : "La société rattachée à votre compte est introuvable. Signalez-le à votre service RH : il s'agit d'une anomalie de configuration, pas d'un problème de votre côté.";

  return (
    <EmptyState
      title={reason === 'no_membership' ? 'Aucune société rattachée' : 'Société introuvable'}
      description={description}
      action={
        <form action={signOut}>
          <Button type="submit" variant="secondary" size="sm">
            Se déconnecter
          </Button>
        </form>
      }
    />
  );
}
