import { Building2, Check } from 'lucide-react';
import { switchCompany } from '@/app/actions';
import type { Membership } from '@/domain/companies/access';

/**
 * Bascule entre les societes dont l'utilisateur est membre. Un simple formulaire :
 * le changement doit survivre a l'absence de JavaScript, et le cookie est pose
 * cote serveur apres verification de l'appartenance.
 */
export function CompanySwitcher({
  memberships,
  active,
}: {
  readonly memberships: readonly Membership[];
  readonly active: Membership;
}) {
  return (
    <form action={switchCompany} className="flex items-center gap-2">
      <label htmlFor="company-switcher" className="sr-only">
        Société active
      </label>
      <div className="relative flex items-center">
        <Building2 aria-hidden className="pointer-events-none absolute left-2.5 size-4 text-text-muted" />
        <select
          id="company-switcher"
          name="companyId"
          defaultValue={active.companyId}
          className="h-9 appearance-none rounded-[var(--radius)] border border-border bg-surface-raised py-0 pl-8 pr-3 text-sm text-text hover:border-border-strong"
        >
          {memberships.map((membership) => (
            <option key={membership.companyId} value={membership.companyId}>
              {membership.companyName}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-border px-3 text-sm font-medium text-text hover:bg-surface-sunken"
      >
        <Check aria-hidden className="size-4" />
        Changer
      </button>
    </form>
  );
}
