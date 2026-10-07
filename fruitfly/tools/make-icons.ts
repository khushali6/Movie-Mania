// Renders the procedural fly (the same SVG the UI uses) to PNG icons: pnpm tsx tools/make-icons.ts
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { flySvg } from '../packages/ui/src/fly/svg';

mkdirSync('apps/extension/public/icons', { recursive: true });
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const svg = flySvg('ic').replace('<svg ', '<svg viewBox="8 14 108 100" ').replace('viewBox="0 0 120 120" ', '');
  await page.setContent(`<body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;display:grid;place-items:center">${svg.replace('width="100%" height="100%"', `width="${size}" height="${size}"`)}</div></body>`);
  await page.locator('[data-part=shadow]').evaluate((n) => n.remove());
  await page.screenshot({ path: `apps/extension/public/icons/icon-${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written');
