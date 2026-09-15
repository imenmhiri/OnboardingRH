import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { CompanyRefused } from '@/components/company-refused';
import { NoMembership } from '@/components/no-membership';
import { currentSession } from '@/lib/session';

/**
 * Garde commune aux espaces authentifies. Chaque refus a une issue explicite :
 * une page blanche ou une erreur brute laisserait l'utilisateur sans recours.
 */
export default async function AuthenticatedLayout({ children }: { readonly children: ReactNode }) {
  const session = await currentSession();

  if (session.ok) {
    return <AppShell session={session.context}>{children}</AppShell>;
  }

  if (session.failure.reason === 'signed_out') {
    redirect('/connexion');
  }

  return (
    <main id="contenu" className="mx-auto max-w-2xl px-6 py-16">
      {session.failure.reason === 'not_a_member' ? (
        <CompanyRefused />
      ) : (
        <NoMembership
          email={session.failure.reason === 'no_membership' ? session.failure.user.email : null}
          reason={session.failure.reason === 'no_membership' ? 'no_membership' : 'company_missing'}
        />
      )}
    </main>
  );
}
