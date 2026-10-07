// Loads the unpacked extension in Chromium and opens each page; prints console errors.
import { chromium } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
const dist = path.resolve(process.argv[2] ?? 'apps/extension/dist');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ff-ext-'));
const ctx = await chromium.launchPersistentContext(dir, { headless: false, executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox', `--disable-extensions-except=${dist}`, `--load-extension=${dist}`, '--headless=new'] });
let [sw] = ctx.serviceWorkers();
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
const id = new URL(sw.url()).host;
console.log('extension id', id);
const errs = [];
for (const page of ['sidepanel', 'popup', 'options', 'onboarding']) {
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errs.push(`${page}: ${m.text()}`); });
  p.on('pageerror', (e) => errs.push(`${page}: ${e.message}`));
  await p.goto(`chrome-extension://${id}/${page}.html`);
  await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(process.env.SHOT_DIR ?? '.', `ext-${page}.png`) });
  console.log(page, (await p.locator('#root').innerHTML()).length, 'chars');
}
console.log(errs.length ? errs.join('\n') : 'no console errors');
await ctx.close();
