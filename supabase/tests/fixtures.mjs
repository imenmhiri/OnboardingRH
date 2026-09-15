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

export const MGR_NORD = 'aaaaaaaa-0000-4000-8000-000000000003';
export const EMP_NORD = 'aaaaaaaa-0000-4000-8000-000000000004';
export const EMP2_NORD = 'aaaaaaaa-0000-4000-8000-000000000005';

export const JOURNEY_NORD = 'cccccccc-0000-4000-8000-000000000001';
export const JOURNEY_NORD_2 = 'cccccccc-0000-4000-8000-000000000002';
export const JOURNEY_GULF = 'cccccccc-0000-4000-8000-000000000003';
export const TASK_IT = 'dddddddd-0000-4000-8000-000000000001';
export const TASK_MANAGER = 'dddddddd-0000-4000-8000-000000000002';

/** Deux arrivees chez Atelier Nord, une chez Meridien Gulf. */
export async function installJourneys(db) {
  const people = [
    [MGR_NORD, 'manager@atelier-nord.test', 'Marc Manager', NORD, 'manager'],
    [EMP_NORD, 'arrivant@atelier-nord.test', 'Alice Arrivante', NORD, 'employee'],
    [EMP2_NORD, 'collegue@atelier-nord.test', 'Claire Collegue', NORD, 'employee'],
  ];
  for (const [id, email, name, company, role] of people) {
    await db.query(INSERT_USER, [id, email]);
    await db.query(
      `insert into public.profiles (id, full_name) values ($1, $2) on conflict (id) do nothing`,
      [id, name],
    );
    await db.query(
      `insert into public.company_members (company_id, user_id, role) values ($1, $2, $3)
       on conflict do nothing`,
      [company, id, role],
    );
  }

  const journeys = [
    [JOURNEY_NORD, NORD, EMP_NORD, MGR_NORD, 'Alice Arrivante', '2026-04-07'],
    [JOURNEY_NORD_2, NORD, EMP2_NORD, null, 'Claire Collegue', '2026-04-14'],
    [JOURNEY_GULF, GULF, EMP_GULF, null, 'Emma Employée', '2026-04-07'],
  ];
  for (const [id, company, employee, manager, name, arrival] of journeys) {
    await db.query(
      `insert into public.journeys (id, company_id, employee_id, manager_id, employee_name, arrival_date)
       values ($1, $2, $3, $4, $5, $6) on conflict (id) do nothing`,
      [id, company, employee, manager, name, arrival],
    );
  }

  const tasks = [
    [TASK_IT, NORD, JOURNEY_NORD, 'Créer le compte IT', 'it', null, '2026-04-03'],
    [TASK_MANAGER, NORD, JOURNEY_NORD, 'Préparer le poste de travail', 'manager', MGR_NORD, '2026-04-07'],
  ];
  for (const [id, company, journey, title, role, owner, due] of tasks) {
    await db.query(
      `insert into public.tasks (id, company_id, journey_id, title, owner_role, owner_id, due_on)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do nothing`,
      [id, company, journey, title, role, owner, due],
    );
  }

  await db.query(
    `insert into public.task_dependencies (task_id, depends_on_id) values ($1, $2)
     on conflict do nothing`,
    [TASK_MANAGER, TASK_IT],
  );
}
