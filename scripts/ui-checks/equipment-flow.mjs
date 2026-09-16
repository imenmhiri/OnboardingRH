/**
 * Éprouve la gestion du matériel (T-19) sur la vraie base et le vrai
 * navigateur : file de préparation groupée par arrivée, commande groupée pour
 * un même modèle demandé par deux arrivées le même jour, attribution d'une
 * unité identifiée, remise, reprise avant l'arrivée, nouvelle demande, et
 * l'accusé de réception depuis le portail employé. Termine par la garde
 * d'accès par rôle, garantie par la RLS et rejouée ici côté écran.
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

// Un intitulé de site ou de personne est parfois transforme en majuscules par
// CSS (uppercase) : la comparaison se fait sans tenir compte de la casse.
const includesFold = (haystack, needle) => haystack.toLocaleLowerCase('fr-FR').includes(needle.toLocaleLowerCase('fr-FR'));

function cardBody(page, title) {
  return page.locator('h2', { hasText: title }).locator('xpath=../../following-sibling::div[1]');
}

/**
 * Une action de cet ecran redirige toujours vers la meme URL (/materiel) :
 * `waitForURL` s'y satisferait immediatement sans attendre la navigation.
 * On attend plutot le prochain chargement de document.
 */
async function submitAndWait(page, locator) {
  await Promise.all([page.waitForLoadState('networkidle'), page.waitForEvent('framenavigated'), locator.click()]);
}

// --- IT : atterrit directement sur /materiel (T-19 change la destination par défaut). ---
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
await signIn(page, 'it@atelier-nord.demo');
// La connexion enchaine deux redirections serveur (/connexion -> / -> /materiel) :
// on laisse explicitement le temps a la seconde de se resoudre avant de lire l'URL.
await page.waitForURL((url) => url.pathname === '/materiel', { timeout: 10000 }).catch(() => {});
check('L’IT atterrit directement sur la file de matériel', page.url() === `${BASE}/materiel`, page.url());
check('Le titre de l’écran matériel est affiché', (await page.locator('h1', { hasText: 'Matériel' }).count()) === 1);

// Commandes à grouper : Claire et Diego demandent le même ordinateur le même
// jour, regroupés en une seule commande.
const groupsBody = cardBody(page, 'Commandes à grouper');
const groupsText = await groupsBody.first().innerText();
check('Le modèle partagé par Claire et Diego apparaît groupé', includesFold(groupsText, 'Ordinateur portable standard') && groupsText.includes('× 2'), groupsText.slice(0, 300));
check('Les deux arrivées concernées sont nommées', includesFold(groupsText, 'Claire') && includesFold(groupsText, 'Diego'), groupsText.slice(0, 300));

// File de préparation, par arrivée : Diego apparaît avec son badge remis, non accusé.
const queueBody = cardBody(page, 'File de préparation, par arrivée');
const queueText = await queueBody.first().innerText();
check('Diego apparaît dans la file, groupé par arrivée', includesFold(queueText, 'Diego'), queueText.slice(0, 300));
check('Le badge remis de Diego signale l’attente d’un accusé, en texte', queueText.includes('Remis') && includesFold(queueText, 'attente de l’accusé de réception'), queueText.slice(0, 400));

// --- Commander le groupe (Claire + Diego, ordinateur standard). ---
const orderButton = page.locator('li', { hasText: 'Ordinateur portable standard' }).getByRole('button', { name: 'Marquer commandé' });
await submitAndWait(page, orderButton);
const groupsAfterOrder = await cardBody(page, 'Commandes à grouper').first().innerText();
check('Le groupe commandé disparaît des commandes à grouper', !includesFold(groupsAfterOrder, 'Ordinateur portable standard'), groupsAfterOrder.slice(0, 300));
const queueAfterOrder = await cardBody(page, 'File de préparation, par arrivée').first().innerText();
check('Les deux ordinateurs commandés apparaissent « Commandé »', (queueAfterOrder.match(/Commandé/g) ?? []).length >= 2, queueAfterOrder.slice(0, 500));

// --- Attribuer une unité identifiée à l’ordinateur de Claire. ---
const claireLaptopRow = page.locator('li', { hasText: 'Claire' }).filter({ has: page.locator('text=Ordinateur portable standard') });
await claireLaptopRow.getByRole('button', { name: 'Attribuer' }).click();
const assignDialog = page.getByRole('dialog', { name: 'Attribuer une unité' });
await assignDialog.waitFor({ timeout: 5000 });
await assignDialog.getByLabel('Numéro de série ou de badge').fill('SN-VERIF-001');
await assignDialog.getByRole('button', { name: 'Attribuer' }).click();
// Pas de fermeture automatique (comme le dépôt de document, T-17) : l’état se
// met à jour derrière la fenêtre, qu’on referme ensuite explicitement.
await page.waitForTimeout(800);
const assignError = await assignDialog.locator('[role="alert"]').count();
check('L’attribution ne renvoie pas d’erreur', assignError === 0);
await page.keyboard.press('Escape');
await assignDialog.waitFor({ state: 'hidden', timeout: 5000 });
const queueAfterAssign = await cardBody(page, 'File de préparation, par arrivée').first().innerText();
check('L’unité attribuée à Claire porte son numéro de série', queueAfterAssign.includes('SN-VERIF-001') && includesFold(queueAfterAssign, 'Attribué'), queueAfterAssign.slice(0, 600));

// --- Reprendre l’attribution avant l’arrivée (cas limite du ticket). ---
const claireAssignedRow = page.locator('li', { hasText: 'SN-VERIF-001' }).first();
await submitAndWait(page, claireAssignedRow.getByRole('button', { name: 'Reprendre l’attribution' }));
const groupsAfterReclaim = await cardBody(page, 'Commandes à grouper').first().innerText();
check('Une unité reprise avant l’arrivée redevient à commander', includesFold(groupsAfterReclaim, 'Ordinateur portable standard'), groupsAfterReclaim.slice(0, 300));
const queueAfterReclaim = await cardBody(page, 'File de préparation, par arrivée').first().innerText();
check('Le numéro de série repris ne s’affiche plus', !queueAfterReclaim.includes('SN-VERIF-001'), queueAfterReclaim.slice(0, 600));

// --- Remettre l’ordinateur de Diego, deja commande a l’etape groupee. ---
const diegoLaptopRow = page.locator('li', { hasText: 'Diego' }).filter({ has: page.locator('text=Ordinateur portable standard') });
await diegoLaptopRow.getByRole('button', { name: 'Attribuer' }).click();
const secondAssignDialog = page.getByRole('dialog', { name: 'Attribuer une unité' });
await secondAssignDialog.waitFor({ timeout: 5000 });
await secondAssignDialog.getByLabel('Numéro de série ou de badge').fill('SN-VERIF-DIEGO');
await secondAssignDialog.getByRole('button', { name: 'Attribuer' }).click();
await page.waitForTimeout(800);
await page.keyboard.press('Escape');
await secondAssignDialog.waitFor({ state: 'hidden', timeout: 5000 });
const diegoRowAssigned = page.locator('li', { hasText: 'Diego' }).filter({ hasText: 'SN-VERIF-DIEGO' });
await submitAndWait(page, diegoRowAssigned.getByRole('button', { name: 'Remettre' }));
const queueAfterHandover = await cardBody(page, 'File de préparation, par arrivée').first().innerText();
check(
  'Le second matériel de Diego, une fois remis, attend aussi son accusé de réception',
  (queueAfterHandover.match(/attente de l’accusé de réception/g) ?? []).length >= 2,
  queueAfterHandover.slice(0, 800),
);

// --- Nouvelle demande de matériel, depuis le catalogue. ---
await page.getByRole('button', { name: 'Nouvelle demande' }).click();
const requestDialog = page.getByRole('dialog', { name: 'Demander du matériel' });
await requestDialog.waitFor({ timeout: 5000 });
const journeySelect = requestDialog.locator('select[name="journeyId"]');
const claireOptionLabel = (await journeySelect.locator('option').allTextContents()).find((label) => includesFold(label, 'Claire'));
await journeySelect.selectOption({ label: claireOptionLabel });
await requestDialog.getByLabel(/Casque audio/).check();
await submitAndWait(page, requestDialog.getByRole('button', { name: 'Demander' }));
const queueAfterRequest = await cardBody(page, 'File de préparation, par arrivée').first().innerText();
check('La nouvelle demande de casque pour Claire apparaît, au statut Demandé', includesFold(queueAfterRequest, 'Casque audio'), queueAfterRequest.slice(0, 800));

await ctx.close();

// --- RH : atteint aussi /materiel, depuis le lien du cockpit. ---
const hrCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const hrPage = await hrCtx.newPage();
await signIn(hrPage, 'rh@atelier-nord.demo');
await hrPage.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
await Promise.all([hrPage.waitForURL(`${BASE}/materiel`, { timeout: 10000 }), hrPage.getByRole('link', { name: 'Matériel' }).click()]);
check('La RH atteint l’écran matériel depuis le cockpit', hrPage.url() === `${BASE}/materiel`, hrPage.url());
await Promise.all([hrPage.waitForURL(`${BASE}/cockpit`, { timeout: 10000 }), hrPage.getByRole('link', { name: 'Cockpit RH' }).click()]);
check('La RH retourne au cockpit depuis l’écran matériel', hrPage.url() === `${BASE}/cockpit`, hrPage.url());
await hrCtx.close();

// --- Rôles hors périmètre : manager et employé n’atteignent pas /materiel. ---
const managerCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const managerPage = await managerCtx.newPage();
await signIn(managerPage, 'manager@atelier-nord.demo');
await managerPage.goto(`${BASE}/materiel`, { waitUntil: 'networkidle' });
check('Un manager est redirigé hors de l’écran matériel', managerPage.url() === `${BASE}/portail`, managerPage.url());
await managerCtx.close();

const employeeCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const employeePage = await employeeCtx.newPage();
await signIn(employeePage, 'claire@atelier-nord.demo');
await employeePage.goto(`${BASE}/materiel`, { waitUntil: 'networkidle' });
check('Un employé est redirigé hors de l’écran matériel', employeePage.url() === `${BASE}/portail`, employeePage.url());
await employeeCtx.close();

// --- Accusé de réception, depuis le portail employé (Alice, casque remis). ---
const ackCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ackPage = await ackCtx.newPage();
await signIn(ackPage, 'alice@atelier-nord.demo');
await ackPage.waitForURL((url) => url.pathname === '/portail', { timeout: 10000 }).catch(() => {});
check('Alice atterrit sur son portail', ackPage.url() === `${BASE}/portail`, ackPage.url());

const equipmentCard = cardBody(ackPage, 'Mon matériel');
const equipmentText = await equipmentCard.first().innerText();
check('Le casque remis à Alice attend sa confirmation', includesFold(equipmentText, 'Casque audio'), equipmentText.slice(0, 300));

await equipmentCard.getByRole('button', { name: /Confirmer la réception/ }).click();
await ackPage.getByText('Réception confirmée').first().waitFor({ timeout: 8000 });
check('La confirmation de réception s’affiche sans rechargement de page', true);

await ackPage.reload({ waitUntil: 'networkidle' });
const equipmentAfterReload = await cardBody(ackPage, 'Mon matériel').first().innerText();
check('Une fois confirmé, le casque ne réapparaît plus à confirmer', !includesFold(equipmentAfterReload, 'Casque audio'), equipmentAfterReload.slice(0, 300));
await ackCtx.close();

await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
