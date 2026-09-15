import { cookies } from 'next/headers';
import { loadSessionContext, type SessionResult } from '@/application/use-cases/load-session-context';
import {
  supabaseCompanyDirectory,
  supabaseSessionReader,
} from '@/infrastructure/supabase/company-directory';
import { createSupabaseServerClient } from '@/infrastructure/supabase/server-client';

/** Cookie portant la societe choisie par un utilisateur multi-societes. */
export const ACTIVE_COMPANY_COOKIE = 'onboarding_active_company';

export async function currentSession(): Promise<SessionResult> {
  const client = await createSupabaseServerClient();
  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value ?? null;

  return loadSessionContext(
    supabaseSessionReader(client),
    supabaseCompanyDirectory(client),
    requested,
  );
}
