/**
 * Rapport de démonstration des tickets T-10 à T-15.
 *
 * Ces tickets sont des règles métier et des données : aucun écran ne les montre
 * encore. Ce rapport les rend visibles sans interface — il lit le vrai jeu de
 * démonstration et fait tourner le vrai moteur du domaine, exactement comme le
 * fera l'application. Rien n'est simulé, rien n'est écrit en base.
 *
 * Usage : npm run demo:report   (après npm run db:reset)
 */
import pg from 'pg';
import { resolveWorkingCalendar, type HolidayRecord } from '../../src/domain/companies/working-calendar-resolution';
import { decideEscalation, type Criticality, type EscalationLevel, type EscalationPolicy } from '../../src/domain/escalation/escalation-policy';
import { selectEscalationCandidates, type EscalationSource } from '../../src/domain/escalation/escalation-candidates';
import { blocksDependentTask, isAwaitingAcknowledgement, type EquipmentRequest, type EquipmentStatus } from '../../src/domain/equipment/equipment';
import { groupRequestsForOrder } from '../../src/domain/equipment/order-grouping';
import { parsePlainDate, type PlainDate, type Weekday } from '../../src/domain/scheduling/plain-date';
import { addWorkingDays, type WorkingCalendar } from '../../src/domain/scheduling/working-calendar';
import { aggregateByGroup } from '../../src/domain/surveys/aggregation';
import { detectJourneySignals, type SurveyResponse, type WeakSignalPolicy } from '../../src/domain/surveys/satisfaction';
import { planSurveys, type SurveyMilestone } from '../../src/domain/surveys/survey-schedule';
import { resolveTaskOwner, type Absence, type AssignmentContext, type OwnerSlot } from '../../src/domain/tasks/owner-resolution';
import { actionableTasks, buildTaskGraph, explainBlocking } from '../../src/domain/tasks/task-graph';
import type { OwnerRole, Task, TaskStatus } from '../../src/domain/tasks/task';
import { instantiateJourney } from '../../src/domain/templates/journey-instantiation';
import { selectTemplate, type JourneyTemplate, type TaskDefinition } from '../../src/domain/templates/journey-template';

// Colonnes DATE lues en texte : converties en Date JavaScript, elles reculent
// d'un jour sur une machine à l'est de Greenwich (piège rencontré en T-14).
pg.types.setTypeParser(1082, (value: string) => value);

const NORD = '11111111-1111-4111-8111-111111111111';

interface JourneyRow {
  id: string;
  company_id: string;
  site_id: string | null;
  employee_id: string | null;
  manager_id: string | null;
  employee_name: string;
  status: string;
  arrival_date: string;
  end_date: string | null;
  contract_type: string | null;
  job_family: string | null;
}

const title = (text: string) => console.log(`\n${'='.repeat(78)}\n${text}\n${'='.repeat(78)}`);
const note = (text: string) => console.log(`  → ${text}`);
const arrayOf = <T extends string>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : String(value ?? '').replace(/^\{|\}$/g, '').split(',').filter(Boolean) as T[];

async function main(): Promise<void> {
  const db = new pg.Client({ host: '127.0.0.1', port: 54322, user: 'postgres', password: 'postgres', database: 'postgres' });
  await db.connect();
  const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => (await db.query(sql, params)).rows as T[];

  const today = parsePlainDate((await q<{ d: string }>('select current_date::text as d'))[0]!.d);
  const journeys = await q<JourneyRow>(
    "select id, company_id, site_id, employee_id, manager_id, employee_name, status::text as status, arrival_date, end_date, contract_type, job_family from public.journeys where id::text like 'a0000000%' order by arrival_date",
  );
  if (journeys.length === 0) {
    console.log('Aucun parcours de démonstration trouvé. Lancer d’abord : npm run db:reset');
    await db.end();
    process.exit(1);
  }
  const names = new Map((await q<{ id: string; full_name: string }>('select id, full_name from public.profiles')).map((p) => [p.id, p.full_name]));
  const who = (id: string | null) => (id ? names.get(id) ?? id : 'personne');
  const companies = await q<{ id: string; weekend: string }>('select id, weekend::text as weekend from public.companies');
  const sites = await q<{ id: string; slug: string; weekend: string | null }>('select id, slug, weekend::text as weekend from public.sites');
  const holidayRows = await q<{ company_id: string; site_id: string | null; observed_on: string; label: string }>('select company_id, site_id, observed_on, label from public.holidays');

  const calendarFor = (companyId: string, siteId: string | null): WorkingCalendar => {
    const company = companies.find((c) => c.id === companyId);
    const site = sites.find((s) => s.id === siteId);
    const records: HolidayRecord[] = holidayRows
      .filter((h) => h.company_id === companyId)
      .map((h) => ({ observedOn: parsePlainDate(h.observed_on), siteId: h.site_id, label: h.label }));
    return resolveWorkingCalendar(
      { id: companyId, weekend: arrayOf<Weekday>(company?.weekend) },
      site ? { id: site.id, weekend: site.weekend ? arrayOf<Weekday>(site.weekend) : null } : null,
      records,
    );
  };

  const taskRows = await q<{ id: string; journey_id: string; title: string; owner_role: OwnerRole; owner_id: string | null; status: TaskStatus; due_on: string; expected_document: string | null; shared_key: string | null; criticality: Criticality }>(
    'select id, journey_id, title, owner_role::text as owner_role, owner_id, status::text as status, due_on, expected_document, shared_key, criticality::text as criticality from public.tasks',
  );
  const depRows = await q<{ task_id: string; depends_on_id: string }>('select task_id, depends_on_id from public.task_dependencies');
  const tasksOf = (journeyId: string): Task[] =>
    taskRows
      .filter((t) => t.journey_id === journeyId)
      .map((t) => ({
        id: t.id,
        journeyId,
        title: t.title,
        ownerRole: t.owner_role,
        ownerId: t.owner_id,
        dependsOn: depRows.filter((d) => d.task_id === t.id).map((d) => d.depends_on_id),
        status: t.status,
        dueDate: parsePlainDate(t.due_on),
        expectedDocument: t.expected_document,
        sharedKey: t.shared_key,
        criticality: t.criticality,
      }));

  console.log(`RAPPORT DE DÉMONSTRATION — T-10 à T-15\nDonnées réelles de la base locale, moteur réel du domaine. Aujourd'hui : ${today}`);
  console.log('\nParcours de démonstration (société Atelier Nord) :');
  for (const j of journeys) {
    console.log(`  ${j.employee_name.padEnd(18)} ${j.status.padEnd(12)} arrivée ${j.arrival_date}${j.end_date ? `, fin de contrat ${j.end_date}` : ''}`);
  }

  // ---------------------------------------------------------------- T-10
  title('T-10 — Graphe de dépendances : « bloquée par quoi, et qui en est le propriétaire ? »');
  const diego = journeys.find((j) => j.employee_name === 'Diego Retardé')!;
  const diegoGraph = buildTaskGraph(tasksOf(diego.id));
  if (diegoGraph.ok) {
    console.log(`Parcours de ${diego.employee_name} :`);
    for (const task of [...diegoGraph.graph.tasks.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
      const explanation = explainBlocking(diegoGraph.graph, task.id);
      const cause = explanation
        ? `BLOQUÉE par « ${explanation.rootCauses.map((r) => `${r.title} » (rôle ${r.ownerRole}, ${r.ownerId ? who(r.ownerId) : 'non attribuée'})`).join(' + « ')}`
        : task.status === 'done' ? 'terminée' : 'rien ne la bloque';
      console.log(`  ${task.dueDate}  ${task.title.padEnd(34)} ${task.status.padEnd(8)} ${cause}`);
    }
    note(`Seule action possible aujourd'hui : ${actionableTasks(diegoGraph.graph).map((t) => `« ${t.title} »`).join(', ')}`);
    note('La cause racine n’est pas la dépendance directe : le moteur remonte toute la chaîne.');
  }

  // ---------------------------------------------------------------- T-11
  title('T-11 — Templates : sélectionner et instancier un parcours pour une nouvelle embauche');
  const templateRow = (await q<{ id: string; company_id: string; name: string; job_family: string | null; site_id: string | null; contract_type: string | null }>(
    'select id, company_id, name, job_family, site_id, contract_type from public.journey_templates where company_id = $1', [NORD]))[0]!;
  const tt = await q<{ id: string; key: string; title: string; owner_role: OwnerRole; offset_working_days: number; expected_document: string | null; shared_key: string | null; criticality: Criticality }>(
    'select id, key, title, owner_role::text as owner_role, offset_working_days, expected_document, shared_key, criticality::text as criticality from public.template_tasks where template_id = $1 order by position', [templateRow.id]);
  const ttd = await q<{ template_task_id: string; depends_on_id: string }>('select template_task_id, depends_on_id from public.template_task_dependencies');
  const keyById = new Map(tt.map((t) => [t.id, t.key]));
  const definitions: TaskDefinition[] = tt.map((t) => ({
    key: t.key,
    title: t.title,
    ownerRole: t.owner_role,
    offsetInWorkingDays: t.offset_working_days,
    dependsOn: ttd.filter((d) => d.template_task_id === t.id).map((d) => keyById.get(d.depends_on_id)).filter((k): k is string => Boolean(k)),
    expectedDocument: t.expected_document,
    sharedKey: t.shared_key,
    criticality: t.criticality,
  }));
  const template: JourneyTemplate = {
    id: templateRow.id,
    companyId: templateRow.company_id,
    name: templateRow.name,
    criteria: { jobFamily: templateRow.job_family, siteId: templateRow.site_id, contractType: templateRow.contract_type },
    taskDefinitions: definitions,
  };
  const lille = sites.find((s) => s.slug === 'lille')!;
  const lilleCalendar = calendarFor(NORD, lille.id);
  const newArrival = addWorkingDays(today, 15, lilleCalendar);
  const selection = selectTemplate([template], { companyId: NORD, jobFamily: 'atelier', siteId: lille.id, contractType: 'cdi' });
  if (selection.ok) {
    console.log(`Embauche fictive : atelier, CDI, site de Lille, arrivée le ${newArrival} (dans 15 jours ouvrés).`);
    console.log(`Template retenu : « ${selection.template.name} ».`);
    const instance = instantiateJourney({ template: selection.template, journeyId: 'nouvelle-embauche', arrivalDate: newArrival, calendar: lilleCalendar });
    if (instance.ok) {
      for (const task of instance.tasks) {
        console.log(`  ${task.dueDate}  ${task.title.padEnd(34)} rôle ${task.ownerRole.padEnd(9)} ${task.expectedDocument ? `pièce attendue : ${task.expectedDocument}` : ''}`);
      }
      note('Chaque échéance est calculée en jours ouvrés, week-ends et fériés exclus.');
    }
  }
  const ambiguous = selectTemplate(
    [template, { ...template, id: 'autre-template', name: 'Doublon de test' }],
    { companyId: NORD, jobFamily: 'atelier', siteId: lille.id, contractType: 'cdi' },
  );
  note(`Deux templates également spécifiques : ${ambiguous.ok ? 'choix silencieux (ANORMAL)' : `refus « ${ambiguous.reason} », jamais un choix au hasard`}.`);

  // ---------------------------------------------------------------- T-12
  title('T-12 — Responsables : qui prend la tâche, et que se passe-t-il si le manager est absent ?');
  const alice = journeys.find((j) => j.employee_name === 'Alice Arrivante')!;
  // Seuls les comptes du jeu de démonstration (préfixe e0000000...) : npm run
  // db:verify laisse en base ses propres comptes de test, dont une « Rachel RH »
  // qui passerait sinon devant la vraie RH de la démo dans l'ordre de tri.
  const members = await q<{ user_id: string; role: string; reports_to: string | null; company_id: string }>(
    "select user_id, role::text as role, reports_to, company_id from public.company_members where company_id = $1 and user_id::text like 'e0000000%'",
    [NORD],
  );
  const rules = await q<{ owner_role: string; fallback_chain: unknown }>('select owner_role::text as owner_role, fallback_chain from public.assignment_rules where company_id = $1', [NORD]);
  const absenceRows = await q<{ person_id: string; starts_on: string; ends_on: string; reason: string | null }>('select person_id, starts_on, ends_on, reason from public.absences where company_id = $1', [NORD]);
  const absences: Absence[] = absenceRows.map((a) => ({ personId: a.person_id, from: parsePlainDate(a.starts_on), to: parsePlainDate(a.ends_on) }));
  const chains = new Map(rules.map((r) => [r.owner_role, arrayOf<OwnerSlot>(r.fallback_chain)]));
  const context: AssignmentContext = {
    employeeId: alice.employee_id,
    managerId: alice.manager_id,
    managerOfManagerId: members.find((m) => m.user_id === alice.manager_id)?.reports_to ?? null,
    hrAdminIds: members.filter((m) => m.role === 'hr_admin').map((m) => m.user_id),
    itMemberIds: members.filter((m) => m.role === 'it').map((m) => m.user_id),
  };
  console.log('Chaînes de repli configurées en base pour Atelier Nord :');
  for (const [role, chain] of chains) console.log(`  rôle ${role.padEnd(9)} : ${chain.join(' → ')}`);
  for (const a of absenceRows) console.log(`Absence : ${who(a.person_id)} du ${a.starts_on} au ${a.ends_on} (${a.reason ?? 'sans motif'})`);
  console.log(`\nAttribution des tâches du parcours de ${alice.employee_name} :`);
  for (const task of tasksOf(alice.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const outcome = resolveTaskOwner(chains.get(task.ownerRole) ?? [], context, absences, task.dueDate);
    const assignee = !outcome.assignment ? 'NON ATTRIBUABLE — à remonter au cockpit'
      : outcome.assignment.kind === 'team' ? `équipe ${outcome.assignment.role} (personne n’est nommé, c’est voulu)`
      : who(outcome.assignment.ownerId);
    const swap = outcome.substitutions.length ? `   [remplacement : ${outcome.substitutions.map((s) => `${s.skipped} ${s.reason === 'absent_on_due_date' ? 'absent à l’échéance' : s.reason}`).join(', ')}]` : '';
    console.log(`  ${task.dueDate}  ${task.title.padEnd(34)} → ${assignee}${swap}`);
  }
  note('L’absence se juge à la date d’échéance : les tâches tombant pendant les congés du manager basculent, pas les autres.');

  // ---------------------------------------------------------------- T-13
  title('T-13 — Relances : qui prévenir aujourd’hui, et à quel niveau ?');
  const levels = await q<{ criticality: Criticality; after_working_days_late: number; recipient: EscalationLevel['recipient'] }>(
    'select criticality::text as criticality, after_working_days_late, recipient::text as recipient from public.escalation_levels where company_id = $1 order by criticality, after_working_days_late', [NORD]);
  const toLevel = (l: (typeof levels)[number]): EscalationLevel => ({ afterWorkingDaysLate: l.after_working_days_late, recipient: l.recipient });
  const policy: EscalationPolicy = {
    companyId: NORD,
    standard: levels.filter((l) => l.criticality === 'standard').map(toLevel),
    critical: levels.filter((l) => l.criticality === 'critical').map(toLevel),
  };
  console.log(`Seuils standard : ${policy.standard.map((l) => `${l.recipient} dès ${l.afterWorkingDaysLate} j`).join(', ')}`);
  console.log(`Seuils critique : ${policy.critical.map((l) => `${l.recipient} dès ${l.afterWorkingDaysLate} j`).join(', ')}`);
  const hrIds = members.filter((m) => m.role === 'hr_admin').map((m) => m.user_id);
  let anyCandidate = false;
  for (const j of journeys.filter((x) => x.status !== 'completed' && x.status !== 'cancelled')) {
    const sources: EscalationSource[] = tasksOf(j.id).map((task) => ({
      task,
      journeyStatus: 'active',
      criticality: taskRows.find((t) => t.id === task.id)?.criticality ?? 'standard',
      recipients: { ownerId: task.ownerId, managerId: j.manager_id, hrAdminIds: hrIds },
    }));
    const candidates = selectEscalationCandidates(sources, calendarFor(j.company_id, j.site_id), today, new Map());
    for (const c of candidates) {
      anyCandidate = true;
      const decision = decideEscalation(policy, c, today);
      console.log(`  ${j.employee_name.padEnd(16)} « ${c.title} » ${c.criticality}, ${c.workingDaysLate} j ouvrés de retard → ${decision.ok ? `prévenir ${decision.decision.level.recipient} (${who(decision.decision.recipientId)})` : `pas de relance (${decision.refusal.code})`}`);
    }
  }
  if (!anyCandidate) console.log('  Aucune tâche actionnable en retard aujourd’hui.');
  note('Les tâches bloquées ne sont jamais relancées : on prévient le propriétaire de la cause racine, pas la victime.');

  // ---------------------------------------------------------------- T-14
  title('T-14 — Satisfaction J+7 / J+30');
  const surveyRows = await q<{ journey_id: string; milestone: SurveyMilestone; scheduled_on: string; status: string; cancelled_reason: string | null }>(
    "select journey_id, milestone::text as milestone, scheduled_on, status::text as status, cancelled_reason from public.surveys where journey_id::text like 'a0000000%'");
  const STORED_LABELS: Record<string, string> = {
    scheduled: 'à envoyer',
    sent: 'envoyé, sans réponse',
    answered: 'rempli',
    cancelled: 'annulé',
  };
  for (const j of journeys) {
    const plan = planSurveys({ arrivalDate: parsePlainDate(j.arrival_date), endDate: j.end_date ? parsePlainDate(j.end_date) : null, calendar: calendarFor(j.company_id, j.site_id) });
    for (const p of plan) {
      const stored = surveyRows.find((s) => s.journey_id === j.id && s.milestone === p.milestone);
      // Le moteur dit seulement si le questionnaire a lieu d'être ; ce qui en est
      // advenu (envoyé, rempli) vient de la base.
      const decision = p.status === 'cancelled' ? 'ANNULÉ : le contrat finit avant' : 'maintenu';
      const state = stored ? STORED_LABELS[stored.status] ?? stored.status : 'pas encore créé en base';
      console.log(`  ${j.employee_name.padEnd(16)} ${p.milestone.padEnd(6)} ${p.scheduledOn}  ${decision.padEnd(31)} état : ${state}`);
    }
  }
  const settings = (await q<{ low_rating_at_or_below: number; drop_at_least: number; recurring_theme_at_least: number; minimum_respondents: number }>('select * from public.survey_settings where company_id = $1', [NORD]))[0]!;
  const weakPolicy: WeakSignalPolicy = { lowRatingAtOrBelow: settings.low_rating_at_or_below, dropAtLeast: settings.drop_at_least, recurringThemeAtLeast: settings.recurring_theme_at_least };
  const responseRows = await q<{ journey_id: string; milestone: SurveyMilestone; rating: number; comment: string | null; themes: unknown; site: string | null }>(
    "select s.journey_id, s.milestone::text as milestone, r.rating, r.comment, r.themes, st.slug as site from public.survey_responses r join public.surveys s on s.id = r.survey_id join public.journeys j on j.id = s.journey_id left join public.sites st on st.id = j.site_id where s.journey_id::text like 'a0000000%'");
  const farida = journeys.find((j) => j.employee_name === 'Farida Fin')!;
  // Tri explicite : dans l'ordre alphabétique, « day_30 » passerait avant « day_7 ».
  const MILESTONE_ORDER: Record<SurveyMilestone, number> = { day_7: 0, day_30: 1 };
  const faridaResponses: SurveyResponse[] = responseRows
    .filter((r) => r.journey_id === farida.id)
    .map((r) => ({ milestone: r.milestone, rating: r.rating, comment: r.comment, themes: arrayOf<string>(r.themes) }))
    .sort((a, b) => MILESTONE_ORDER[a.milestone] - MILESTONE_ORDER[b.milestone]);
  console.log(`\nRéponses de ${farida.employee_name} : ${faridaResponses.map((r) => `${r.milestone} = ${r.rating}/5`).join(', ')}`);
  const signals = detectJourneySignals(faridaResponses, weakPolicy);
  console.log(`Signaux faibles : ${signals.length ? signals.map((s) => s.code === 'low_rating' ? `note basse (${s.rating}/5)` : s.code === 'rating_drop' ? `chute de ${s.from} à ${s.to}` : `thème récurrent « ${s.theme} »`).join(' + ') : 'aucun'}`);
  // Les sites de la société seulement : Dubaï appartient à Méridien Gulf.
  const nordSites = await q<{ slug: string }>('select slug from public.sites where company_id = $1 order by slug', [NORD]);
  const aggregates = aggregateByGroup(responseRows.map((r) => ({ groupKey: r.site ?? '?', rating: r.rating })), nordSites.map((s) => s.slug), settings.minimum_respondents);
  console.log(`Agrégats par site (minimum ${settings.minimum_respondents} répondants) :`);
  for (const [site, agg] of aggregates) {
    console.log(`  ${site.padEnd(11)} ${agg.kind === 'available' ? `moyenne ${agg.average}/5 sur ${agg.respondents} réponses` : agg.kind === 'too_few' ? 'masqué — trop peu de réponses pour protéger l’anonymat' : 'aucune donnée (et pas « zéro »)'}`);
  }

  // ---------------------------------------------------------------- T-15
  title('T-15 — Matériel : ce qui manque pour chaque arrivée');
  const eqRows = await q<{ id: string; company_id: string; journey_id: string; task_id: string | null; catalog_item_id: string; status: EquipmentStatus; name: string }>(
    "select r.id, r.company_id, r.journey_id, r.task_id, r.catalog_item_id, r.status::text as status, c.name from public.equipment_requests r join public.equipment_catalog_items c on c.id = r.catalog_item_id where r.journey_id::text like 'a0000000%'");
  const requests: EquipmentRequest[] = eqRows.map((r) => ({ id: r.id, companyId: r.company_id, journeyId: r.journey_id, taskId: r.task_id, catalogItemId: r.catalog_item_id, status: r.status }));
  for (const j of journeys) {
    const own = eqRows.filter((r) => r.journey_id === j.id);
    if (own.length === 0) continue;
    console.log(`  ${j.employee_name} :`);
    for (const r of own) {
      const req = requests.find((x) => x.id === r.id)!;
      const flag = isAwaitingAcknowledgement(req) ? '  ⚠ remis mais JAMAIS ACCUSÉ' : '';
      const blocks = blocksDependentTask(req) ? '  (bloque sa tâche liée)' : '';
      console.log(`    ${r.name.padEnd(30)} ${r.status.padEnd(13)}${flag}${blocks}`);
    }
  }
  const itemNames = new Map(eqRows.map((r) => [r.catalog_item_id, r.name]));
  console.log('\nCommandes à passer (demandes regroupées par modèle) :');
  for (const g of groupRequestsForOrder(requests)) {
    const people = g.journeyIds.map((id) => journeys.find((j) => j.id === id)?.employee_name ?? id).join(', ');
    console.log(`  ${String(g.quantity).padStart(2)} × ${(itemNames.get(g.catalogItemId) ?? g.catalogItemId).padEnd(30)} pour : ${people}`);
  }
  note('Deux arrivées demandant le même modèle donnent une seule commande, jamais deux.');

  const reclaim = await q<{ payload: { reason?: string } }>("select payload from public.audit_events where action = 'equipment.reclaimed' limit 1");
  if (reclaim[0]) note(`Matériel attribué puis repris, raison tracée : « ${reclaim[0].payload.reason ?? ''} »`);

  console.log(`\n${'='.repeat(78)}\nFin du rapport. Pour explorer les tables vous-même : http://127.0.0.1:54323 (Supabase Studio)\n`);
  await db.end();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
