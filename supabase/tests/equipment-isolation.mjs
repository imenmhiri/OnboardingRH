/**
 * Complete la section 13 de rls-isolation.mjs (visibilite et l'accuse de
 * reception de l'employe) avec ce que T-19 ajoute : l'IT lit les parcours de
 * sa societe pour grouper sa file de preparation, la RH et l'IT ecrivent le
 * cycle de vie du materiel, un manager ne l'ecrit pas, et rien de tout cela
 * ne traverse une societe.
 */
import {
  asUser,
  client,
  GULF,
  installJourneys,
  installUsers,
  IT_NORD,
  JOURNEY_NORD,
  MGR_NORD,
  NORD,
  RH_NORD,
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

// --- Un membre d'une autre societe, pour verifier le cloisonnement. ---
const IT_GULF = 'bbbbbbbb-0000-4000-8000-000000000002';
await db.query(
  `insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
     confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
     phone_change, phone_change_token, reauthentication_token, encrypted_password, created_at, updated_at)
   values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $2,
     '{}'::jsonb, '{}'::jsonb, '', '', '', '', '', '', '', '', '', now(), now())
   on conflict (id) do nothing`,
  [IT_GULF, 'it@meridien-gulf.test'],
);
await db.query(
  `insert into public.profiles (id, full_name) values ($1, 'Ivan Gulf') on conflict (id) do nothing`,
  [IT_GULF],
);
await db.query(
  `insert into public.company_members (company_id, user_id, role) values ($1, $2, 'it') on conflict do nothing`,
  [GULF, IT_GULF],
);

// 1. L'IT lit les parcours de sa societe (T-19) pour grouper sa file par
// arrivee, sans etre nommement manager ni RH.
const journeysByIt = await asUser(db, IT_NORD, 'select employee_name, company_id from public.journeys');
check(
  "L IT lit les parcours de sa societe pour preparer le materiel",
  journeysByIt.rows?.length > 0 && journeysByIt.rows.every((row) => row.company_id === NORD),
  JSON.stringify(journeysByIt.rows?.map((r) => r.employee_name) ?? journeysByIt.error),
);

// 2. Une autre societe reste hors de portee pour l'IT.
const journeysByOtherIt = await asUser(db, IT_GULF, 'select company_id from public.journeys where company_id = $1', [NORD]);
check(
  "L IT d une autre societe ne voit aucun parcours du Nord",
  journeysByOtherIt.rows?.length === 0,
  `n=${journeysByOtherIt.rows?.length ?? journeysByOtherIt.error}`,
);

// 3. Catalogue : la RH ecrit, l'IT lit seulement.
const catalogByHr = await asUser(
  db, RH_NORD,
  "insert into public.equipment_catalog_items (company_id, name, category) values ($1, 'Souris de test', 'accessory') returning id",
  [NORD],
);
check("La RH ajoute un article au catalogue", catalogByHr.ok && catalogByHr.rowCount === 1, catalogByHr.error ?? `rows=${catalogByHr.rowCount}`);

const catalogByIt = await asUser(
  db, IT_NORD,
  "insert into public.equipment_catalog_items (company_id, name, category) values ($1, 'Clavier de test', 'accessory') returning id",
  [NORD],
);
check(
  "L IT ne modifie pas le catalogue, seulement la RH",
  !catalogByIt.ok || catalogByIt.rowCount === 0,
  catalogByIt.error ?? `rows=${catalogByIt.rowCount}`,
);

// 4. Cycle de vie : la RH et l'IT font avancer une demande, un manager non.
// Le catalogue cree via `asUser` ci-dessus vit dans une transaction annulee
// (c'est le principe du harnais) : on cree ici, hors transaction de test, un
// article persistant pour pouvoir enchainer les etapes suivantes.
const CATALOG_ITEM_ID = 'f4200000-0000-4000-8000-000000000001';
await db.query(
  `insert into public.equipment_catalog_items (id, company_id, name, category) values ($1, $2, 'Ecran de test', 'accessory') on conflict (id) do nothing`,
  [CATALOG_ITEM_ID, NORD],
);

const requestByHr = await asUser(
  db, RH_NORD,
  "insert into public.equipment_requests (company_id, journey_id, catalog_item_id) values ($1, $2, $3) returning id",
  [NORD, JOURNEY_NORD, CATALOG_ITEM_ID],
);
check("La RH ouvre une demande de materiel", requestByHr.ok && requestByHr.rowCount === 1, requestByHr.error ?? `rows=${requestByHr.rowCount}`);

// Persistee hors transaction de test pour les etapes suivantes.
await db.query(
  "insert into public.equipment_requests (company_id, journey_id, catalog_item_id) values ($1, $2, $3) on conflict do nothing",
  [NORD, JOURNEY_NORD, CATALOG_ITEM_ID],
);
const { rows: persisted } = await db.query(
  'select id from public.equipment_requests where journey_id = $1 and catalog_item_id = $2 order by created_at desc limit 1',
  [JOURNEY_NORD, CATALOG_ITEM_ID],
);
const requestId = persisted[0].id;

const orderedByIt = await asUser(
  db, IT_NORD,
  "update public.equipment_requests set status = 'ordered' where id = $1 returning id",
  [requestId],
);
check("L IT commande une demande de materiel", orderedByIt.ok && orderedByIt.rowCount === 1, orderedByIt.error ?? `rows=${orderedByIt.rowCount}`);

const assignedByManager = await asUser(
  db, MGR_NORD,
  "update public.equipment_requests set status = 'assigned', unit_reference = 'SN-999' where id = $1 returning id",
  [requestId],
);
check(
  "Un manager ne fait pas avancer une demande de materiel",
  !assignedByManager.ok || assignedByManager.rowCount === 0,
  assignedByManager.error ?? `rows=${assignedByManager.rowCount}`,
);

const assignedByIt = await asUser(
  db, IT_NORD,
  "update public.equipment_requests set status = 'assigned', unit_reference = 'SN-999' where id = $1 returning id",
  [requestId],
);
check("L IT attribue une unite identifiee", assignedByIt.ok && assignedByIt.rowCount === 1, assignedByIt.error ?? `rows=${assignedByIt.rowCount}`);

// 5. Rien de tout cela ne traverse une societe : l'IT du Gulf ne voit ni ne
// touche la demande du Nord.
const requestSeenElsewhere = await asUser(db, IT_GULF, 'select id from public.equipment_requests where id = $1', [requestId]);
check("L IT d une autre societe ne voit pas cette demande", requestSeenElsewhere.rows?.length === 0, `n=${requestSeenElsewhere.rows?.length ?? requestSeenElsewhere.error}`);

const requestWrittenElsewhere = await asUser(
  db, IT_GULF,
  "update public.equipment_requests set status = 'cancelled' where id = $1 returning id",
  [requestId],
);
check(
  "L IT d une autre societe ne peut pas annuler cette demande",
  !requestWrittenElsewhere.ok || requestWrittenElsewhere.rowCount === 0,
  requestWrittenElsewhere.error ?? `rows=${requestWrittenElsewhere.rowCount}`,
);

await db.end();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
