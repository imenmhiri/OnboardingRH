import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAnonKey, supabaseUrl } from './env';

/**
 * Client Supabase cote serveur, porte par les cookies de la requete. On utilise
 * toujours la cle anonyme : l'autorisation vient de la RLS, jamais d'une cle de
 * service qui la contournerait.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Appele depuis un Server Component : le rafraichissement de session
          // est alors fait par le middleware, on peut ignorer.
        }
      },
    },
  });
}
