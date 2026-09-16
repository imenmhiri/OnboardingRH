import { createClient } from '@supabase/supabase-js';
import { supabaseServiceRoleKey, supabaseUrl } from './env';

/**
 * Client Supabase avec la cle de service : contourne la RLS. Reserve aux
 * entrees systeme sans utilisateur authentifie — un webhook n8n, pas une
 * requete portee par un cookie de session. L'autorisation vient alors du
 * secret partage verifie par la route elle-meme, pas de la RLS.
 */
export function createSupabaseServiceClient() {
  return createClient(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
