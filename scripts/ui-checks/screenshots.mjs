import { chromium } from 'playwright';

const browser = await chromium.launch({ channel: 'chrome' });

for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: scheme,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:3000/design', { waitUntil: 'networkidle' });
  await page.screenshot({ path: `design-${scheme}.png`, fullPage: true });
  await context.close();
}

const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await mobile.newPage();
await page.goto('http://127.0.0.1:3000/design', { waitUntil: 'networkidle' });
await page.screenshot({ path: 'design-mobile.png', fullPage: true });
await browser.close();
console.log('captures faites');
