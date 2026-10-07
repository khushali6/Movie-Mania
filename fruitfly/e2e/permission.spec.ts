import { test, expect, startSite, script } from './fixtures';

// The production build has no host permissions at all: each site is allowed on its own, when needed.
test.use({ build: 'prod' });

test('without a site permission the agent stops and asks, and never touches the page', async ({ ext, gateway }) => {
  const site = await startSite();
  script(gateway, [{ toolCalls: [{ name: 'open_tab', args: { url: `${site.url}/` } }] }, { toolCalls: [{ name: 'read_page', args: {} }] }, { toolCalls: [{ name: 'finish', args: { title: 'Done', summary: 'All done.' } }] }]);
  await ext.setSettings({ mode: 'live', onboarded: true, gateway: { enabled: true, url: `${gateway.url}/v1`, template: 'balanced' } });
  const panel = await ext.panel();
  await panel.locator('textarea').fill('Look at this shop');
  await panel.keyboard.press('Enter');
  await expect(panel.getByText(/permission for 127\.0\.0\.1|need your permission/i).first()).toBeVisible({ timeout: 45_000 });
  await site.close();
});

test('the manifest asks for no host access up front, and the CSP only allows the documented hosts', async ({ ext }) => {
  const p = await ext.ctx.newPage();
  await p.goto(`chrome-extension://${ext.id}/options.html`);
  const m = await p.evaluate(() => chrome.runtime.getManifest());
  expect(m.host_permissions ?? []).toEqual([]);
  expect(m.optional_host_permissions).toEqual(['http://*/*', 'https://*/*']);
  expect(m.permissions).not.toContain('webRequest');
  expect(m.permissions).not.toContain('history');
  expect(m.permissions).not.toContain('cookies');
  const csp = (m.content_security_policy as { extension_pages: string }).extension_pages;
  const connect = /connect-src ([^;]+)/.exec(csp)![1]!.split(/\s+/).sort();
  expect(connect).toEqual(["'self'", 'http://127.0.0.1:*', 'http://localhost:*', 'https://api.anthropic.com', 'https://generativelanguage.googleapis.com'].sort());
  expect(csp).not.toMatch(/'unsafe-eval'/);
});
