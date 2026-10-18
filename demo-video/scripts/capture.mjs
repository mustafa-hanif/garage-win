// Captures each Garage Pro screen as a full-page PNG at 2x, using the local design runtime.
// Usage: serve ./screens on :8765, then `node scripts/capture.mjs`.
import puppeteer from 'puppeteer-core';

const CHROME = new URL('../node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64/chrome-headless-shell', import.meta.url).pathname;
const screens = ['Main', 'Intake', 'Estimation', 'JobCard', 'PendingJobs', 'Inventory', 'Purchases', 'Billing', 'InvoiceA4', 'EInvoicing', 'Customers', 'Employee'];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
for (const name of screens) {
  const page = await browser.newPage();
  const a4 = name === 'InvoiceA4';
  await page.setViewport({ width: a4 ? 794 : 1440, height: a4 ? 1123 : 900, deviceScaleFactor: 2 });
  await page.goto(`http://localhost:8765/${name}.dc.html`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `public/screens/${name}.png`, fullPage: !a4 });
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  console.log(name, h);
  await page.close();
}
await browser.close();
