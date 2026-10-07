import { test, expect, startSite, script } from './fixtures';

test('every extension page loads without console errors', async ({ ext }) => {
  const errors: string[] = [];
  for (const name of ['sidepanel', 'popup', 'options', 'onboarding']) {
    const p = await ext.ctx.newPage();
    p.on('console', (m) => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    await p.goto(`chrome-extension://${ext.id}/${name}.html`);
    await expect(p.locator('#root')).not.toBeEmpty();
    await p.waitForTimeout(600);
  }
  expect(errors).toEqual([]);
});

test('demo mode: the laptop job runs end to end in the panel with no key', async ({ ext }) => {
  const panel = await ext.panel();
  await panel.getByRole('button', { name: /cheapest laptop/i }).click();
  await panel.locator('textarea').press('Enter');
  await expect(panel.getByRole('region', { name: 'Result' })).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByRole('region', { name: 'Result' })).toContainText('Redmi Book 15');
});

test('live mode: extension talks to a localhost gateway and drives a real page', async ({ ext, gateway }) => {
  const site = await startSite();
  script(gateway, [
    { toolCalls: [{ name: 'open_tab', args: { url: `${site.url}/` } }] },
    { toolCalls: [{ name: 'read_page', args: {} }] },
    { toolCalls: [{ name: 'finish', args: { title: 'Cheapest: Redmi Book 15', summary: 'Redmi Book 15 at ₹42,990 is the cheapest of two.', status: 'success' } }] },
  ]);
  await ext.setSettings({ mode: 'live', onboarded: true, gateway: { enabled: true, url: `${gateway.url}/v1`, template: 'balanced' } });
  const panel = await ext.panel();
  await panel.locator('textarea').fill('Find the cheapest laptop on this site');
  await panel.keyboard.press('Enter');
  await expect(panel.getByRole('region', { name: 'Result' })).toContainText('Redmi Book 15', { timeout: 60_000 });
  expect(site.hits.length).toBeGreaterThan(0);
  expect(gateway.requests.some((r) => r.path === '/v1/chat/completions')).toBe(true);
  await site.close();
});
