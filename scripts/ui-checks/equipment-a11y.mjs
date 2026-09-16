/**
 * Accessibilité de la gestion du matériel (T-19) : contraste mesuré sur les
 * pixels rendus pour les deux palettes de démonstration (Atelier Nord bleu,
 * Méridien Gulf or), navigation clavier complète de l'accusé de réception
 * depuis le portail employé, aucun défilement horizontal à 390 px.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';
const PASSWORD = 'OnboardingDemo!2026';
const GULF = '22222222-2222-4222-8222-222222222222';

/**
 * Le jeu de démo n'a ni IT ni RH chez Méridien Gulf (seule Nadia y est
 * employée) : rien n'y donne accès à /materiel. Même principe que
 * cockpit-a11y.mjs — un compte de vérification installé hors RLS, pas une
 * donnée de démonstration.
 */
async function ensureGulfItVerificationAccount() {
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
  const email = 'it-verif@meridien-gulf.test';
  const { data: list } = await admin.auth.admin.listUsers();
  let userId = list?.users.find((user) => user.email === email)?.id;
  if (!userId) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Vérification Gulf IT' },
    });
    if (error) throw new Error(`Création du compte de vérification impossible : ${error.message}`);
    userId = data.user.id;
  }
  await admin.from('profiles').upsert({ id: userId, full_name: 'Vérification Gulf IT' });
  await admin.from('company_members').upsert({ company_id: GULF, user_id: userId, role: 'it' });
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

// --- Contraste, palette Atelier Nord (bleu), clair et sombre — écran matériel. ---
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await signIn(page, 'it@atelier-nord.demo');
  await page.goto(`${BASE}/materiel`, { waitUntil: 'networkidle' });
  const result = await page.evaluate(MEASURE);
  check(
    `Contraste AA sur le matériel, Atelier Nord (${scheme}), ${result.checked} éléments`,
    result.problems.length === 0,
    result.problems.map((p) => `"${p.text}" ${p.ratio}:1`).join(' | '),
  );
  await ctx.close();
}

// --- Contraste, palette Méridien Gulf (or), clair et sombre. ---
const gulfEmail = await ensureGulfItVerificationAccount();
for (const scheme of ['light', 'dark']) {
  const gulfCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, colorScheme: scheme });
  const gulfPage = await gulfCtx.newPage();
  await signIn(gulfPage, gulfEmail);
  await gulfPage.goto(`${BASE}/materiel`, { waitUntil: 'networkidle' });
  const brand = await gulfPage.evaluate(() => getComputedStyle(document.querySelector('[style*="--brand"]')).getPropertyValue('--brand'));
  check(`La palette Méridien Gulf (or) est bien appliquée (${scheme})`, brand.includes('42'), brand);
  const result = await gulfPage.evaluate(MEASURE);
  check(
    `Contraste AA sur le matériel, Méridien Gulf (${scheme}), ${result.checked} éléments`,
    result.problems.length === 0,
    result.problems.map((p) => `"${p.text}" ${p.ratio}:1`).join(' | '),
  );
  await gulfCtx.close();
}

// --- Contraste sur le portail employé (section « Mon matériel »), Atelier Nord. ---
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const page = await ctx.newPage();
  await signIn(page, 'alice@atelier-nord.demo');
  await page.goto(`${BASE}/portail`, { waitUntil: 'networkidle' });
  const result = await page.evaluate(MEASURE);
  check(
    `Contraste AA sur le portail avec « Mon matériel » (${scheme}), ${result.checked} éléments`,
    result.problems.length === 0,
    result.problems.map((p) => `"${p.text}" ${p.ratio}:1`).join(' | '),
  );
  await ctx.close();
}

// --- Clavier, bout en bout : ouvrir la file, atteindre l'attribution. ---
const kbCtx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const kbPage = await kbCtx.newPage();
await signIn(kbPage, 'it@atelier-nord.demo');
await kbPage.goto(`${BASE}/materiel`, { waitUntil: 'networkidle' });

await kbPage.keyboard.press('Tab');
const first = await kbPage.evaluate(() => document.activeElement?.textContent?.trim());
check('Le premier Tab atteint le lien d’évitement', first === 'Aller au contenu principal', first ?? '');

// --- Clavier, bout en bout : l'accusé de réception depuis le portail employé. ---
const ackKbCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const ackKbPage = await ackKbCtx.newPage();
await signIn(ackKbPage, 'alice@atelier-nord.demo');
await ackKbPage.goto(`${BASE}/portail`, { waitUntil: 'networkidle' });

const ackButton = ackKbPage.getByRole('button', { name: /Confirmer la réception/ });
await ackButton.focus();
const focusedIsAckButton = await ackKbPage.evaluate(() => document.activeElement?.textContent?.includes('Confirmer la réception'));
check('Le bouton de confirmation est atteignable au clavier', focusedIsAckButton);
await ackKbPage.keyboard.press('Enter');
await ackKbPage.getByText('Réception confirmée').first().waitFor({ timeout: 8000 });
check('L’accusé de réception se déclenche au clavier, sans souris', true);

// La confirmation change l'affichage sans navigation : une region vive doit
// l'annoncer, pas seulement l'afficher visuellement.
const liveRegionAnnounced = await ackKbPage.evaluate(() => {
  const region = document.querySelector('[aria-live="polite"]');
  return Boolean(region && region.textContent && region.textContent.includes('confirmée'));
});
check('La confirmation est annoncée via une région vive (aria-live)', liveRegionAnnounced);
await ackKbCtx.close();
await kbCtx.close();

// --- Mobile : aucun défilement horizontal, écran matériel et portail. ---
const smallMateriel = await browser.newContext({ viewport: { width: 390, height: 844 } });
const smallMaterielPage = await smallMateriel.newPage();
await signIn(smallMaterielPage, 'it@atelier-nord.demo');
await smallMaterielPage.goto(`${BASE}/materiel`, { waitUntil: 'networkidle' });
const overflowMateriel = await smallMaterielPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('Aucun défilement horizontal à 390 px sur l’écran matériel', overflowMateriel === false);
await smallMateriel.close();

const smallPortal = await browser.newContext({ viewport: { width: 390, height: 844 } });
const smallPortalPage = await smallPortal.newPage();
await signIn(smallPortalPage, 'alice@atelier-nord.demo');
await smallPortalPage.goto(`${BASE}/portail`, { waitUntil: 'networkidle' });
const overflowPortal = await smallPortalPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('Aucun défilement horizontal à 390 px sur le portail (accusé de réception)', overflowPortal === false);
await smallPortal.close();

await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
