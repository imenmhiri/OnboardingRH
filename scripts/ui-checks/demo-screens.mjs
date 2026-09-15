/**
 * Ouvre les écrans authentifiés avec les comptes du jeu de démonstration
 * (T-08), mesure le contraste réellement rendu sur chacun, et capture des
 * images. Les écrans authentifiés n'étaient jusque-là vérifiés qu'en apparence.
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
    if (value < required) {
      problems.push({ text: el.textContent.trim().slice(0, 40), ratio: Number(value.toFixed(2)), required });
    }
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
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.waitForURL((url) => ['/cockpit', '/portail'].includes(url.pathname), { timeout: 15000 });
  await page.waitForLoadState('networkidle');
}

const screens = [
  { label: 'cockpit RH', email: 'rh@atelier-nord.demo', shot: 'demo-cockpit' },
  { label: 'portail employé', email: 'alice@atelier-nord.demo', shot: 'demo-portail' },
];

for (const scheme of ['light', 'dark']) {
  for (const screen of screens) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: scheme });
    const page = await context.newPage();
    await signIn(page, screen.email);
    const { checked, problems } = await page.evaluate(MEASURE);
    check(
      `Contraste AA sur le ${screen.label} (${scheme}), ${checked} éléments`,
      problems.length === 0,
      problems.map((p) => `"${p.text}" ${p.ratio}:1`).join(' | '),
    );
    if (scheme === 'light') {
      await page.screenshot({ path: `${screen.shot}.png`, fullPage: true });
    }
    await context.close();
  }
}

// La bascule de société, avec les comptes de démonstration cette fois.
const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
const page = await context.newPage();
await signIn(page, 'nadia@groupe.demo');
const firstCompany = (await page.locator('header p').first().textContent())?.trim();
await page.getByLabel('Société active').selectOption({ label: 'Méridien Gulf' });
await Promise.all([
  page.waitForURL((url) => url.pathname === '/portail', { timeout: 15000 }).catch(() => {}),
  page.getByRole('button', { name: 'Changer' }).click(),
]);
await page.waitForTimeout(500);
await page.waitForLoadState('networkidle');
const secondCompany = (await page.locator('header p').first().textContent())?.trim();
check(
  'Le compte de démonstration multi-sociétés bascule bien',
  firstCompany === 'Atelier Nord' && secondCompany === 'Méridien Gulf',
  `${firstCompany} -> ${secondCompany}`,
);
await page.screenshot({ path: 'demo-gulf.png', fullPage: true });
await context.close();

await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
