/**
 * Prouve que la RLS des parcours tient : un employe ne voit que le sien, un
 * manager ceux de ses rattaches, la RH ceux de sa societe — et l'audit refuse
 * d'etre reecrit.
 */
import {
  asUser,
  client,
  EMP2_NORD,
  EMP_GULF,
  EMP_NORD,
  installJourneys,
  installUsers,
  IT_NORD,
  JOURNEY_NORD,
  MGR_NORD,
  NORD,
  RH_NORD,
  TASK_IT,
  TASK_MANAGER,
} from './fixtures.mjs';

const db = client();
await db.connect();
await installUsers(db);
await installJourneys(db);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

// 1. Un employe ne voit que son parcours.
const mine = await asUser(db, EMP_NORD, 'select id, employee_name from public.journeys');
check(
  'Un employe ne voit que son propre parcours',
  mine.rows?.length === 1 && mine.rows[0].id === JOURNEY_NORD,
  JSON.stringify(mine.rows?.map((r) => r.employee_name) ?? mine.error),
);

// 2. Un collegue de la meme societe reste invisible.
const colleague = await asUser(db, EMP2_NORD, 'select employee_name from public.journeys');
check(
  'Un employe ne voit rien du parcours d un collegue',
  colleague.rows?.length === 1 && colleague.rows[0].employee_name === 'Claire Collegue',
  JSON.stringify(colleague.rows?.map((r) => r.employee_name) ?? colleague.error),
);

// 3. Le manager voit le parcours de son rattache, pas les autres.
const managed = await asUser(db, MGR_NORD, 'select employee_name from public.journeys');
check(
  'Un manager voit ses rattaches, et eux seuls',
  managed.rows?.length === 1 && managed.rows[0].employee_name === 'Alice Arrivante',
  JSON.stringify(managed.rows?.map((r) => r.employee_name) ?? managed.error),
);

// 4. La RH voit toute sa societe, et rien d une autre. On verifie l
// appartenance de chaque ligne, pas leur nombre : le jeu de demonstration
// (T-08) ajoute d autres parcours a la meme societe sans que cela remette la
// policy en cause.
const hr = await asUser(db, RH_NORD, 'select employee_name, company_id from public.journeys');
check(
  'La RH voit les parcours de sa societe, et aucun d une autre',
  hr.rows?.length > 0 && hr.rows.every((row) => row.company_id === NORD),
  JSON.stringify(hr.rows?.map((r) => r.employee_name) ?? hr.error),
);

// 5. Une autre societe ne voit rien.
const gulf = await asUser(db, EMP_GULF, 'select employee_name from public.journeys');
check(
  'Une autre societe ne voit aucun parcours du Nord',
  gulf.rows?.every((row) => row.employee_name === 'Emma Employée'),
  JSON.stringify(gulf.rows?.map((r) => r.employee_name) ?? gulf.error),
);

// 6. L IT voit les taches de son role sans y etre nommement assigne.
const itTasks = await asUser(db, IT_NORD, 'select title, owner_id from public.tasks');
check(
  'L IT voit les taches de son role sans assignation nominative',
  itTasks.rows?.some((row) => row.title.includes('compte IT') && row.owner_id === null),
  JSON.stringify(itTasks.rows?.map((r) => r.title) ?? itTasks.error),
);

// 7. Ecriture : le proprietaire avance sa tache, un tiers non.
const byOwner = await asUser(
  db, MGR_NORD, "update public.tasks set status = 'in_progress' where id = $1 returning id", [TASK_MANAGER],
);
check('Le proprietaire fait avancer sa tache', byOwner.ok && byOwner.rowCount === 1, `rows=${byOwner.rowCount ?? byOwner.error}`);

const byOther = await asUser(
  db, EMP_NORD, "update public.tasks set status = 'done' where id = $1 returning id", [TASK_IT],
);
check('Un tiers ne peut pas avancer une tache qui n est pas la sienne', byOther.ok && byOther.rowCount === 0, `rows=${byOther.rowCount ?? byOther.error}`);

// 8. Audit : insertion permise, relecture reservee, reecriture refusee.
// Sans RETURNING : un membre non-RH n'a pas le droit de relire ce qu'il ecrit.
const audited = await asUser(
  db, MGR_NORD,
  "insert into public.audit_events (company_id, journey_id, actor_id, action) values ($1, $2, $3, 'task.started')",
  [NORD, JOURNEY_NORD, MGR_NORD],
);
check('Un membre peut ecrire dans le journal d audit', audited.ok && audited.rowCount === 1, `rows=${audited.rowCount ?? audited.error}`);

const readBack = await asUser(db, MGR_NORD, 'select id from public.audit_events');
check('Un membre non-RH ne relit pas le journal d audit', readBack.ok && readBack.rows.length === 0, `n=${readBack.rows?.length ?? readBack.error}`);

await db.query(
  "insert into public.audit_events (company_id, journey_id, actor_id, action) values ($1, $2, $3, 'task.started')",
  [NORD, JOURNEY_NORD, MGR_NORD],
);
const rewritten = await asUser(db, RH_NORD, "update public.audit_events set action = 'efface' returning id");
check("Le journal d audit refuse d etre reecrit", rewritten.ok && rewritten.rowCount === 0, `rows=${rewritten.rowCount ?? rewritten.error}`);

const erased = await asUser(db, RH_NORD, 'delete from public.audit_events returning id');
check("Le journal d audit refuse d etre efface", erased.ok && erased.rowCount === 0, `rows=${erased.rowCount ?? erased.error}`);

// 9. Cas limite : supprimer un parcours emporte ses taches, pas sa trace.
await db.query('begin');
await db.query('delete from public.journeys where id = $1', [JOURNEY_NORD]);
const remainingTasks = await db.query('select count(*)::int as n from public.tasks where journey_id = $1', [JOURNEY_NORD]);
const remainingAudit = await db.query("select count(*)::int as n from public.audit_events where action = 'task.started'");
await db.query('rollback');
check('Supprimer un parcours emporte ses taches', remainingTasks.rows[0].n === 0, `n=${remainingTasks.rows[0].n}`);
check('Supprimer un parcours conserve sa trace d audit', remainingAudit.rows[0].n > 0, `n=${remainingAudit.rows[0].n}`);

await db.end();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
