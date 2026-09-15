/**
 * Proves the multi-company isolation of the schema against a real database,
 * because a policy that reads correctly can still never match: a subquery
 * inside a policy is itself subject to the RLS of the table it reads.
 *
 * Run the local stack first: npm run db:reset, then npm run db:verify.
 */
import { asUser, client, EMP_GULF, GULF, installUsers, IT_NORD, NORD, RH_NORD } from './fixtures.mjs';

const db = client();
await db.connect();
await installUsers(db);

let failures = 0;
function check(label, condition, detail = '') {
  const status = condition ? 'PASS' : 'FAIL';
  if (!condition) failures += 1;
  console.log(`${status}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// 1. Lecture des societes
const rhCompanies = await asUser(db, RH_NORD, 'select slug from public.companies order by slug');
check(
  'RH Atelier Nord ne voit que sa societe',
  rhCompanies.ok && rhCompanies.rows.length === 1 && rhCompanies.rows[0].slug === 'atelier-nord',
  JSON.stringify(rhCompanies.rows ?? rhCompanies.error),
);

const empCompanies = await asUser(db, EMP_GULF, 'select slug from public.companies order by slug');
check(
  'Employe Meridien Gulf ne voit que sa societe',
  empCompanies.ok && empCompanies.rows.length === 1 && empCompanies.rows[0].slug === 'meridien-gulf',
  JSON.stringify(empCompanies.rows ?? empCompanies.error),
);

// 2. Jours feries : 7 societe + 2 site pour Nord, 1 pour Gulf
const rhHolidays = await asUser(db, RH_NORD, 'select count(*)::int as n from public.holidays');
check('RH Nord voit les 9 feries de sa societe', rhHolidays.rows?.[0]?.n === 9, `n=${rhHolidays.rows?.[0]?.n}`);

const gulfHolidays = await asUser(db, EMP_GULF, 'select label from public.holidays');
check(
  'Employe Gulf ne voit aucun ferie francais',
  gulfHolidays.rows?.length === 1 && !gulfHolidays.rows.some((r) => r.label.includes('Travail')),
  JSON.stringify(gulfHolidays.rows ?? gulfHolidays.error),
);

// 3. Sites
const rhSites = await asUser(db, RH_NORD, 'select slug from public.sites order by slug');
check(
  'RH Nord voit ses deux sites, pas celui de Dubai',
  rhSites.rows?.length === 2 && !rhSites.rows.some((r) => r.slug === 'dubai'),
  JSON.stringify(rhSites.rows ?? rhSites.error),
);

// 4. Ecriture : seule la RH de la societe modifie
const empUpdate = await asUser(
  db,
  EMP_GULF,
  "update public.companies set name = 'Pirate' where id = $1 returning id",
  [GULF],
);
check('Un employe ne peut pas modifier sa societe', empUpdate.ok && empUpdate.rowCount === 0, `rows=${empUpdate.rowCount ?? empUpdate.error}`);

const rhUpdateOwn = await asUser(
  db,
  RH_NORD,
  "update public.companies set name = 'Atelier Nord renomme' where id = $1 returning id",
  [NORD],
);
check('La RH modifie sa propre societe', rhUpdateOwn.ok && rhUpdateOwn.rowCount === 1, `rows=${rhUpdateOwn.rowCount ?? rhUpdateOwn.error}`);

const rhUpdateOther = await asUser(
  db,
  RH_NORD,
  "update public.companies set name = 'Pirate' where id = $1 returning id",
  [GULF],
);
check('La RH ne peut pas modifier une autre societe', rhUpdateOther.ok && rhUpdateOther.rowCount === 0, `rows=${rhUpdateOther.rowCount ?? rhUpdateOther.error}`);

const empInsertHoliday = await asUser(
  db,
  EMP_GULF,
  "insert into public.holidays (company_id, observed_on, label) values ($1, '2026-08-15', 'Injecte') returning id",
  [NORD],
);
check(
  'Un employe ne peut pas inserer un ferie chez une autre societe',
  !empInsertHoliday.ok || empInsertHoliday.rowCount === 0,
  empInsertHoliday.error ?? `rows=${empInsertHoliday.rowCount}`,
);

// 5. Appartenances et profils
const itMembers = await asUser(db, IT_NORD, 'select user_id from public.company_members');
check("Un membre IT ne voit que sa propre appartenance", itMembers.rows?.length === 1, `n=${itMembers.rows?.length ?? itMembers.error}`);

const rhMembers = await asUser(db, RH_NORD, 'select user_id, company_id from public.company_members');
// On verifie l appartenance des lignes, pas leur nombre : d autres comptes
// peuvent exister dans la meme societe sans que la policy soit en cause.
check(
  'La RH voit les appartenances de sa societe, et rien d une autre',
  rhMembers.rows?.length > 1 && rhMembers.rows.every((row) => row.company_id === NORD),
  JSON.stringify(rhMembers.rows?.map((r) => r.company_id) ?? rhMembers.error),
);

const itProfiles = await asUser(db, IT_NORD, 'select full_name from public.profiles order by full_name');
check(
  'Un profil d une autre societe reste invisible',
  itProfiles.rows?.some((r) => r.full_name === 'Rachel RH') &&
    !itProfiles.rows.some((r) => r.full_name.includes('Emma')),
  JSON.stringify(itProfiles.rows?.map((r) => r.full_name) ?? itProfiles.error),
);

// 6. Visiteur non authentifie
await db.query('begin');
await db.query('set local role anon');
const anon = await db.query('select count(*)::int as n from public.companies');
await db.query('rollback');
check('Un visiteur non authentifie ne voit aucune societe', anon.rows[0].n === 0, `n=${anon.rows[0].n}`);

await db.end();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
