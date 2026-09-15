/**
 * Eprouve le parcours d'authentification sur la vraie application et la vraie
 * base : connexion, resolution de la societe active, bascule, URL forgee,
 * compte sans societe, deconnexion.
 */
import { chromium } from 'playwright';
import { ACCOUNTS, installAccounts } from './auth-fixtures.mjs';

const BASE = 'http://127.0.0.1:3000';
await installAccounts();

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

async function signIn(page, account) {
  await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle' });
  await page.getByLabel('Adresse email').fill(account.email);
  await page.getByLabel('Mot de passe').fill(account.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/connexion'), { timeout: 15000 }).catch(() => {}),
    page.getByRole('button', { name: 'Se connecter' }).click(),
  ]);
  // La connexion passe par la racine, qui aiguille selon le role.
  await page.waitForURL((url) => ['/cockpit', '/portail'].includes(url.pathname), { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
}

// 1. Un visiteur non connecte est renvoye vers la connexion.
const anon = await browser.newContext();
const anonPage = await anon.newPage();
await anonPage.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
check('Un visiteur non connecte est renvoye vers la connexion', anonPage.url().endsWith('/connexion'), anonPage.url());

// 2. Mot de passe faux : message unique, pas de fuite sur l existence du compte.
await anonPage.getByLabel('Adresse email').fill(ACCOUNTS.hr.email);
await anonPage.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
await anonPage.getByRole('button', { name: 'Se connecter' }).click();
// Next injecte son propre annonceur de route en role=alert : on vise le formulaire.
await anonPage.waitForSelector('form [role="alert"]');
const message = (await anonPage.locator('form [role="alert"]').first().textContent())?.trim();
check('Un echec de connexion est annonce sans distinguer compte et mot de passe',
  message === 'Adresse ou mot de passe incorrect.', message ?? '');
await anon.close();

// 3. La RH atterrit sur le cockpit, sous la marque de sa societe.
const hr = await browser.newContext();
const hrPage = await hr.newPage();
await signIn(hrPage, ACCOUNTS.hr);
check('La RH atterrit sur le cockpit', hrPage.url().endsWith('/cockpit'), hrPage.url());
const hrCompany = (await hrPage.locator('header p').first().textContent())?.trim();
check('L en-tete nomme la societe active', hrCompany === 'Atelier Nord', hrCompany ?? '');
const hrBrand = await hrPage.evaluate(() =>
  getComputedStyle(document.querySelector('header span[aria-hidden]')).backgroundColor);

// 4. Un utilisateur d une seule societe n a pas de selecteur.
check('Pas de selecteur pour un membre d une seule societe',
  (await hrPage.getByLabel('Société active').count()) === 0);
await hr.close();

// 5. Membre de deux societes : bascule, changement de role et de marque.
const multi = await browser.newContext();
const multiPage = await multi.newPage();
await signIn(multiPage, ACCOUNTS.multi);
check('Un manager atterrit sur le cockpit', multiPage.url().endsWith('/cockpit'), multiPage.url());
const firstRole = (await multiPage.locator('header p').nth(1).textContent())?.trim();
const firstBrand = await multiPage.evaluate(() =>
  getComputedStyle(document.querySelector('header span[aria-hidden]')).backgroundColor);

await multiPage.getByLabel('Société active').selectOption({ label: 'Méridien Gulf' });
await Promise.all([
  multiPage.waitForURL(() => true, { timeout: 15000 }).catch(() => {}),
  multiPage.getByRole('button', { name: 'Changer' }).click(),
]);
await multiPage.waitForTimeout(500);
await multiPage.waitForLoadState('networkidle');

const secondCompany = (await multiPage.locator('header p').first().textContent())?.trim();
const secondRole = (await multiPage.locator('header p').nth(1).textContent())?.trim();
const secondBrand = await multiPage.evaluate(() =>
  getComputedStyle(document.querySelector('header span[aria-hidden]')).backgroundColor);

check('La bascule change de societe', secondCompany === 'Méridien Gulf', secondCompany ?? '');
check('La bascule change le role', firstRole === 'Manager' && secondRole === 'Employé', `${firstRole} -> ${secondRole}`);
check('La bascule repeint la marque', firstBrand !== secondBrand, `${firstBrand} -> ${secondBrand}`);
check('La marque vient bien de la base, pas d une constante', hrBrand === firstBrand, `${hrBrand} / ${firstBrand}`);
check('Un employe est renvoye du cockpit vers son portail', multiPage.url().endsWith('/portail'), multiPage.url());

// 6. Cookie forge vers une societe dont on n est pas membre.
await multi.addCookies([{ name: 'onboarding_active_company', value: '99999999-9999-4999-8999-999999999999', url: BASE }]);
await multiPage.goto(`${BASE}/portail`, { waitUntil: 'networkidle' });
const refusal = (await multiPage.locator('main').innerText()).trim();
const refused = refusal.includes('Société non autorisée');
check('Une societe forgee est refusee explicitement', refused, refusal.slice(0, 60));
if (refused) {
  await multiPage.getByRole('button', { name: 'Revenir à ma société' }).click();
  await multiPage.waitForLoadState('networkidle');
}
const backHome = (await multiPage.locator('header p').first().textContent())?.trim();
check('Le retour ramene sur une societe legitime', ['Atelier Nord', 'Méridien Gulf'].includes(backHome ?? ''), backHome ?? '');

// 7. Deconnexion.
await Promise.all([
  multiPage.waitForURL((url) => url.pathname === '/connexion', { timeout: 15000 }).catch(() => {}),
  multiPage.getByRole('button', { name: 'Se déconnecter' }).click(),
]);
await multiPage.waitForLoadState('networkidle');
check('La deconnexion ramene a la page de connexion', multiPage.url().endsWith('/connexion'), multiPage.url());
await multi.close();

// 8. Compte sans aucune societe : message explicite, pas de page blanche.
const orphan = await browser.newContext();
const orphanPage = await orphan.newPage();
await signIn(orphanPage, ACCOUNTS.orphan);
const orphanText = (await orphanPage.locator('main').textContent())?.trim() ?? '';
check('Un compte sans societe recoit une explication',
  orphanText.includes('Aucune société rattachée'), orphanText.slice(0, 80));
await orphan.close();

await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
