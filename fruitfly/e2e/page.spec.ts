import { test, expect, startSite, script } from './fixtures';

const finish = { toolCalls: [{ name: 'finish', args: { title: 'Done', summary: 'All done.', status: 'success' } }] };

test('the page overlay never blocks the page, and Take over hands the tab back', async ({ ext, gateway }) => {
  const site = await startSite();
  script(gateway, [
    { toolCalls: [{ name: 'open_tab', args: { url: `${site.url}/` } }] },
    { toolCalls: [{ name: 'read_page', args: {} }] },
    finish,
  ]);
  gateway.hold = { from: 2, ms: 30_000 };
  await ext.setSettings({ mode: 'live', onboarded: true, gateway: { enabled: true, url: `${gateway.url}/v1`, template: 'balanced' } });
  const shopP = new Promise<import('@playwright/test').Page>((res) => ext.ctx.on('page', (pg) => { void pg.waitForLoadState('load').then(() => { if (pg.url().startsWith(site.url)) res(pg); }); }));
  const panel = await ext.panel();
  await panel.locator('textarea').fill('Look at this shop');
  await panel.keyboard.press('Enter');
  const shop = await shopP;
  await expect(shop.locator('#ff-overlay-host')).toHaveCount(1, { timeout: 30_000 });

  // the overlay is click-through: a real mouse click lands on the page's own button
  await shop.bringToFront();
  const b = (await shop.locator('#buy-a').boundingBox())!;
  await shop.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await shop.waitForTimeout(200);
  await expect(shop.locator('#msg')).toHaveText('Added buy-a');
  expect(await shop.evaluate(() => document.elementFromPoint(120, 120)?.id !== 'ff-overlay-host')).toBe(true);

  // find the Take over button inside the closed shadow root by clicking along the pill, leftmost first
  const { w, h } = await shop.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  for (let x = w - 200; x < w - 20; x += 8) {
    await shop.mouse.click(x, h - 28);
    await panel.waitForTimeout(350);
    if (await panel.getByText(/Paused|Needs you|Waiting for you/).first().isVisible().catch(() => false)) break;
  }
  await expect(panel.getByText(/Paused|Needs you|Waiting for you/).first()).toBeVisible({ timeout: 10_000 });
  await site.close();
});
