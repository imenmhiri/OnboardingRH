/**
 * Accessibilité du cockpit RH (T-18) : contraste mesuré sur les pixels rendus
 * pour les deux palettes de démonstration (Atelier Nord bleu, Méridien Gulf
 * or), navigation clavier des filtres, et état vide informatif quand rien ne
 * correspond aux filtres.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const PASSWORD = 'OnboardingDemo!2026';
const GULF = '22222222-2222-4222-8222-222222222222';

/**
 * Le jeu de démo n'a aucun compte RH/manager chez Méridien Gulf (seule Nadia y
 * est employée) : rien n'y donne accès au cockpit. Sans un tel compte, la
 * palette or ne serait jamais mesurée nulle part — on en installe donc un,
 * hors RLS via la clé de service, sur le même principe que
 * scripts/ui-checks/auth-fixtures.mjs. Ce n'est pas une donnée de
 * démonstration : uniquement de quoi vérifier le contraste.
 */
async function ensureGulfHrVerificationAccount() {
  const env = Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index), line.slice(index + 1)];
      }),
  );
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = 'hr-verif@meridien-gulf.test';
  const { data: list } = await admin.auth.admin.listUsers();
  let userId = list?.users.find((user) => user.email === email)?.id;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Vérification Gulf' },
    });
    if (error) throw new Error(`Création du compte de vérification impossible : ${error.message}`);
    userId = data.user.id;
  }
  await admin.from('profiles').upsert({ id: userId, full_name: 'Vérification Gulf' });
  await admin.from('company_members').upsert({ company_id: GULF, user_id: userId, role: 'hr_admin' });
  return email;
}

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

// --- Contraste, palette Atelier Nord (bleu), clair et sombre. ---
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await signIn(page, 'rh@atelier-nord.demo');
  await page.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
  const result = await page.evaluate(MEASURE);
  check(
    `Contraste AA sur le cockpit, Atelier Nord (${scheme}), ${result.checked} éléments`,
    result.problems.length === 0,
    result.problems.map((p) => `"${p.text}" ${p.ratio}:1`).join(' | '),
  );
  await ctx.close();
}

// --- Contraste, palette Méridien Gulf (or), clair et sombre : la deuxième
// palette exigée par la définition de terminé. ---
const gulfEmail = await ensureGulfHrVerificationAccount();
for (const scheme of ['light', 'dark']) {
  const gulfCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, colorScheme: scheme });
  const gulfPage = await gulfCtx.newPage();
  await signIn(gulfPage, gulfEmail);
  await gulfPage.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
  const brand = await gulfPage.evaluate(() => getComputedStyle(document.querySelector('[style*="--brand"]')).getPropertyValue('--brand'));
  check(`La palette Méridien Gulf (or) est bien appliquée (${scheme})`, brand.includes('42'), brand);
  const result = await gulfPage.evaluate(MEASURE);
  check(
    `Contraste AA sur le cockpit, Méridien Gulf (${scheme}), ${result.checked} éléments`,
    result.problems.length === 0,
    result.problems.map((p) => `"${p.text}" ${p.ratio}:1`).join(' | '),
  );
  await gulfCtx.close();
}

// --- Filtres au clavier : atteindre le select de site, choisir, valider sans souris. ---
const kbCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const kbPage = await kbCtx.newPage();
await signIn(kbPage, 'rh@atelier-nord.demo');
await kbPage.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });

await kbPage.keyboard.press('Tab');
const first = await kbPage.evaluate(() => document.activeElement?.textContent?.trim());
check('Le premier Tab atteint le lien d’évitement', first === 'Aller au contenu principal', first ?? '');

const siteSelect = kbPage.locator('#cockpit-filter-site');
await siteSelect.focus();
await siteSelect.selectOption({ label: 'Siège de Lille' });
const filterButton = kbPage.getByRole('button', { name: 'Filtrer' });
await filterButton.focus();
await Promise.all([kbPage.waitForURL((url) => url.search.includes('site='), { timeout: 10000 }), kbPage.keyboard.press('Enter')]);
check('Le filtre de site s’applique au clavier, sans souris', kbPage.url().includes('site='), kbPage.url());
await kbCtx.close();

// --- État vide : filtre métier sans correspondance, message informatif. ---
const emptyCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const emptyPage = await emptyCtx.newPage();
await signIn(emptyPage, 'rh@atelier-nord.demo');
await emptyPage.goto(`${BASE}/cockpit?metier=inexistant`, { waitUntil: 'networkidle' });
const emptyState = emptyPage.locator('text=Aucune arrivée dans les quatre prochaines semaines');
check('L’état vide est informatif plutôt qu’un écran cassé', (await emptyState.count()) === 1);
await emptyCtx.close();

// --- Mobile : aucun défilement horizontal. ---
const small = await browser.newContext({ viewport: { width: 390, height: 844 } });
const smallPage = await small.newPage();
await signIn(smallPage, 'rh@atelier-nord.demo');
await smallPage.goto(`${BASE}/cockpit`, { waitUntil: 'networkidle' });
const overflow = await smallPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('Aucun défilement horizontal à 390 px', overflow === false);
await small.close();

await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
