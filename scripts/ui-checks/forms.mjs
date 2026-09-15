import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:3000/design', { waitUntil: 'networkidle' });

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

// Erreur de saisie : liee au champ et annoncee, pas seulement rouge.
const input = page.getByLabel('Email professionnel').first();
await input.fill('adresse-sans-arobase');
await page.waitForTimeout(150);
const linked = await page.evaluate(() => {
  const field = document.querySelector('input[type="email"]');
  const described = field?.getAttribute('aria-describedby')?.split(' ') ?? [];
  const messages = described.map((id) => document.getElementById(id)).filter(Boolean);
  return {
    invalid: field?.getAttribute('aria-invalid'),
    hasAlert: messages.some((m) => m.getAttribute('role') === 'alert'),
    texts: messages.map((m) => m.textContent?.trim()),
  };
});
check("Le champ est marque invalide", linked.invalid === 'true', String(linked.invalid));
check("L erreur est liee au champ et annoncee", linked.hasAlert, JSON.stringify(linked.texts));

// Fenetre modale : le focus revient sur le declencheur a la fermeture.
const trigger = page.getByRole('button', { name: 'Reporter l’arrivée' }).first();
await trigger.focus();
await page.keyboard.press('Enter');
await page.waitForSelector('[role="dialog"]');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
const restored = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('Le focus revient sur le declencheur', restored === 'Reporter l’arrivée', restored ?? '');

// Un seul h1, et des niveaux de titre dans l ordre.
const headings = await page.evaluate(() =>
  [...document.querySelectorAll('h1,h2,h3,h4')].map((h) => Number(h.tagName[1])),
);
check('Un seul h1 sur la page', headings.filter((l) => l === 1).length === 1);
check(
  'Aucun niveau de titre saute',
  headings.every((level, index) => index === 0 || level - headings[index - 1] <= 1),
  headings.join(','),
);

await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
