import { resetActiveCompany } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

/**
 * La societe demandee n'est pas une des notres : URL ou cookie forge, ou
 * appartenance retiree depuis la derniere visite. On le dit, plutot que de
 * rebasculer en silence sur une autre societe.
 */
export function CompanyRefused() {
  return (
    <div className="space-y-4">
      <ErrorState
        title="Société non autorisée"
        description="Vous n’êtes pas membre de la société demandée. Elle a pu vous être retirée depuis votre dernière visite."
      />
      <form action={resetActiveCompany} className="flex justify-center">
        <Button type="submit" variant="secondary" size="sm">
          Revenir à ma société
        </Button>
      </form>
    </div>
  );
}
