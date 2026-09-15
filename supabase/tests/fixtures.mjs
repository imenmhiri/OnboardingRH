import pg from 'pg';

export const NORD = '11111111-1111-4111-8111-111111111111';
export const GULF = '22222222-2222-4222-8222-222222222222';
export const SITE_LILLE = 'a1111111-1111-4111-8111-111111111111';
export const RH_NORD = 'aaaaaaaa-0000-4000-8000-000000000001';
export const IT_NORD = 'aaaaaaaa-0000-4000-8000-000000000002';
export const EMP_GULF = 'bbbbbbbb-0000-4000-8000-000000000001';

export function client() {
  return new pg.Client({
    host: '127.0.0.1',
    port: 54322,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });
}

// GoTrue exige ces colonnes non nulles. Laissees a NULL, elles cassent l'API
// d'administration : listUsers renvoie "Database error finding users", et le
// symptome apparait tres loin d'ici.
const INSERT_USER = `
  insert into auth.users (
    id, instance_id, aud, role, email,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, phone_change, phone_change_token, reauthentication_token,
    encrypted_password, created_at, updated_at
  )
  values (
    $1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2,
    '{}'::jsonb, '{}'::jsonb,
    '', '', '', '', '', '', '', '',
    '', now(), now()
  )
  on conflict (id) do nothing
`;

/** Creates the three test users on top of the demo seed. */
export async function installUsers(db) {
  const users = [
    [RH_NORD, 'rh@atelier-nord.test', 'Rachel RH', NORD, 'hr_admin'],
    [IT_NORD, 'it@atelier-nord.test', 'Ivan IT', NORD, 'it'],
    [EMP_GULF, 'employe@meridien-gulf.test', 'Emma Employée', GULF, 'employee'],
  ];
  for (const [id, email, name, company, role] of users) {
    await db.query(INSERT_USER, [id, email]);
    await db.query(
      `insert into public.profiles (id, full_name) values ($1, $2)
       on conflict (id) do nothing`,
      [id, name],
    );
    await db.query(
      `insert into public.company_members (company_id, user_id, role) values ($1, $2, $3)
       on conflict do nothing`,
      [company, id, role],
    );
  }
}

/** Runs a query as the given end user, with RLS enforced, then rolls back. */
export async function asUser(db, userId, sql, params = []) {
  await db.query('begin');
  try {
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId, role: 'authenticated' }),
    ]);
    await db.query('set local role authenticated');
    const result = await db.query(sql, params);
    return { ok: true, rows: result.rows, rowCount: result.rowCount };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    await db.query('rollback');
  }
}
