import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto('http://127.0.0.1:3000/design', { waitUntil: 'networkidle' });

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
};

// 1. Le premier Tab atteint le lien d'evitement.
await page.keyboard.press('Tab');
const first = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('Le premier Tab atteint le lien d evitement', first === 'Aller au contenu principal', first ?? '');

// 2. Tout element interactif porte un nom accessible.
const unnamed = await page.evaluate(() => {
  const selector = 'button, a[href], input, select, textarea, [role="tab"], [role="combobox"]';
  return [...document.querySelectorAll(selector)]
    .filter((el) => el.offsetParent !== null)
    .filter((el) => {
      const label = (
        el.getAttribute('aria-label') ||
        el.textContent ||
        (el.id && document.querySelector(`label[for="${el.id}"]`)?.textContent) ||
        el.getAttribute('placeholder') ||
        ''
      ).trim();
      return label.length === 0;
    })
    .map((el) => `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`);
});
check('Chaque controle visible porte un nom accessible', unnamed.length === 0, unnamed.join(', '));

// 3. Le focus clavier dessine un contour : on tabule vraiment, car :focus-visible
// ne s'applique pas a un focus pose par script.
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
const outline = await page.evaluate(() => {
  const el = document.activeElement;
  const style = getComputedStyle(el);
  return { tag: el?.tagName, width: style.outlineWidth, style: style.outlineStyle, color: style.outlineColor };
});
check(
  'Le focus clavier dessine un contour visible',
  outline.style !== 'none' && Number.parseFloat(outline.width) >= 2,
  JSON.stringify(outline),
);

// 4. La fenetre modale s ouvre au clavier et piege le focus.
await page.getByRole('button', { name: 'Reporter l’arrivée' }).first().focus();
await page.keyboard.press('Enter');
await page.waitForSelector('[role="dialog"]');
const focusInside = await page.evaluate(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
check('Le focus entre dans la fenetre modale', focusInside === true);

await page.keyboard.press('Escape');
const closed = (await page.locator('[role="dialog"]').count()) === 0;
check('Echap referme la fenetre modale', closed);

// 5. Les onglets se pilotent aux fleches.
const tab = page.getByRole('tab', { name: 'Vide' }).first();
await tab.focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(150);
const selected = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('Les onglets repondent aux fleches', selected === 'Chargement', selected ?? '');

// 6. Aucun defilement horizontal a 390 px.
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const small = await mobile.newPage();
await small.goto('http://127.0.0.1:3000/design', { waitUntil: 'networkidle' });
const overflow = await small.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check('Aucun defilement horizontal a 390 px', overflow === false);

await browser.close();
console.log(failures === 0 ? '\nTOUS LES CONTROLES PASSENT' : `\n${failures} CONTROLE(S) EN ECHEC`);
process.exit(failures === 0 ? 0 : 1);
