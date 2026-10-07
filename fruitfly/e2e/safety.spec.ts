import { test, expect, startSite, script } from './fixtures';

const KEY = 'sk-test-SECRET-9f3a77c1';
const finish = { toolCalls: [{ name: 'finish', args: { title: 'Done', summary: 'All done.', status: 'success' } }] };

async function idbDump(ext: { ctx: import('@playwright/test').BrowserContext; id: string }): Promise<string> {
  const p = await ext.ctx.newPage(); await p.goto(`chrome-extension://${ext.id}/options.html`);
  const out = await p.evaluate(async () => {
    const dbs = (await indexedDB.databases?.()) ?? []; const all: unknown[] = [];
    for (const d of dbs) {
      if (!d.name) continue;
      const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(d.name!); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      for (const name of Array.from(db.objectStoreNames)) all.push(await new Promise((res) => { const q = db.transaction(name).objectStore(name).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => res(null); }));
      db.close();
    }
    return JSON.stringify(all) + JSON.stringify(await chrome.storage.local.get(null));
  });
  await p.close(); return out;
}

test('secrets never reach request bodies, the page, history or replays', async ({ ext, gateway }) => {
  const site = await startSite();
  gateway.requireKey = KEY;
  script(gateway, [{ toolCalls: [{ name: 'open_tab', args: { url: `${site.url}/` } }] }, { toolCalls: [{ name: 'read_page', args: {} }] }, finish]);
  await ext.setKey('gateway', KEY);
  await ext.setSettings({ mode: 'live', onboarded: true, gateway: { enabled: true, url: `${gateway.url}/v1`, template: 'balanced' } });
  // the shop tab is closed with the task, so inspect it while the agent is looking at it
  let shopHtml = ''; let shopGlobals: string[] = ['unread'];
  ext.ctx.on('page', (pg) => { void pg.waitForLoadState('load').then(async () => { if (pg.url().startsWith(site.url)) { shopHtml = await pg.content(); shopGlobals = await pg.evaluate(() => Object.keys(window).filter((k) => /^(?!on).*(key|secret)/i.test(k))); } }).catch(() => undefined); });
  const panel = await ext.panel();
  await panel.locator('textarea').fill('Look at this shop');
  await panel.keyboard.press('Enter');
  await expect(panel.getByRole('region', { name: 'Result' })).toBeVisible({ timeout: 60_000 });

  const chat = gateway.requests.filter((r) => r.path === '/v1/chat/completions');
  expect(chat.length).toBeGreaterThan(0);
  for (const r of gateway.requests) expect(r.body).not.toContain(KEY);
  expect(chat[0]!.headers.authorization).toBe(`Bearer ${KEY}`);

  expect(shopHtml).toContain('Redmi Book 15');
  expect(shopHtml).not.toContain(KEY);
  expect(shopGlobals).toEqual([]);

  const dump = await idbDump(ext);
  const storageOnly = JSON.parse(dump.slice(dump.lastIndexOf('{"ff:'))) as Record<string, unknown>;
  delete storageOnly['ff:keys'];
  expect(JSON.stringify(storageOnly)).not.toContain(KEY);
  expect(dump.slice(0, dump.lastIndexOf('{"ff:'))).not.toContain(KEY);
  await site.close();
});

test('page text is wrapped as untrusted data and an injection attempt is flagged', async ({ ext, gateway }) => {
  const site = await startSite();
  script(gateway, [{ toolCalls: [{ name: 'open_tab', args: { url: `${site.url}/inject` } }] }, { toolCalls: [{ name: 'read_page', args: {} }] }, finish]);
  await ext.setSettings({ mode: 'live', onboarded: true, gateway: { enabled: true, url: `${gateway.url}/v1`, template: 'balanced' } });
  const panel = await ext.panel();
  await panel.locator('textarea').fill('Summarise this page');
  await panel.keyboard.press('Enter');
  await expect(panel.getByRole('region', { name: 'Result' })).toBeVisible({ timeout: 60_000 });
  await expect(panel.getByText(/giving me instructions/)).toBeVisible();
  const withPage = gateway.requests.filter((r) => r.body.includes('Meeting at 4pm'));
  expect(withPage.length).toBeGreaterThan(0);
  expect(withPage[0]!.body).toContain('untrusted=\\"true\\"');
  await site.close();
});

test('stop ends a running task and nothing else is sent afterwards', async ({ ext, gateway }) => {
  const site = await startSite();
  gateway.inject({ kind: 'slow', ms: 20_000 });
  script(gateway, [{ toolCalls: [{ name: 'open_tab', args: { url: `${site.url}/` } }] }, finish]);
  await ext.setSettings({ mode: 'live', onboarded: true, gateway: { enabled: true, url: `${gateway.url}/v1`, template: 'balanced' } });
  const panel = await ext.panel();
  await panel.locator('textarea').fill('Open the shop');
  await panel.keyboard.press('Enter');
  await expect.poll(() => gateway.requests.filter((r) => r.path === '/v1/chat/completions').length, { timeout: 30_000 }).toBeGreaterThan(0);
  await panel.getByRole('button', { name: /^stop/i }).first().click();
  await expect(panel.getByRole('button', { name: /^stop/i })).toHaveCount(0, { timeout: 15_000 });
  const n = gateway.requests.length;
  await panel.waitForTimeout(2500);
  expect(gateway.requests.length).toBe(n);
  await site.close();
});

test('the service worker can die mid-task and the task resumes and finishes', async ({ ext, gateway }) => {
  test.setTimeout(150_000);
  const site = await startSite();
  gateway.inject({ kind: 'slow', ms: 6_000 });
  script(gateway, [{ toolCalls: [{ name: 'open_tab', args: { url: `${site.url}/` } }] }, { toolCalls: [{ name: 'read_page', args: {} }] }, finish]);
  await ext.setSettings({ mode: 'live', onboarded: true, gateway: { enabled: true, url: `${gateway.url}/v1`, template: 'balanced' } });
  const panel = await ext.panel();
  await panel.locator('textarea').fill('Look at this shop');
  await panel.keyboard.press('Enter');
  await expect.poll(() => gateway.requests.filter((r) => r.path === '/v1/chat/completions').length, { timeout: 30_000 }).toBeGreaterThan(0);
  const cdp = await ext.ctx.newCDPSession(panel);
  const versions = new Map<string, string>();
  const stopped: string[] = [];
  cdp.on('ServiceWorker.workerVersionUpdated', (e: { versions: { versionId: string; runningStatus: string; scriptURL: string }[] }) => {
    for (const v of e.versions) { if (v.scriptURL.includes(ext.id)) { versions.set(v.versionId, v.runningStatus); if (v.runningStatus === 'stopped') stopped.push(v.versionId); } }
  });
  await cdp.send('ServiceWorker.enable');
  await expect.poll(() => [...versions.values()].includes('running')).toBe(true);
  for (const [id, st] of versions) if (st === 'running') await cdp.send('ServiceWorker.stopWorker', { versionId: id });
  await expect.poll(() => stopped.length, { timeout: 10_000 }).toBeGreaterThan(0);
  // wake it again the way real use does: the panel talks to it
  await panel.waitForTimeout(1500);
  await panel.evaluate(() => chrome.runtime.sendMessage({ ff: 'ping' }).catch(() => undefined));
  await expect(panel.getByRole('region', { name: 'Result' })).toBeVisible({ timeout: 100_000 });
  expect(stopped.length).toBeGreaterThan(0);
  expect(gateway.requests.filter((r) => r.path === '/v1/chat/completions').length).toBeGreaterThan(1);
  await site.close();
});
