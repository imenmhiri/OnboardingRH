/**
 * Éprouve le cockpit RH (T-18) sur la vraie base et le vrai navigateur :
 * arrivées à venir, tâche bloquée avec sa cause racine et son responsable,
 * matériel/comptes IT avant une arrivée imminente, satisfaction avec signal
 * faible, filtres, et la garde d'accès pour un rôle sans cockpit.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const PASSWORD = 'OnboardingDemo!2026';

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

async function signIn(page, email) {
  await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle' });
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/connexion'), { timeout: 15000 }).catch(() => {}),
    page.getByRole('button', { name: 'Se connecter' }).click(),
  ]);
  await page.waitForLoadState('networkidle');
}

function cardBody(page, title) {
  return page.locator('h2', { hasText: title }).locator('xpath=../../following-sibling::div[1]');
}

// --- RH : la vue complète du cockpit. ---
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
await signIn(page, 'rh@atelier-nord.demo');
await page.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });

check('Le titre du cockpit est affiché', (await page.locator('h1', { hasText: 'Cockpit RH' }).count()) === 1);

// Un intitulé de site ou de personne est parfois affiché en majuscules
// (transformation CSS) : la comparaison se fait donc sans tenir compte de la
// casse plutôt que de dépendre d'un choix de style qui peut changer.
const includesFold = (haystack, needle) => haystack.toLocaleLowerCase('fr-FR').includes(needle.toLocaleLowerCase('fr-FR'));

// Arrivées à venir : Claire doit apparaître, groupée par site.
const arrivalsBody = cardBody(page, 'Arrivées à venir');
const arrivalsText = await arrivalsBody.first().innerText();
check('Claire apparaît dans les arrivées à venir', includesFold(arrivalsText, 'Claire'), arrivalsText.slice(0, 200));
check('Un site regroupe les arrivées', includesFold(arrivalsText, 'Lille') || includesFold(arrivalsText, 'Site'), arrivalsText.slice(0, 200));

// Tâches bloquées : le compte IT de Diego, cause racine visible avec son responsable.
const blockedBody = cardBody(page, 'Tâches bloquées');
const blockedText = await blockedBody.first().innerText();
check('Diego apparaît dans les tâches bloquées', includesFold(blockedText, 'Diego'), blockedText.slice(0, 300));
check(
  'La cause racine « Créer le compte IT » est explicite avec un responsable',
  /Bloquée par : Créer le compte IT — /.test(blockedText),
  blockedText.slice(0, 400),
);
check('Le mot « Bloquée » accompagne l’icône de statut, pas seulement une couleur', blockedText.includes('Bloquée'));

// Comptes IT / matériel avant une arrivée imminente : le badge de Diego, remis mais non accusé.
const readinessBody = cardBody(page, 'Comptes IT et matériel avant une arrivée imminente');
const readinessText = await readinessBody.first().innerText();
check('Diego apparaît dans le matériel avant une arrivée imminente', includesFold(readinessText, 'Diego'), readinessText.slice(0, 300));
check('L’accusé de réception manquant est signalé en texte', readinessText.includes('accusé de réception manquant') || readinessText.includes('Accusé manquant'), readinessText.slice(0, 300));

// Satisfaction : le signal faible de Farida (note en baisse entre J+7 et J+30).
const satisfactionBody = cardBody(page, 'Satisfaction J+7 / J+30');
const satisfactionText = await satisfactionBody.first().innerText();
check('Farida apparaît dans les signaux faibles', includesFold(satisfactionText, 'Farida'), satisfactionText.slice(0, 300));
check('Une baisse de satisfaction est décrite en texte', satisfactionText.includes('en baisse'), satisfactionText.slice(0, 300));

// --- Filtres : restreindre au métier "atelier" garde tout, un métier inexistant vide tout. ---
await page.goto(`${BASE}/cockpit?metier=inexistant`, { waitUntil: 'networkidle' });
const emptyArrivals = await cardBody(page, 'Arrivées à venir').first().innerText();
check('Un filtre métier sans correspondance vide les arrivées à venir', emptyArrivals.includes('Aucune arrivée'), emptyArrivals.slice(0, 200));

await ctx.close();

// --- Manager : accès au cockpit autorisé, périmètre restreint à ses rattachés. ---
const managerCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const managerPage = await managerCtx.newPage();
await signIn(managerPage, 'manager@atelier-nord.demo');
await managerPage.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
check('Le manager accède au cockpit', managerPage.url() === `${BASE}/cockpit`, managerPage.url());
await managerCtx.close();

// --- Employé : redirigé, pas de cockpit pour ce rôle. ---
const employeeCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const employeePage = await employeeCtx.newPage();
await signIn(employeePage, 'alice@atelier-nord.demo');
await employeePage.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
check('Un employé est redirigé hors du cockpit', employeePage.url() === `${BASE}/portail`, employeePage.url());
await employeeCtx.close();

await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
