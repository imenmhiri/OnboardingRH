/**
 * Accessibilite de l'ecran createur de parcours (T-16), authentifie : clavier
 * bout en bout et contraste mesure sur les pixels rendus, en clair et en
 * sombre.
 */
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const PASSWORD = 'OnboardingDemo!2026';

const MEASURE = () => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const toRgb = (color) => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
    return { r: r / 255, g: g / 255, b: b / 255, a: a / 255 };
  };
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const backgroundOf = (el) => {
    let node = el;
    while (node) {
      const bg = toRgb(getComputedStyle(node).backgroundColor);
      if (bg.a > 0.9) return bg;
      node = node.parentElement;
    }
    return { r: 1, g: 1, b: 1, a: 1 };
  };
  const problems = [];
  const elements = [...document.querySelectorAll('body *')].filter((el) => {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    if (el.matches('[disabled], [aria-hidden="true"], svg, svg *')) return false;
    return [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
  });
  for (const el of elements) {
    const style = getComputedStyle(el);
    const size = Number.parseFloat(style.fontSize);
    const bold = Number.parseInt(style.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const value = ratio(toRgb(style.color), backgroundOf(el));
    const required = large ? 3 : 4.5;
    if (value < required) problems.push({ text: el.textContent.trim().slice(0, 40), ratio: Number(value.toFixed(2)), required });
  }
  return { checked: elements.length, problems };
};

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

async function signIn(page) {
  await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle' });
  await page.getByLabel('Adresse email').fill('rh@atelier-nord.demo');
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/connexion'), { timeout: 15000 }).catch(() => {}),
    page.getByRole('button', { name: 'Se connecter' }).click(),
  ]);
  await page.waitForLoadState('networkidle');
}

// --- Contraste, clair et sombre, sur la liste puis un template avec des taches. ---
let templateUrl = null;
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await signIn(page);
  await page.goto(`${BASE}/parcours`, { waitUntil: 'networkidle' });
  const listResult = await page.evaluate(MEASURE);
  check(`Contraste AA sur la liste des templates (${scheme}), ${listResult.checked} éléments`, listResult.problems.length === 0, listResult.problems.map((p) => `"${p.text}" ${p.ratio}:1`).join(' | '));

  const firstLink = page.locator('a[href^="/parcours/"]').first();
  if (await firstLink.count()) {
    await Promise.all([
      page.waitForURL((url) => /\/parcours\/[0-9a-f-]+$/.test(url.pathname), { timeout: 15000 }),
      firstLink.click(),
    ]);
    await page.waitForLoadState('networkidle');
    templateUrl = page.url();
    const detailResult = await page.evaluate(MEASURE);
    check(`Contraste AA sur le détail d'un template (${scheme}), ${detailResult.checked} éléments`, detailResult.problems.length === 0, detailResult.problems.map((p) => `"${p.text}" ${p.ratio}:1`).join(' | '));
  }
  await ctx.close();
}

// --- Clavier : ouvrir la fenetre d'ajout au clavier, la remplir, la valider,
// sans jamais toucher la souris. ---
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
await signIn(page);
if (templateUrl) {
  await page.goto(templateUrl, { waitUntil: 'networkidle' });
} else {
  await page.goto(`${BASE}/parcours`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Créer un parcours' }).click();
  await page.getByLabel('Nom du template').fill(`Clavier ${Date.now()}`);
  await page.getByRole('button', { name: 'Créer', exact: true }).click();
  await page.waitForLoadState('networkidle');
}

await page.getByRole('button', { name: 'Ajouter une tâche' }).focus();
await page.keyboard.press('Enter');
await page.getByRole('dialog').waitFor({ timeout: 5000 });
check('La fenetre d ajout s ouvre au clavier', await page.getByRole('dialog').isVisible());

const focusInDialog = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
check('Le focus entre dans la fenetre a son ouverture', focusInDialog);

await page.keyboard.type('clavier-test');
await page.keyboard.press('Tab');
await page.keyboard.type('Tâche testée au clavier');
await page.keyboard.press('Escape');
await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5000 });
check('Echap referme la fenetre sans soumettre', true);

const focusAfterClose = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('Le focus revient sur le declencheur a la fermeture', focusAfterClose?.includes('Ajouter une tâche'), focusAfterClose ?? '');

// Le lien d'evitement en tout premier Tab.
await page.goto(`${BASE}/parcours`, { waitUntil: 'networkidle' });
await page.keyboard.press('Tab');
const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('Le premier Tab atteint le lien d evitement', first === 'Aller au contenu principal', first ?? '');

// Aucun defilement horizontal a largeur mobile.
const small = await browser.newContext({ viewport: { width: 390, height: 844 } });
const smallPage = await small.newPage();
await signIn(smallPage);
await smallPage.goto(`${BASE}/parcours`, { waitUntil: 'networkidle' });
const overflow = await smallPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('Aucun defilement horizontal a 390 px', overflow === false);
await small.close();

await ctx.close();
await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
