// node tools/panel-run.mjs <scenario label> <outPrefix> <t1,t2,...ms> [dark]
import { chromium } from '@playwright/test';
const [label, prefix, times = '3000,7000,12000,20000', dark = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1.5, colorScheme: dark ? 'dark' : 'light' });
const page = await ctx.newPage(); const errs = [];
page.on('console', (m) => { if (m.type() === 'error' && !/404/.test(m.text())) errs.push(m.text()); }); page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto('http://127.0.0.1:5190/#/panel', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
await page.getByRole('button', { name: label }).first().click();
let last = 0;
for (const t of times.split(',').map(Number)) { await page.waitForTimeout(t - last); last = t; await page.locator('[data-testid=panel-stage]').screenshot({ path: `${prefix}-${t}.png` }); }
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
