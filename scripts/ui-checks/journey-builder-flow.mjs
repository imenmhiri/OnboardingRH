/**
 * Éprouve l'écran créateur de parcours (T-16) sur la vraie base et le vrai
 * navigateur : création, ajout de tâches avec dépendances, aperçu réel des
 * échéances, cas limites (délai négatif, dépendance supprimée, template sans
 * tâche), duplication, et le refus d'accès pour un rôle non-RH.
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

/** La tâche liée à son titre exact, jamais la puce de dépendance qui répète ce même texte. */
function taskItem(page, title) {
  return page.locator('li').filter({ has: page.locator('p.font-medium', { hasText: title }) });
}

// 1. Un role non-RH est refuse.
const itCtx = await browser.newContext();
const itPage = await itCtx.newPage();
await signIn(itPage, 'it@atelier-nord.demo');
await itPage.goto(`${BASE}/parcours`, { waitUntil: 'networkidle' });
check('Un role non-RH est renvoye hors du createur de parcours', !itPage.url().endsWith('/parcours'), itPage.url());
await itCtx.close();

// 2. Connexion RH, creation d un nouveau template.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await signIn(page, 'rh@atelier-nord.demo');
await page.goto(`${BASE}/parcours`, { waitUntil: 'networkidle' });
check('La RH accede au createur de parcours', page.url().endsWith('/parcours'));

await page.getByRole('button', { name: 'Créer un parcours' }).click();
const uniqueName = `Parcours de test ${Date.now()}`;
await page.getByLabel('Nom du template').fill(uniqueName);
await Promise.all([
  page.waitForURL((url) => /\/parcours\/[0-9a-f-]+$/.test(url.pathname), { timeout: 15000 }),
  page.getByRole('button', { name: 'Créer', exact: true }).click(),
]);
check('Le nouveau template est cree et ouvert', page.url().includes('/parcours/'));

// 3. Cas limite : template sans aucune tache.
check('Un template sans tache affiche un etat vide explicite', (await page.locator('text=Ce template n’a encore aucune tâche').count()) === 1);

// 4. Ajout d une premiere tache, avec un delai negatif (cas limite). Le
// formulaire est dans une fenetre modale : sa fermeture signale la fin de
// l'action serveur, la redirection se faisant vers la meme URL.
await page.getByRole('button', { name: 'Ajouter une tâche' }).click();
await page.getByLabel('Clé technique').fill('contract');
await page.getByLabel('Titre').fill('Contrat signé');
await page.getByLabel('Délai, en jours ouvrés').fill('-5');
await page.getByRole('button', { name: 'Ajouter la tâche' }).click();
await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
// Meme piege de timing que la puce de dependance plus bas (dialog masque des
// que Radix le detecte, avant que la redirection vers la meme URL n'ait fini
// de remplacer le contenu) : on attend l'apparition reelle plutot que de
// compter aussitot.
await taskItem(page, 'Contrat signé').first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
check('La premiere tache (delai negatif) apparait dans la liste', (await taskItem(page, 'Contrat signé').count()) === 1);

// 5. Deuxieme tache, dependante de la premiere.
await page.getByRole('button', { name: 'Ajouter une tâche' }).click();
await page.getByLabel('Clé technique').fill('welcome');
await page.getByLabel('Titre').fill('Accueil et remise du matériel');
await page.getByLabel('Délai, en jours ouvrés').fill('0');
await page.getByRole('checkbox', { name: 'Contrat signé' }).check();
await page.getByRole('button', { name: 'Ajouter la tâche' }).click();
await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
// Le formulaire redirige vers la meme page apres enregistrement : le dialogue
// disparait du DOM des que Radix le detecte, ce qui peut precéder de peu la
// fin du remplacement du contenu de la page par la nouvelle liste de taches.
// Un compte immediat pouvait donc lire zero puce par pur hasard de timing —
// defaut de script trouve pendant T-20, pas dans le produit (deja documente
// comme flaky dans T-18). Corrige en attendant l'apparition de la puce plutot
// que de la compter aussitot.
const dependencyChip = taskItem(page, 'Accueil et remise du matériel')
  .locator('text=Dépend de')
  .locator('..')
  .locator('text=Contrat signé');
await dependencyChip.first().waitFor({ state: 'visible', timeout: 15000 }).catch(() => {});
check('La dependance choisie est affichee sous forme de puce', (await dependencyChip.count()) > 0);

// 6. Apercu : une arrivee qui traverse le lundi de Paques (ferie). Le
// formulaire d'apercu reste sur place (useActionState) : on attend le
// contenu attendu plutot qu'une navigation qui n'aura jamais lieu.
await page.getByLabel('Date d’arrivée simulée').fill('2026-04-07');
await page.getByRole('button', { name: 'Calculer les échéances' }).click();
await page.getByRole('list', { name: 'Échéances calculées' }).waitFor({ timeout: 15000 });
const previewList = await page.getByRole('list', { name: 'Échéances calculées' }).locator('li').allTextContents();
check(
  'L apercu calcule des echeances reelles, en jours ouvres (le contrat traverse le ferie)',
  previewList.some((line) => line.includes('Contrat signé') && line.includes('2026-03-30')),
  previewList.join(' | '),
);
check(
  'La tache du jour meme tombe bien le jour de l arrivee simulee',
  previewList.some((line) => line.includes('Accueil') && line.includes('2026-04-07')),
);

// 7. Cas limite : suppression d une tache dont une autre depend.
await taskItem(page, 'Contrat signé').getByRole('button', { name: /Supprimer/ }).click();
const warning = await page.getByRole('alert').filter({ hasText: 'dépend' }).count();
check('La suppression avertit qu une autre tache en depend, avant confirmation', warning > 0);
const namesInWarning = await page.getByRole('alert').filter({ hasText: 'dépend' }).locator('li').allTextContents();
check('L avertissement nomme la tache concernee', namesInWarning.some((n) => n.includes('Accueil')), namesInWarning.join(', '));
await page.getByRole('button', { name: 'Annuler' }).click();
await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5000 });

// 8. Duplication vers d autres criteres. Le motif de l URL de depart matche
// deja lui-meme ; on attend un chemin different, pas seulement conforme.
const urlBeforeDuplicate = page.url();
await page.getByRole('button', { name: 'Dupliquer' }).click();
const duplicateName = `${uniqueName} (copie)`;
await Promise.all([
  page.waitForURL((url) => /\/parcours\/[0-9a-f-]+$/.test(url.pathname) && url.toString() !== urlBeforeDuplicate, { timeout: 15000 }),
  page.getByRole('button', { name: 'Dupliquer', exact: true }).click(),
]);
await page.waitForLoadState('networkidle');
check('Le template duplique porte le nouveau nom', (await page.locator(`h1:has-text("${duplicateName}")`).count()) === 1);
check('Les taches ont ete copiees dans le duplicata', (await taskItem(page, 'Contrat signé').count()) === 1);

await page.screenshot({ path: 'journey-builder.png', fullPage: true }).catch(() => {});

await ctx.close();
await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
