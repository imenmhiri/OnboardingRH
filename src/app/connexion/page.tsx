import { redirect } from 'next/navigation';
import { SignInForm } from '@/components/sign-in-form';
import { currentSession } from '@/lib/session';

export const metadata = { title: 'Connexion — OnboardingRH' };

export default async function SignInPage() {
  const session = await currentSession();
  if (session.ok) {
    redirect('/');
  }

  return (
    <main id="contenu" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-16">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-text-subtle">OnboardingRH</p>
        <h1 className="font-display text-3xl leading-tight tracking-tight text-text">
          Votre intégration, au même endroit.
        </h1>
        <p className="text-text-muted">
          Connectez-vous pour retrouver votre parcours, vos tâches et vos documents.
        </p>
      </div>
      <SignInForm />
    </main>
  );
}
