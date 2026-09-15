/**
 * Réaligne les dates du jeu de démonstration sur le vrai moteur de jours ouvrés.
 *
 * Pourquoi un script plutôt que du SQL : un seed SQL ne peut pas appeler
 * src/domain/scheduling, et réécrire le calcul des jours ouvrés en SQL
 * dupliquerait une règle que CLAUDE.md impose de garder dans le domaine. Le
 * seed pose donc des dates approximatives, et ce script les recalcule avec les
 * mêmes fonctions que la production.
 *
 * Usage :
 *   tsx scripts/seed/align-demo-dates.ts          applique puis vérifie
 *   tsx scripts/seed/align-demo-dates.ts --check  vérifie seulement (code 1 si écart)
 */
import pg from 'pg';
import {
  resolveWorkingCalendar,
  type HolidayRecord,
} from '../../src/domain/companies/working-calendar-resolution';
import { comparePlainDates, parsePlainDate, type PlainDate, type Weekday } from '../../src/domain/scheduling/plain-date';
import {
  addWorkingDays,
  isWorkingDay,
  shiftToWorkingDay,
  type WorkingCalendar,
} from '../../src/domain/scheduling/working-calendar';
import { planSurveys, type SurveyMilestone } from '../../src/domain/surveys/survey-schedule';

// Une colonne DATE convertie en objet Date JavaScript est lue à minuit local,
// puis rendue en UTC : dans un fuseau à l'est de Greenwich, elle recule d'un
// jour. On la lit donc en texte, telle que Postgres la stocke.
pg.types.setTypeParser(1082, (value: string) => value);

const CHECK_ONLY = process.argv.includes('--check');

interface JourneyRow {
  id: string;
  company_id: string;
  site_id: string | null;
  employee_name: string;
  status: string;
  arrival_date: string;
  end_date: string | null;
}

function parseWeekdays(value: string | null): Weekday[] | null {
  if (value === null) return null;
  return value.replace(/^\{|\}$/g, '').split(',').filter(Boolean) as Weekday[];
}

async function main(): Promise<void> {
  const db = new pg.Client({ host: '127.0.0.1', port: 54322, user: 'postgres', password: 'postgres', database: 'postgres' });
  await db.connect();

  const today = parsePlainDate((await db.query<{ today: string }>('select current_date::text as today')).rows[0]!.today);
  const companies = await db.query<{ id: string; weekend: string }>('select id, weekend::text as weekend from public.companies');
  const sites = await db.query<{ id: string; weekend: string | null }>('select id, weekend::text as weekend from public.sites');
  const holidays = await db.query<{ company_id: string; site_id: string | null; observed_on: string; label: string }>(
    'select company_id, site_id, observed_on, label from public.holidays',
  );
  const journeys = await db.query<JourneyRow>(
    'select id, company_id, site_id, employee_name, status::text as status, arrival_date, end_date from public.journeys',
  );
  const tasks = await db.query<{ id: string; journey_id: string; title: string; due_on: string; offset_working_days: number }>(
    'select id, journey_id, title, due_on, offset_working_days from public.tasks',
  );
  const surveys = await db.query<{ id: string; journey_id: string; milestone: SurveyMilestone; scheduled_on: string; status: string }>(
    'select id, journey_id, milestone::text as milestone, scheduled_on, status::text as status from public.surveys',
  );

  const calendarFor = (journey: JourneyRow): WorkingCalendar => {
    const company = companies.rows.find((c) => c.id === journey.company_id);
    const site = sites.rows.find((s) => s.id === journey.site_id);
    const records: HolidayRecord[] = holidays.rows
      .filter((h) => h.company_id === journey.company_id)
      .map((h) => ({ observedOn: parsePlainDate(h.observed_on), siteId: h.site_id, label: h.label }));
    return resolveWorkingCalendar(
      { id: journey.company_id, weekend: parseWeekdays(company?.weekend ?? null) ?? ['saturday', 'sunday'] },
      site ? { id: site.id, weekend: parseWeekdays(site.weekend) } : null,
      records,
    );
  };

  const changes: string[] = [];
  const problems: string[] = [];
  const updates: { sql: string; params: unknown[] }[] = [];

  for (const journey of journeys.rows) {
    const calendar = calendarFor(journey);
    const seeded = parsePlainDate(journey.arrival_date);
    // Une arrivée passée recule au jour ouvré précédent, une arrivée future avance :
    // ainsi un parcours ne change jamais de stade en étant réaligné.
    const direction = comparePlainDates(seeded, today) < 0 ? 'backward' : 'forward';
    const arrival = shiftToWorkingDay(seeded, calendar, direction);
    if (arrival !== seeded) {
      changes.push(`arrivée   ${journey.employee_name.padEnd(18)} ${seeded} -> ${arrival}`);
      updates.push({ sql: 'update public.journeys set arrival_date = $1 where id = $2', params: [arrival, journey.id] });
    }

    for (const task of tasks.rows.filter((t) => t.journey_id === journey.id)) {
      const due = addWorkingDays(arrival, task.offset_working_days, calendar);
      if (due !== task.due_on) {
        changes.push(`échéance  ${journey.employee_name.padEnd(18)} ${task.title.padEnd(34)} ${task.due_on} -> ${due}`);
        updates.push({ sql: 'update public.tasks set due_on = $1 where id = $2', params: [due, task.id] });
      }
    }

    const plan = planSurveys({
      arrivalDate: arrival,
      endDate: journey.end_date ? parsePlainDate(journey.end_date) : null,
      calendar,
    });
    for (const survey of surveys.rows.filter((s) => s.journey_id === journey.id)) {
      const planned = plan.find((p) => p.milestone === survey.milestone);
      if (!planned) continue;

      if (planned.scheduledOn !== survey.scheduled_on) {
        changes.push(`sondage   ${journey.employee_name.padEnd(18)} ${survey.milestone.padEnd(34)} ${survey.scheduled_on} -> ${planned.scheduledOn}`);
      }
      // Un questionnaire déjà envoyé ou rempli garde son statut, mais ne peut
      // pas avoir été rempli avant sa date : c'est une incohérence de démo.
      const done = survey.status === 'sent' || survey.status === 'answered';
      if (done && comparePlainDates(planned.scheduledOn, today) > 0) {
        problems.push(`sondage ${journey.employee_name} ${survey.milestone} marqué « ${survey.status} » mais prévu le ${planned.scheduledOn}, après aujourd'hui`);
      }
      const status = done ? survey.status : planned.status;
      const reason = planned.status === 'cancelled' && !done ? planned.reason : null;
      if (!done && survey.status !== planned.status) {
        changes.push(`statut    ${journey.employee_name.padEnd(18)} ${survey.milestone.padEnd(34)} ${survey.status} -> ${planned.status}`);
      }
      updates.push({
        sql: `update public.surveys
              set scheduled_on = $1, status = $2::public.survey_status, cancelled_reason = $3,
                  sent_at = case when $2 in ('sent', 'answered') then $1::date + interval '9 hours' else null end,
                  answered_at = case when $2 = 'answered' then $1::date + interval '1 day 10 hours' else null end
              where id = $4`,
        params: [planned.scheduledOn, status, reason, survey.id],
      });
    }

    // Les dates réalignées doivent toutes tomber un jour travaillé.
    for (const [label, date] of [['arrivée', arrival] as const]) {
      if (!isWorkingDay(date, calendar)) problems.push(`${label} de ${journey.employee_name} le ${date}, jour non travaillé`);
    }
    // Le stade du parcours doit rester cohérent avec sa date d'arrivée.
    if (journey.status === 'scheduled' && comparePlainDates(arrival, today) <= 0) {
      problems.push(`${journey.employee_name} est « à venir » mais arrive le ${arrival}`);
    }
    if ((journey.status === 'in_progress' || journey.status === 'completed') && comparePlainDates(arrival, today) > 0) {
      problems.push(`${journey.employee_name} est « ${journey.status} » mais n'arrive que le ${arrival}`);
    }
  }

  const surveyDateChanges = changes.filter((c) => !c.startsWith('statut')).length;
  console.log(`Aujourd'hui : ${today}`);
  console.log(changes.length ? changes.map((c) => `  ${c}`).join('\n') : '  Aucun écart : toutes les dates suivent déjà le moteur.');

  if (problems.length) {
    console.log(`\nIncohérences :\n${problems.map((p) => `  ${p}`).join('\n')}`);
  }

  if (CHECK_ONLY) {
    await db.end();
    console.log(`\n${surveyDateChanges} date(s) et ${changes.length - surveyDateChanges} statut(s) à réaligner, ${problems.length} incohérence(s).`);
    process.exit(changes.length === 0 && problems.length === 0 ? 0 : 1);
  }

  if (problems.length) {
    await db.end();
    console.log('\nAucune modification appliquée : corriger d’abord le seed.');
    process.exit(1);
  }

  await db.query('begin');
  try {
    for (const update of updates) await db.query(update.sql, update.params);
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
  await db.end();
  console.log(`\n${changes.length} correction(s) appliquée(s).`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
