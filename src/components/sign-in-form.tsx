'use client';

import { useActionState } from 'react';
import { signIn, type SignInState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

const INITIAL: SignInState = { error: null };

export function SignInForm() {
  const [state, action, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={action} className="space-y-5">
      <Field label="Adresse email" required>
        <Input name="email" type="email" autoComplete="email" required placeholder="prenom.nom@societe.fr" />
      </Field>
      <Field label="Mot de passe" required>
        <Input name="password" type="password" autoComplete="current-password" required />
      </Field>

      {state.error ? (
        // role="alert" : l'echec de connexion doit etre annonce, pas seulement affiche.
        <p role="alert" className="rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" loading={pending} className="w-full">
        Se connecter
      </Button>
    </form>
  );
}
