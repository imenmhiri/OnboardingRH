/**
 * Isolation RLS pour `calendar_events` (T-25), meme precedent que
 * `equipment-isolation.mjs` (T-19) : le parcours en fixe la visibilite (via
 * `journey_visible`), l'ecriture reste reservee a la RH, et rien ne traverse
 * une societe.
 */
import {
  asUser,
  client,
  EMP_NORD,
  GULF,
  installJourneys,
  installUsers,
  JOURNEY_NORD,
  MGR_NORD,
  NORD,
  RH_NORD,
  TASK_IT,
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

// Un evenement persistant, cree hors transaction de test pour pouvoir
// enchainer plusieurs verifications dessus.
const EVENT_ID = 'e5000000-0000-4000-8000-000000000001';
await db.query(
  `insert into public.calendar_events
     (id, company_id, journey_id, task_id, external_event_id, title, starts_at, ends_at, time_zone)
   values ($1, $2, $3, $4, 'ext-test-1', 'Créer le compte IT', '2026-04-03T09:00:00', '2026-04-03T10:00:00', 'Europe/Paris')
   on conflict (id) do nothing`,
  [EVENT_ID, NORD, JOURNEY_NORD, TASK_IT],
);

// 1. L'employe concerne voit l'evenement de son propre parcours.
const seenByEmployee = await asUser(db, EMP_NORD, 'select id from public.calendar_events where id = $1', [EVENT_ID]);
check("L employe voit l evenement de son propre parcours", seenByEmployee.rows?.length === 1, seenByEmployee.error ?? `n=${seenByEmployee.rows?.length}`);

// 2. Son manager le voit aussi.
const seenByManager = await asUser(db, MGR_NORD, 'select id from public.calendar_events where id = $1', [EVENT_ID]);
check("Le manager voit l evenement du parcours de son rattache", seenByManager.rows?.length === 1, seenByManager.error ?? `n=${seenByManager.rows?.length}`);

// 3. La RH le voit (visibilite societe entiere).
const seenByHr = await asUser(db, RH_NORD, 'select id from public.calendar_events where id = $1', [EVENT_ID]);
check("La RH voit l evenement", seenByHr.rows?.length === 1, seenByHr.error ?? `n=${seenByHr.rows?.length}`);

// 4. Un collegue d'une autre societe ne le voit jamais.
const GULF_EMPLOYEE = 'bbbbbbbb-0000-4000-8000-000000000001';
await db.query(`insert into public.company_members (company_id, user_id, role) values ($1, $2, 'employee') on conflict do nothing`, [GULF, GULF_EMPLOYEE]);
const seenAcrossCompany = await asUser(db, GULF_EMPLOYEE, 'select id from public.calendar_events where id = $1', [EVENT_ID]);
check("Un membre d une autre societe ne voit pas l evenement", seenAcrossCompany.rows?.length === 0, `n=${seenAcrossCompany.rows?.length ?? seenAcrossCompany.error}`);

// 5. L'employe ne peut pas ecrire l'evenement (pas d'accuse de reception ici, contrairement au materiel).
const writeByEmployee = await asUser(
  db, EMP_NORD,
  "update public.calendar_events set title = 'Modifie' where id = $1 returning id",
  [EVENT_ID],
);
check("L employe n ecrit jamais un evenement d agenda", !writeByEmployee.ok || writeByEmployee.rowCount === 0, writeByEmployee.error ?? `rows=${writeByEmployee.rowCount}`);

// 6. La RH peut ecrire (deplacement, annulation).
const writeByHr = await asUser(
  db, RH_NORD,
  "update public.calendar_events set title = 'Créer le compte IT (déplacé)' where id = $1 returning id",
  [EVENT_ID],
);
check("La RH deplace/modifie un evenement de sa societe", writeByHr.ok && writeByHr.rowCount === 1, writeByHr.error ?? `rows=${writeByHr.rowCount}`);

// 7. Rien de tout cela ne traverse une societe cote ecriture non plus.
const writeAcrossCompany = await asUser(
  db, GULF_EMPLOYEE,
  "update public.calendar_events set status = 'cancelled' where id = $1 returning id",
  [EVENT_ID],
);
check("Un membre d une autre societe ne peut pas annuler cet evenement", !writeAcrossCompany.ok || writeAcrossCompany.rowCount === 0, writeAcrossCompany.error ?? `rows=${writeAcrossCompany.rowCount}`);

await db.end();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
