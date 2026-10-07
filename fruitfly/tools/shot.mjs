// Usage: node tools/shot.mjs <url> <out.png> [width] [height] [waitMs] [selector] [dark]
import { chromium } from '@playwright/test';
const [url, out, w = '1280', h = '900', wait = '1500', sel = '', dark = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light' });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(+wait);
if (sel) await page.locator(sel).first().screenshot({ path: out }); else await page.screenshot({ path: out });
if (errs.length) console.log('CONSOLE ERRORS:\n' + errs.join('\n'));
await browser.close();
