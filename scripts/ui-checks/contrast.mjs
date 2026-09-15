import { chromium } from 'playwright';

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
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    return text;
  });

  for (const el of elements) {
    const style = getComputedStyle(el);
    const size = Number.parseFloat(style.fontSize);
    const bold = Number.parseInt(style.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const value = ratio(toRgb(style.color), backgroundOf(el));
    const required = large ? 3 : 4.5;
    if (value < required) {
      problems.push({
        text: el.textContent.trim().slice(0, 40),
        ratio: Number(value.toFixed(2)),
        required,
        size,
      });
    }
  }
  return { checked: elements.length, problems };
};

const browser = await chromium.launch({ channel: 'chrome' });
let failures = 0;

for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: scheme });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:3000${process.argv[2] ?? '/design'}`, { waitUntil: 'networkidle' });
  const { checked, problems } = await page.evaluate(MEASURE);
  console.log(`\nTheme ${scheme} : ${checked} elements textuels mesures`);
  if (problems.length === 0) {
    console.log('  PASS  aucun texte sous le seuil AA');
  } else {
    failures += problems.length;
    for (const p of problems) console.log(`  FAIL  "${p.text}" ${p.ratio}:1 (minimum ${p.required})`);
  }
  await context.close();
}

await browser.close();
process.exit(failures === 0 ? 0 : 1);
