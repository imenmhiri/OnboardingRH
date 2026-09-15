'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';
import { ACTIVE_COMPANY_COOKIE, currentSession } from '@/lib/session';

export interface SignInState {
  readonly error: string | null;
}

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Renseignez votre adresse et votre mot de passe.' };
  }

  const client = await createSupabaseServerClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    // Message volontairement identique pour un compte inconnu et un mot de passe
    // faux : distinguer les deux dirait a un inconnu qui travaille ici.
    return { error: 'Adresse ou mot de passe incorrect.' };
  }

  // Une nouvelle connexion ne doit pas heriter de la societe choisie par la
  // session precedente sur ce navigateur.
  (await cookies()).delete(ACTIVE_COMPANY_COOKIE);

  // La session ecrite a l'instant n'est pas encore relisible dans cette requete :
  // la racine se chargera d'aiguiller selon le role.
  redirect('/');
}

export async function signOut(): Promise<void> {
  const client = await createSupabaseServerClient();
  await client.auth.signOut();
  (await cookies()).delete(ACTIVE_COMPANY_COOKIE);
  redirect('/connexion');
}

export async function switchCompany(formData: FormData): Promise<void> {
  const companyId = String(formData.get('companyId') ?? '');
  const session = await currentSession();
  // On ne pose le cookie que si l'appartenance existe : la RLS refuserait de
  // toute facon, mais autant ne pas laisser un etat impossible dans le navigateur.
  const allowed =
    session.ok && session.context.memberships.some((membership) => membership.companyId === companyId);

  if (allowed) {
    (await cookies()).set(ACTIVE_COMPANY_COOKIE, companyId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });
  }
  redirect('/');
}

/**
 * Efface la societe active. Une action serveur peut ecrire un cookie, ce qu'un
 * Server Component ne peut pas faire pendant son rendu : c'est pour cela que le
 * refus s'affiche et se resout sur un geste, au lieu de rediriger en boucle.
 */
export async function resetActiveCompany(): Promise<void> {
  (await cookies()).delete(ACTIVE_COMPANY_COOKIE);
  redirect('/');
}
