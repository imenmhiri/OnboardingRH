import { LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { signOut } from '@/app/actions';
import { CompanySwitcher } from '@/components/company-switcher';
import { CompanyBrand } from '@/components/company-brand';
import { Button } from '@/components/ui/button';
import type { SessionContext } from '@/application/use-cases/load-session-context';

const ROLE_LABELS = {
  hr_admin: 'Ressources humaines',
  manager: 'Manager',
  it: 'Informatique',
  employee: 'Employé',
} as const;

/**
 * En-tete commun aux espaces authentifies. La marque vient de la societe active :
 * basculer de societe repeint l'application sans qu'aucun composant ne connaisse
 * le nom d'une filiale.
 */
export function AppShell({ session, children }: { readonly session: SessionContext; readonly children: ReactNode }) {
  const { membership, branding, memberships, canSwitch, user } = session;

  return (
    <CompanyBrand branding={branding} className="min-h-dvh bg-surface">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-[var(--radius)] bg-brand font-display text-sm text-brand-text"
            >
              {membership.companyName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              {/* Un nom de societe long ne doit pas casser l'en-tete. */}
              <p className="truncate font-display text-base leading-tight text-text">
                {membership.companyName}
              </p>
              <p className="text-xs text-text-muted">{ROLE_LABELS[membership.role]}</p>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {canSwitch ? <CompanySwitcher memberships={memberships} active={membership} /> : null}
            <p className="hidden text-sm text-text-muted sm:block">{user.fullName ?? user.email}</p>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut aria-hidden className="size-4" />
                Se déconnecter
              </Button>
            </form>
          </div>
        </div>
      </header>

      <main id="contenu" className="mx-auto max-w-6xl px-6 py-10">
        {children}
      </main>
    </CompanyBrand>
  );
}
