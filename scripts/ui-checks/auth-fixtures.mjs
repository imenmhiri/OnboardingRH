/**
 * Cree trois comptes de verification dans la stack Supabase locale, via la cle de
 * service (donc hors RLS). Ce n'est pas le jeu de demonstration (T-08) : juste de
 * quoi eprouver la connexion, la bascule de societe et le compte sans societe.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const index = line.indexOf('=');
      return [line.slice(0, index), line.slice(index + 1)];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const NORD = '11111111-1111-4111-8111-111111111111';
const GULF = '22222222-2222-4222-8222-222222222222';

export const ACCOUNTS = {
  hr: { email: 'rachel@atelier-nord.test', password: 'MotDePasse!2026', name: 'Rachel Renard' },
  multi: { email: 'nadia@groupe.test', password: 'MotDePasse!2026', name: 'Nadia Nour' },
  orphan: { email: 'sans-societe@groupe.test', password: 'MotDePasse!2026', name: 'Olivier Orphelin' },
};

const MEMBERSHIPS = {
  hr: [[NORD, 'hr_admin']],
  // Membre des deux filiales, avec un role different dans chacune.
  multi: [[NORD, 'manager'], [GULF, 'employee']],
  orphan: [],
};

async function ensureUser({ email, password, name }) {
  const { data: list } = await admin.auth.admin.listUsers();
  const existing = list?.users.find((user) => user.email === email);
  if (existing) {
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
  });
  if (error) {
    throw new Error(`Creation de ${email} impossible : ${error.message}`);
  }
  return data.user.id;
}

export async function installAccounts() {
  for (const [key, account] of Object.entries(ACCOUNTS)) {
    const userId = await ensureUser(account);
    await admin.from('profiles').upsert({ id: userId, full_name: account.name });
    for (const [companyId, role] of MEMBERSHIPS[key]) {
      await admin.from('company_members').upsert({ company_id: companyId, user_id: userId, role });
    }
  }
}

if (process.argv[1]?.endsWith('auth-fixtures.mjs')) {
  await installAccounts();
  console.log('Comptes de verification installes.');
}
