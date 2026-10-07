import { FruitflyError } from '@fruitfly/core';
import type { ActionResult, BrowserAdapter, PageSnapshot, Rect, SitePolicy, TabInfo } from '@fruitfly/agent';

type Bridge = { snapshot(): PageSnapshot; click(ref: string): Promise<ActionResult>; type(ref: string, t: string, o: { submit?: boolean; clear?: boolean }): Promise<ActionResult>; select(ref: string, v: string): ActionResult; scroll(d: string, a?: number): ActionResult; waitText(t: string | undefined, ms: number): Promise<ActionResult>; rectOf(ref: string): Rect | null; addPage(): { title: string; html: string; url: string } };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const id = (t: string | number) => Number(t);
const sid = (n: number | undefined) => String(n ?? 0);
export const originPattern = (url: string): string => { try { const u = new URL(url); return `${u.protocol}//${u.hostname}/*`; } catch { return ''; } };

/** BrowserAdapter over chrome.tabs + chrome.scripting. Acts only on origins the user granted. */
export class ChromeBrowser implements BrowserAdapter {
  /** called when a tab is first touched, so the on-page overlay can appear */
  onTouch?: (tabId: number) => void;
  onNeedPermission?: (host: string) => void;
  private touched = new Set<number>();
  /** tabs opened by the agent: closed with the task (never the user's own) */
  readonly opened = new Set<number>();

  private async info(t: chrome.tabs.Tab): Promise<TabInfo> { return { id: sid(t.id), url: t.url ?? t.pendingUrl ?? '', title: t.title ?? '' }; }
  async listTabs(): Promise<TabInfo[]> { return Promise.all((await chrome.tabs.query({ currentWindow: true })).map((t) => this.info(t))); }
  async activeTab(): Promise<TabInfo> {
    const [t] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const real = (await chrome.tabs.query({ active: true, lastFocusedWindow: true })).find((x) => /^https?:/.test(x.url ?? '')) ?? t;
    if (!real?.id) { const nt = await chrome.tabs.create({ url: 'about:blank', active: true }); return this.info(nt); }
    return this.info(real);
  }
  async openTab(url: string, o: { background?: boolean } = {}): Promise<TabInfo> {
    const t = await chrome.tabs.create({ url, active: !o.background }); this.opened.add(t.id!);
    await this.settle(t.id!); return this.info(await chrome.tabs.get(t.id!));
  }
  async closeTab(tabId: string): Promise<void> { this.opened.delete(id(tabId)); await chrome.tabs.remove(id(tabId)).catch(() => undefined); }
  async focusTab(tabId: string): Promise<void> { await chrome.tabs.update(id(tabId), { active: true }); }

  /** wait until the tab stops loading (bounded) */
  private async settle(tabId: number, maxMs = 8000): Promise<void> {
    const t0 = Date.now(); await sleep(60);
    while (Date.now() - t0 < maxMs) { const t = await chrome.tabs.get(tabId).catch(() => undefined); if (!t || t.status === 'complete') return; await sleep(120); }
  }
  async navigate(tabId: string, url: string): Promise<ActionResult> {
    try { await chrome.tabs.update(id(tabId), { url }); await this.settle(id(tabId)); return { ok: true, navigated: true, url }; } catch (e) { return { ok: false, error: e instanceof Error ? e.message : 'Could not open that page.' }; }
  }
  async back(tabId: string): Promise<ActionResult> { try { await chrome.tabs.goBack(id(tabId)); await this.settle(id(tabId)); return { ok: true, navigated: true }; } catch { return { ok: false, error: 'No earlier page.' }; } }

  private async ensure(tabId: number): Promise<void> {
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => typeof (window as unknown as { __ffBridge?: unknown }).__ffBridge !== 'undefined' });
      if (!r?.result) await chrome.scripting.executeScript({ target: { tabId }, files: ['page-bridge.js'] });
    } catch (e) {
      const url = (await chrome.tabs.get(tabId).catch(() => undefined))?.url ?? '';
      const host = (() => { try { return new URL(url).hostname; } catch { return ''; } })();
      if (/^(chrome|edge|about|chrome-extension):/.test(url) || !host) throw new FruitflyError('page_blocked', 'That page cannot be controlled.', { url });
      this.onNeedPermission?.(host);
      throw new FruitflyError('permission_needed', `I need your permission for ${host}.`, { host });
    }
    if (!this.touched.has(tabId)) { this.touched.add(tabId); this.onTouch?.(tabId); }
  }
  private async call<T>(tabId: string, method: keyof Bridge, args: unknown[] = []): Promise<T> {
    const t = id(tabId); await this.ensure(t);
    const [r] = await chrome.scripting.executeScript({ target: { tabId: t }, args: [method as string, args], func: (m: string, a: unknown[]) => { const b = (window as unknown as { __ffBridge: Record<string, (...x: unknown[]) => unknown> }).__ffBridge; return Promise.resolve(b[m]!(...a)); } });
    if (!r) throw new FruitflyError('page_blocked', 'The page did not answer.');
    return r.result as T;
  }

  async snapshot(tabId: string): Promise<PageSnapshot> { const s = await this.call<Omit<PageSnapshot, 'tabId'>>(tabId, 'snapshot'); return { ...s, tabId }; }
  async click(tabId: string, ref: string): Promise<ActionResult> {
    const before = (await chrome.tabs.get(id(tabId))).url;
    const r = await this.call<ActionResult>(tabId, 'click', [ref]); if (!r.ok) return r;
    await sleep(160); await this.settle(id(tabId), 6000);
    const after = (await chrome.tabs.get(id(tabId)).catch(() => undefined))?.url; return { ...r, navigated: !!after && after !== before, url: after };
  }
  async type(tabId: string, ref: string, text: string, o: { submit?: boolean; clear?: boolean } = {}): Promise<ActionResult> {
    const before = (await chrome.tabs.get(id(tabId))).url; const r = await this.call<ActionResult>(tabId, 'type', [ref, text, o]);
    if (r.ok && o.submit) { await sleep(200); await this.settle(id(tabId), 6000); const after = (await chrome.tabs.get(id(tabId)).catch(() => undefined))?.url; return { ...r, navigated: !!after && after !== before, url: after }; }
    return r;
  }
  select(tabId: string, ref: string, value: string): Promise<ActionResult> { return this.call(tabId, 'select', [ref, value]); }
  scroll(tabId: string, dir: 'up' | 'down' | 'top' | 'bottom', amount?: number): Promise<ActionResult> { return this.call(tabId, 'scroll', [dir, amount]); }
  waitFor(tabId: string, o: { ms?: number; text?: string }): Promise<ActionResult> { return this.call(tabId, 'waitText', [o.text, o.ms ?? 800]); }
  async highlight(tabId: string, ref: string | null, label?: string): Promise<void> { await this.overlay(id(tabId), { op: 'target', ref, label }); }
  async rectOf(tabId: string, ref: string): Promise<Rect | null> { return this.call<Rect | null>(tabId, 'rectOf', [ref]); }
  async addPage(tabId: number): Promise<{ title: string; html: string; url: string }> { return this.call(String(tabId), 'addPage'); }

  /** overlay messages are best-effort: the page may not have the overlay (restricted pages, navigations) */
  async overlay(tabId: number, msg: Record<string, unknown>): Promise<void> { try { await chrome.tabs.sendMessage(tabId, msg); } catch { /* no overlay on this page right now */ } }
  async installOverlay(tabId: number, o: { size?: number; energy?: string; reduced?: boolean } = {}): Promise<void> {
    try {
      const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => typeof (window as unknown as Record<string, unknown>)['ff-overlay'] !== 'undefined' });
      if (!r?.result) await chrome.scripting.executeScript({ target: { tabId }, files: ['overlay.js'] });
      await this.overlay(tabId, { op: 'show', ...o });
    } catch { /* permission or restricted page */ }
  }
  async hideOverlays(): Promise<void> { for (const t of this.touched) await this.overlay(t, { op: 'hide' }); this.touched.clear(); }
  /** after navigations the overlay is gone: reinstall on every touched tab before the next action */
  get touchedTabs(): number[] { return [...this.touched]; }
  forgetTab(tabId: number): void { this.touched.delete(tabId); }
}

/** Only act on sites the user allowed (optional host permissions). Asks the panel and waits when a site is not allowed yet. */
export class ChromeSitePolicy implements SitePolicy {
  private waiters = new Map<string, ((ok: boolean) => void)[]>();
  constructor(private ask: (host: string) => void, private extraAllowed: () => string[] = () => []) {}
  async isAllowed(url: string): Promise<boolean> {
    const pattern = originPattern(url); if (!pattern) return false;
    let host = ''; try { host = new URL(url).hostname; } catch { return false; }
    if (this.extraAllowed().includes(host)) return true;
    if (await chrome.permissions.contains({ origins: [pattern] }).catch(() => false)) return true;
    this.ask(host);
    return new Promise<boolean>((resolve) => { const list = this.waiters.get(host) ?? []; list.push(resolve); this.waiters.set(host, list); setTimeout(() => this.settle(host, false), 120_000); });
  }
  settle(host: string, ok: boolean): void { const l = this.waiters.get(host); if (!l) return; this.waiters.delete(host); l.forEach((r) => r(ok)); }
}
