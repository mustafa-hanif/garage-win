// Finds the card that contains a given heading on each screen and records its box (CSS px), for camera moves.
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const CHROME = new URL('../node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell', import.meta.url).pathname;
const targets = {
  Intake: ['Complaint and check-in', 'Customer signature', 'Suggested services and estimate', 'Intake summary'],
  Estimation: ['Estimate options', 'Send to customer', 'Recommended option, line items'],
  JobCard: ['Vehicle and customer details', 'Vehicle check-in', 'Spare parts', 'Estimate summary'],
  Main: ['Workshop bays, live', 'Revenue and profit', 'Pending job cards', 'Dashboard'],
  Inventory: ['Stock level', 'Stock movements'],
  Purchases: ['Three-way match', 'Items purchased'],
  Billing: ['Spare parts and labour charges', 'Tax invoice preview'],
  EInvoicing: ['How an invoice travels', 'E-invoice register', 'Validation checks'],
};
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
const out = {};
for (const [name, labels] of Object.entries(targets)) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`http://localhost:8765/${name}.dc.html`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 800));
  out[name] = await page.evaluate((labels) => {
    const res = {};
    const all = [...document.querySelectorAll('body *')];
    for (const label of labels) {
      const el = all.find((e) => e.children.length === 0 && e.textContent.trim() === label) || all.find((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() === label));
      if (!el) { res[label] = null; continue; }
      let c = el;
      while (c && c !== document.body) {
        const s = getComputedStyle(c);
        if (c.tagName === 'SECTION' || (parseFloat(s.borderTopWidth) > 0 && parseFloat(s.borderTopLeftRadius) >= 8 && c.getBoundingClientRect().width > 250)) break;
        c = c.parentElement;
      }
      const r = (c || el).getBoundingClientRect();
      res[label] = { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    }
    return res;
  }, labels);
  await page.close();
}
await browser.close();
writeFileSync('src/focus.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify(out));
