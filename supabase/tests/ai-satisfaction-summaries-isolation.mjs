/**
 * Isolation RLS pour `ai_satisfaction_summaries` (T-26). Meme perimetre que
 * `survey_responses`/`survey_settings` : seule la RH de la societe lit les
 * syntheses (des tendances de groupe issues de commentaires de
 * satisfaction), jamais un manager, jamais un employe, jamais un membre
 * d'une autre societe. L'ecriture reste reservee a la RH (en pratique, le
 * client de service applicatif de la route dediee, non soumis a la RLS).
 */
import { asUser, client, EMP_GULF, installUsers, IT_NORD, NORD, RH_NORD } from './fixtures.mjs';

const db = client();
await db.connect();
await installUsers(db);

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

const SUMMARY_ID = 'f6000000-0000-4000-8000-000000000001';
await db.query(
  `insert into public.ai_satisfaction_summaries
     (id, company_id, group_key, summary_text, generated_at, based_on_respondent_count)
   values ($1, $2, 'company', 'Synthese de test agregee, aucune donnee individuelle.', now(), 5)
   on conflict (id) do nothing`,
  [SUMMARY_ID, NORD],
);

// 1. La RH de la societe voit la synthese de sa societe.
const seenByHr = await asUser(db, RH_NORD, 'select id from public.ai_satisfaction_summaries where id = $1', [SUMMARY_ID]);
check('La RH voit la synthese de sa societe', seenByHr.rows?.length === 1, seenByHr.error ?? `n=${seenByHr.rows?.length}`);

// 2. Un membre non-RH (IT) de la meme societe ne la voit pas.
const seenByIt = await asUser(db, IT_NORD, 'select id from public.ai_satisfaction_summaries where id = $1', [SUMMARY_ID]);
check("Un membre IT de la meme societe ne voit pas la synthese", seenByIt.rows?.length === 0, `n=${seenByIt.rows?.length ?? seenByIt.error}`);

// 3. Un membre d'une autre societe ne la voit jamais.
const seenAcrossCompany = await asUser(db, EMP_GULF, 'select id from public.ai_satisfaction_summaries where id = $1', [SUMMARY_ID]);
check("Un membre d'une autre societe ne voit pas la synthese", seenAcrossCompany.rows?.length === 0, `n=${seenAcrossCompany.rows?.length ?? seenAcrossCompany.error}`);

// 4. Un membre non-RH ne peut pas ecrire.
const writeByIt = await asUser(
  db, IT_NORD,
  "update public.ai_satisfaction_summaries set summary_text = 'Modifie' where id = $1 returning id",
  [SUMMARY_ID],
);
check('Un membre IT ne peut jamais modifier une synthese', !writeByIt.ok || writeByIt.rowCount === 0, writeByIt.error ?? `rows=${writeByIt.rowCount}`);

// 5. La RH de la societe peut ecrire (mise a jour manuelle exceptionnelle).
const writeByHr = await asUser(
  db, RH_NORD,
  "update public.ai_satisfaction_summaries set summary_text = 'Synthese mise a jour par la RH' where id = $1 returning id",
  [SUMMARY_ID],
);
check('La RH de la societe peut ecrire une synthese de sa societe', writeByHr.ok && writeByHr.rowCount === 1, writeByHr.error ?? `rows=${writeByHr.rowCount}`);

// 6. Un membre d'une autre societe ne peut pas ecrire non plus.
const writeAcrossCompany = await asUser(
  db, EMP_GULF,
  "update public.ai_satisfaction_summaries set summary_text = 'Piratee' where id = $1 returning id",
  [SUMMARY_ID],
);
check("Un membre d'une autre societe ne peut pas ecrire une synthese qui n'est pas la sienne", !writeAcrossCompany.ok || writeAcrossCompany.rowCount === 0, writeAcrossCompany.error ?? `rows=${writeAcrossCompany.rowCount}`);

await db.end();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
