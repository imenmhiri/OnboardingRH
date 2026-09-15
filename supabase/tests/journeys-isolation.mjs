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

// 10. Regles d attribution et absences (T-12) : lisibles par les membres,
// ecrites par la RH seule, et cloisonnees par societe comme le reste.
const rulesSeen = await asUser(db, MGR_NORD, 'select company_id from public.assignment_rules');
check(
  'Un membre lit les regles d attribution de sa societe, et rien d une autre',
  rulesSeen.rows?.length > 0 && rulesSeen.rows.every((row) => row.company_id === NORD),
  `n=${rulesSeen.rows?.length ?? rulesSeen.error}`,
);

const ruleByManager = await asUser(
  db, MGR_NORD,
  "update public.assignment_rules set fallback_chain = '{hr_admin}' where company_id = $1 returning id",
  [NORD],
);
check("Un manager ne reecrit pas la chaine de repli", ruleByManager.ok && ruleByManager.rowCount === 0, `rows=${ruleByManager.rowCount ?? ruleByManager.error}`);

const ruleByHr = await asUser(
  db, RH_NORD,
  "update public.assignment_rules set fallback_chain = '{manager,hr_admin}' where company_id = $1 and owner_role = 'manager' returning id",
  [NORD],
);
check('La RH configure la chaine de repli de sa societe', ruleByHr.ok && ruleByHr.rowCount === 1, `rows=${ruleByHr.rowCount ?? ruleByHr.error}`);

const absencesSeen = await asUser(db, MGR_NORD, 'select company_id from public.absences');
check(
  'Les absences sont visibles aux collegues de la societe',
  absencesSeen.ok && absencesSeen.rows.every((row) => row.company_id === NORD),
  `n=${absencesSeen.rows?.length ?? absencesSeen.error}`,
);

const absenceElsewhere = await asUser(
  db, EMP_GULF,
  "select count(*)::int as n from public.absences where company_id = $1",
  [NORD],
);
check("Une autre societe ne voit pas ces absences", absenceElsewhere.rows?.[0]?.n === 0, `n=${absenceElsewhere.rows?.[0]?.n}`);

// 11. Seuils d escalade (T-13) : memes regles que le reste — lecture aux
// membres, ecriture reservee a la RH, cloisonnement par societe.
const levelsSeen = await asUser(db, MGR_NORD, 'select company_id from public.escalation_levels');
check(
  'Un membre lit les seuils d escalade de sa societe, et rien d une autre',
  levelsSeen.rows?.length > 0 && levelsSeen.rows.every((row) => row.company_id === NORD),
  `n=${levelsSeen.rows?.length ?? levelsSeen.error}`,
);

const levelByManager = await asUser(
  db, MGR_NORD,
  "insert into public.escalation_levels (company_id, criticality, after_working_days_late, recipient) values ($1, 'standard', 99, 'owner') returning id",
  [NORD],
);
check('Un manager ne cree pas de seuil d escalade', !levelByManager.ok || levelByManager.rowCount === 0, levelByManager.error ?? `rows=${levelByManager.rowCount}`);

const levelByHr = await asUser(
  db, RH_NORD,
  "insert into public.escalation_levels (company_id, criticality, after_working_days_late, recipient) values ($1, 'standard', 99, 'owner') returning id",
  [NORD],
);
check('La RH cree un seuil d escalade pour sa societe', levelByHr.ok && levelByHr.rowCount === 1, `rows=${levelByHr.rowCount ?? levelByHr.error}`);

const levelElsewhere = await asUser(
  db, EMP_GULF,
  'select count(*)::int as n from public.escalation_levels where company_id = $1',
  [NORD],
);
check('Une autre societe ne voit pas ces seuils', levelElsewhere.rows?.[0]?.n === 0, `n=${levelElsewhere.rows?.[0]?.n}`);

// 12. Satisfaction (T-14) : la reponse est lisible par la personne et par la
// RH, pas par le manager ni par un collegue ; un questionnaire annule
// n'accepte plus de reponse ; une reponse ne se reecrit pas.
const SURVEY_OPEN = 'eeeeeeee-0000-4000-8000-000000000001';
const SURVEY_CANCELLED = 'eeeeeeee-0000-4000-8000-000000000002';
await db.query(
  `insert into public.surveys (id, company_id, journey_id, milestone, scheduled_on, status, cancelled_reason)
   values ($1, $2, $3, 'day_7', current_date, 'sent', null),
          ($4, $2, $3, 'day_30', current_date + 20, 'cancelled', 'contract_ended_before')
   on conflict (id) do nothing`,
  [SURVEY_OPEN, NORD, JOURNEY_NORD, SURVEY_CANCELLED],
);

const surveyBySelf = await asUser(db, EMP_NORD, 'select id from public.surveys where id = $1', [SURVEY_OPEN]);
check("L employe voit son propre questionnaire", surveyBySelf.rows?.length === 1, `n=${surveyBySelf.rows?.length ?? surveyBySelf.error}`);

const surveyByColleague = await asUser(db, EMP2_NORD, 'select id from public.surveys where id = $1', [SURVEY_OPEN]);
check("Un collegue ne voit pas le questionnaire d un autre", surveyByColleague.rows?.length === 0, `n=${surveyByColleague.rows?.length ?? surveyByColleague.error}`);

const answered = await asUser(
  db, EMP_NORD,
  "insert into public.survey_responses (company_id, survey_id, rating, comment) values ($1, $2, 2, 'Pas encore d acces')",
  [NORD, SURVEY_OPEN],
);
check("L employe repond a son questionnaire ouvert", answered.ok && answered.rowCount === 1, answered.error ?? `rows=${answered.rowCount}`);
// Persistee hors transaction de test pour les lectures suivantes.
await db.query(
  "insert into public.survey_responses (company_id, survey_id, rating, comment) values ($1, $2, 2, 'Pas encore d acces') on conflict (survey_id) do nothing",
  [NORD, SURVEY_OPEN],
);

const readByManager = await asUser(db, MGR_NORD, 'select rating from public.survey_responses where survey_id = $1', [SURVEY_OPEN]);
check("Le manager ne lit pas la reponse de son arrivant", readByManager.ok && readByManager.rows.length === 0, `n=${readByManager.rows?.length ?? readByManager.error}`);

const readByHr = await asUser(db, RH_NORD, 'select rating from public.survey_responses where survey_id = $1', [SURVEY_OPEN]);
check("La RH lit la reponse pour pouvoir agir", readByHr.rows?.length === 1 && readByHr.rows[0].rating === 2, JSON.stringify(readByHr.rows ?? readByHr.error));

const forgedAnswer = await asUser(
  db, EMP2_NORD,
  "insert into public.survey_responses (company_id, survey_id, rating) values ($1, $2, 5)",
  [NORD, SURVEY_CANCELLED],
);
check("Un collegue ne repond pas a la place d un autre", !forgedAnswer.ok || forgedAnswer.rowCount === 0, forgedAnswer.error ?? `rows=${forgedAnswer.rowCount}`);

const lateAnswer = await asUser(
  db, EMP_NORD,
  "insert into public.survey_responses (company_id, survey_id, rating) values ($1, $2, 5)",
  [NORD, SURVEY_CANCELLED],
);
check("Un questionnaire annule pour fin de contrat n accepte plus de reponse", !lateAnswer.ok || lateAnswer.rowCount === 0, lateAnswer.error ?? `rows=${lateAnswer.rowCount}`);

const responseRewritten = await asUser(
  db, EMP_NORD,
  'update public.survey_responses set rating = 5 where survey_id = $1 returning id',
  [SURVEY_OPEN],
);
check("Une reponse ne se reecrit pas apres coup", responseRewritten.ok && responseRewritten.rowCount === 0, `rows=${responseRewritten.rowCount ?? responseRewritten.error}`);

const settingsElsewhere = await asUser(db, EMP_GULF, 'select count(*)::int as n from public.survey_settings where company_id = $1', [NORD]);
check("Une autre societe ne voit pas les seuils de satisfaction", settingsElsewhere.rows?.[0]?.n === 0, `n=${settingsElsewhere.rows?.[0]?.n}`);

await db.end();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
