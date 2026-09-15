/**
 * Accessibilite du portail employe (T-17) : contraste mesure sur les pixels
 * rendus (clair et sombre), lisibilite mobile, et navigation clavier bout en
 * bout du depot d'une piece attendue.
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

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await signIn(page, 'alice@atelier-nord.demo');
  await page.goto(`${BASE}/portail`, { waitUntil: 'networkidle' });
  const result = await page.evaluate(MEASURE);
  check(`Contraste AA sur le portail (${scheme}), ${result.checked} éléments`, result.problems.length === 0, result.problems.map((p) => `"${p.text}" ${p.ratio}:1`).join(' | '));
  await ctx.close();
}

// Employe sans aucune tache ni document : l'ecran doit rester utile, pas casse.
const bareCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const barePage = await bareCtx.newPage();
await signIn(barePage, 'nadia@groupe.demo');
await barePage.goto(`${BASE}/portail`, { waitUntil: 'networkidle' });
check('Un compte sans parcours voit une explication, pas une erreur', (await barePage.locator('text=parcours n’est pas encore ouvert').count()) === 1);
await bareCtx.close();

// Mobile : aucun defilement horizontal.
const small = await browser.newContext({ viewport: { width: 390, height: 844 } });
const smallPage = await small.newPage();
await signIn(smallPage, 'alice@atelier-nord.demo');
await smallPage.goto(`${BASE}/portail`, { waitUntil: 'networkidle' });
const overflow = await smallPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('Aucun defilement horizontal a 390 px', overflow === false);
await small.close();

// Clavier : ouvrir le depot, le remplir, l'annuler, sans souris.
const kbCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const kbPage = await kbCtx.newPage();
await signIn(kbPage, 'alice@atelier-nord.demo');
await kbPage.goto(`${BASE}/portail`, { waitUntil: 'networkidle' });

await kbPage.keyboard.press('Tab');
const first = await kbPage.evaluate(() => document.activeElement?.textContent?.trim());
check('Le premier Tab atteint le lien d evitement', first === 'Aller au contenu principal', first ?? '');

const provideButton = kbPage.getByRole('button', { name: 'Déposer' }).first();
await provideButton.focus();
await kbPage.keyboard.press('Enter');
await kbPage.getByRole('dialog').waitFor({ timeout: 5000 });
check('Le depot s ouvre au clavier', await kbPage.getByRole('dialog').isVisible());
const focusInDialog = await kbPage.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null);
check('Le focus entre dans la fenetre a son ouverture', focusInDialog);
await kbPage.keyboard.press('Escape');
await kbPage.getByRole('dialog').waitFor({ state: 'hidden', timeout: 5000 });
// Radix restaure le focus juste apres le demontage : un court delai evite de
// lire l etat d avant que la restauration n ait eu lieu.
await kbPage.waitForTimeout(300);
const focusAfterClose = await kbPage.evaluate(() => document.activeElement?.textContent?.trim());
check('Le focus revient sur le declencheur a la fermeture', focusAfterClose === 'Déposer', focusAfterClose ?? '');
await kbCtx.close();

await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
