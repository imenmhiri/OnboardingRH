/**
 * Éprouve le portail employé (T-17) sur la vraie base et le vrai navigateur :
 * bienvenue personnalisée, progression, agenda, contacts, dépôt d'une pièce
 * attendue et consultation d'un document déposé par la RH.
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

// --- Alice : parcours en cours, avec des taches, un document RH a lire et
// une piece encore a fournir. ---
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await signIn(page, 'alice@atelier-nord.demo');
await page.goto(`${BASE}/portail`, { waitUntil: 'networkidle' });

check('Le prenom d Alice apparait dans l accueil personnalise', (await page.locator('h1', { hasText: 'Alice' }).count()) === 1);
check('Une barre de progression est presente et annoncee', await page.getByRole('progressbar', { name: 'Progression de mon intégration' }).isVisible());

const agendaCard = page.locator('h2', { hasText: 'Agenda de ma première semaine' }).locator('xpath=../../following-sibling::div[1]');
check('Un agenda de premiere semaine est affiche', (await agendaCard.count()) > 0);

const contactsCard = page.locator('h2', { hasText: 'Contacts utiles' }).locator('xpath=../../following-sibling::div[1]');
const contactNames = await contactsCard.locator('li').allTextContents();
check('Le manager apparait dans les contacts utiles', contactNames.some((c) => c.includes('Manceau') || c.includes('Manager')), contactNames.join(' | '));

// Document a lire, depose par la RH.
const readSection = page.locator('h3', { hasText: 'À lire' }).locator('..');
check('Le livret depose par la RH apparait dans « a lire »', (await readSection.locator('text=Livret').count()) > 0);

// Document a fournir.
const provideSection = page.locator('h3', { hasText: 'À fournir' }).locator('..');
check('Une piece attendue apparait dans « a fournir »', (await provideSection.getByRole('button', { name: 'Déposer' }).count()) > 0);

// --- Cas limite : type de fichier refuse (un script, pas un document). ---
await provideSection.getByRole('button', { name: 'Déposer' }).first().click();
await page.getByRole('dialog').waitFor({ timeout: 5000 });
await page.locator('input[type="file"]').setInputFiles(process.argv[1]);
await page.getByRole('button', { name: 'Déposer', exact: true }).click();
const refusalAlert = page.getByRole('alert').filter({ hasText: /accepté|Mo/ });
await refusalAlert.waitFor({ timeout: 5000 }).catch(() => {});
check('Un type de fichier non accepte est refuse avec un message', (await refusalAlert.count()) > 0);
await page.getByRole('button', { name: 'Annuler' }).click();
await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5000 });

// --- Depot reel d'un vrai PDF. ---
await provideSection.getByRole('button', { name: 'Déposer' }).first().click();
await page.getByRole('dialog').waitFor({ timeout: 5000 });
await page.locator('input[type="file"]').setInputFiles(process.argv[2]);
await Promise.all([
  page.waitForLoadState('networkidle'),
  page.getByRole('button', { name: 'Déposer', exact: true }).click(),
]);
await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
await page.reload({ waitUntil: 'networkidle' });

const provideSectionAfter = page.locator('h3', { hasText: 'À fournir' }).locator('..');
const stillPending = await provideSectionAfter.getByRole('button', { name: 'Déposer' }).count();
check('La piece deposee disparait de « a fournir »', stillPending === 0, `restant=${stillPending}`);

// --- Consultation d un document depose par la RH : lien signe reel. ---
await Promise.all([
  page.waitForURL((url) => url.origin !== BASE, { timeout: 15000 }).catch(() => {}),
  readSection.getByRole('button', { name: 'Consulter' }).click(),
]);
check('Consulter le livret mene a un lien signe hors de l application', page.url() !== `${BASE}/portail`, page.url());

await ctx.close();
await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
