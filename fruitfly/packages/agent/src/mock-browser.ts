import type { ActionResult, BrowserAdapter, ElementRef, PageSnapshot, TabInfo } from './browser';
import { elementLine } from './browser';

export type MockAction =
  | { goto: string }
  | { set: Record<string, unknown>; stay?: boolean; note?: string }
  | { submit: string; to: (values: Record<string, string>, state: Record<string, unknown>) => string }
  | { fn: (state: Record<string, unknown>) => { goto?: string; note?: string } | void };

export type MockNode =
  | { t: 'h'; level?: 1 | 2 | 3; text: string }
  | { t: 'p'; text: string }
  | { t: 'link'; label: string; to: string; text?: string }
  | { t: 'button'; label: string; do?: MockAction; form?: string; disabled?: boolean }
  | { t: 'input'; name: string; label: string; type?: string; placeholder?: string; form?: string; enter?: MockAction }
  | { t: 'select'; name: string; label: string; options: string[] }
  | { t: 'group'; children: MockNode[]; modal?: boolean; title?: string; card?: boolean };

export interface MockPage { url: string; title: string; nodes: MockNode[]; loading?: boolean }
export interface MockSite { host: string; render(url: URL, state: Record<string, unknown>, form: Record<string, string>): MockPage }

interface Tab { id: string; history: string[]; idx: number; form: Record<string, string>; scrollY: number }
interface Indexed { el: ElementRef; node: MockNode }

export interface MockActionLog { tab: string; action: 'click' | 'type' | 'navigate' | 'select' | 'scroll' | 'open' | 'back'; ref?: string; label?: string; value?: string; url?: string }

/** Deterministic in-memory browser for demo mode, the landing page, tests and Fly Bench. */
export class MockBrowser implements BrowserAdapter {
  private sites = new Map<string, MockSite>();
  private state = new Map<string, Record<string, unknown>>();
  private tabs = new Map<string, Tab>();
  private active = '';
  private seq = 0;
  private index = new Map<string, Map<string, Indexed>>();
  private listeners = new Set<() => void>();
  readonly log: MockActionLog[] = [];
  highlighted: { tabId: string; ref: string; label?: string } | null = null;
  /** delay (ms) to simulate network, 0 in tests */
  latency = 0;

  constructor(sites: MockSite[] = [], startUrl?: string) {
    for (const s of sites) this.sites.set(s.host, s);
    if (startUrl) this.createTab(startUrl, false);
  }
  addSite(s: MockSite): void { this.sites.set(s.host, s); }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private notify(): void { this.listeners.forEach((l) => l()); }
  siteState(host: string): Record<string, unknown> { let s = this.state.get(host); if (!s) { s = {}; this.state.set(host, s); } return s; }
  private async delay(): Promise<void> { if (this.latency) await new Promise((r) => setTimeout(r, this.latency)); }

  private hostOf(url: string): string { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } }
  private site(url: string): MockSite | undefined { return this.sites.get(this.hostOf(url)); }

  page(tabId: string): MockPage {
    const t = this.tab(tabId); const url = t.history[t.idx]!;
    const site = this.site(url);
    if (!site) return { url, title: 'This site can’t be reached', nodes: [{ t: 'h', level: 1, text: 'This site can’t be reached' }, { t: 'p', text: `${this.hostOf(url) || url} refused to connect.` }] };
    return site.render(new URL(url), this.siteState(this.hostOf(url)), t.form);
  }

  private tab(id: string): Tab { const t = this.tabs.get(id); if (!t) throw new Error(`No tab ${id}`); return t; }
  private toInfo(t: Tab): TabInfo { const p = this.page(t.id); return { id: t.id, url: p.url, title: p.title }; }

  async listTabs(): Promise<TabInfo[]> { return [...this.tabs.values()].map((t) => this.toInfo(t)); }
  async activeTab(): Promise<TabInfo> { if (!this.active) { await this.openTab('https://start.fruitfly.local/'); } return this.toInfo(this.tab(this.active)); }
  private createTab(url: string, background: boolean): TabInfo {
    const id = `t${++this.seq}`; this.tabs.set(id, { id, history: [url], idx: 0, form: {}, scrollY: 0 });
    if (!background || !this.active) this.active = id;
    this.log.push({ tab: id, action: 'open', url }); this.notify();
    return this.toInfo(this.tab(id));
  }
  async openTab(url: string, opts: { background?: boolean } = {}): Promise<TabInfo> { await this.delay(); return this.createTab(url, !!opts.background); }
  async closeTab(id: string): Promise<void> { this.tabs.delete(id); this.index.delete(id); if (this.active === id) this.active = [...this.tabs.keys()][0] ?? ''; this.notify(); }
  async focusTab(id: string): Promise<void> { this.tab(id); this.active = id; this.notify(); }
  get activeId(): string { return this.active; }

  private go(t: Tab, url: string): void { t.history = t.history.slice(0, t.idx + 1); t.history.push(url); t.idx++; t.form = {}; t.scrollY = 0; }
  async navigate(tabId: string, url: string): Promise<ActionResult> {
    await this.delay(); const t = this.tab(tabId); this.go(t, url); this.log.push({ tab: tabId, action: 'navigate', url }); this.notify();
    return { ok: true, navigated: true, url };
  }
  async back(tabId: string): Promise<ActionResult> { const t = this.tab(tabId); if (t.idx === 0) return { ok: false, error: 'No earlier page.' }; t.idx--; t.form = {}; this.log.push({ tab: tabId, action: 'back' }); this.notify(); return { ok: true, navigated: true }; }

  /** Deterministic refs for interactive nodes (e1, e2, …) in reading order. Shared by snapshots and the demo view. */
  annotate(nodes: MockNode[]): Map<MockNode, string> {
    const refs = new Map<MockNode, string>(); let n = 0;
    const walk = (ns: MockNode[]) => { for (const node of ns) { if (node.t === 'link' || node.t === 'button' || node.t === 'input' || node.t === 'select') refs.set(node, `e${++n}`); else if (node.t === 'group') walk(node.children); } };
    walk(nodes); return refs;
  }
  /** What a UI needs to draw the page: the model, each node's ref, and which refs are covered by a modal. */
  view(tabId: string): { page: MockPage; refs: Map<MockNode, string>; hasModal: boolean; tabs: TabInfo[]; active: string } {
    const page = this.page(tabId);
    return { page, refs: this.annotate(page.nodes), hasModal: page.nodes.some((x) => x.t === 'group' && x.modal), tabs: [...this.tabs.values()].map((t) => this.toInfo(t)), active: this.active };
  }

  async snapshot(tabId: string): Promise<PageSnapshot> {
    await this.delay();
    const t = this.tab(tabId); const page = this.page(tabId);
    const idx = new Map<string, Indexed>(); let hn = 0; const lines: string[] = []; const elements: ElementRef[] = [];
    const refs = this.annotate(page.nodes);
    const hasModal = page.nodes.some((x) => x.t === 'group' && x.modal);
    const walk = (nodes: MockNode[], depth: number, inModal: boolean) => {
      for (const node of nodes) {
        const pad = '';
        switch (node.t) {
          case 'h': lines.push(`${'#'.repeat(node.level ?? 2)} ${node.text}`); elements.push({ ref: `h${++hn}`, role: 'heading', label: node.text }); break;
          case 'p': lines.push(pad + node.text); break;
          case 'link': { const el: ElementRef = { ref: refs.get(node)!, role: 'link', label: node.label, text: node.text, href: node.to, covered: hasModal && !inModal }; idx.set(el.ref, { el, node }); elements.push(el); lines.push(`${elementLine(el)}${node.text ? ` ${node.text}` : ''}`); break; }
          case 'button': { const el: ElementRef = { ref: refs.get(node)!, role: 'button', label: node.label, disabled: node.disabled, formId: node.form, covered: hasModal && !inModal }; idx.set(el.ref, { el, node }); elements.push(el); lines.push(elementLine(el)); break; }
          case 'input': { const el: ElementRef = { ref: refs.get(node)!, role: 'input', label: node.label, type: node.type ?? 'text', name: node.name, placeholder: node.placeholder, value: node.type === 'password' ? (t.form[node.name] ? '••••' : '') : (t.form[node.name] ?? ''), formId: node.form, covered: hasModal && !inModal }; idx.set(el.ref, { el, node }); elements.push(el); lines.push(elementLine(el)); break; }
          case 'select': { const el: ElementRef = { ref: refs.get(node)!, role: 'select', label: node.label, name: node.name, options: node.options, value: t.form[node.name] ?? node.options[0], covered: hasModal && !inModal }; idx.set(el.ref, { el, node }); elements.push(el); lines.push(`${elementLine(el)} options: ${node.options.join(' | ')}`); break; }
          case 'group': {
            if (node.modal) lines.push(`(dialog${node.title ? `: ${node.title}` : ''})`);
            else if (node.card) lines.push('---');
            walk(node.children, depth + 1, inModal || !!node.modal);
            if (node.modal) lines.push('(end dialog)');
            break;
          }
        }
      }
    };
    walk(page.nodes, 0, false);
    this.index.set(tabId, idx);
    const total = Math.max(1200, lines.length * 60);
    return { tabId, url: page.url, title: page.title, text: lines.join('\n'), elements, hasForm: elements.some((e) => e.role === 'input' || e.role === 'select'), scrollY: t.scrollY, scrollHeight: total, loading: !!page.loading };
  }

  private find(tabId: string, ref: string): Indexed | undefined {
    if (!this.index.has(tabId)) void this.snapshot(tabId);
    const found = this.index.get(tabId)?.get(ref); if (found) return found;
    // refs are positional: re-index if the page changed since the last snapshot
    return this.index.get(tabId)?.get(ref);
  }

  private async act(tabId: string, action: MockAction, t: Tab): Promise<ActionResult> {
    const url = t.history[t.idx]!; const site = this.hostOf(url); const st = this.siteState(site);
    if ('goto' in action) { this.go(t, new URL(action.goto, url).href); return { ok: true, navigated: true, url: t.history[t.idx] }; }
    if ('set' in action) { Object.assign(st, action.set); return { ok: true, note: action.note }; }
    if ('submit' in action) { const to = action.to({ ...t.form }, st); this.go(t, new URL(to, url).href); return { ok: true, navigated: true, url: t.history[t.idx] }; }
    const r = action.fn(st);
    if (r && r.goto) { this.go(t, new URL(r.goto, url).href); return { ok: true, navigated: true, url: t.history[t.idx], note: r.note }; }
    return { ok: true, note: r?.note };
  }

  async click(tabId: string, ref: string): Promise<ActionResult> {
    await this.delay();
    await this.snapshot(tabId); // keep refs fresh
    const f = this.find(tabId, ref); if (!f) return { ok: false, error: `No element ${ref}.` };
    if (f.el.covered) return { ok: false, error: 'That element is covered by a dialog.' };
    if (f.el.disabled) return { ok: false, error: 'That button is disabled.' };
    const t = this.tab(tabId); this.log.push({ tab: tabId, action: 'click', ref, label: f.el.label });
    let res: ActionResult;
    if (f.node.t === 'link') res = await this.act(tabId, { goto: f.node.to }, t);
    else if (f.node.t === 'button' && f.node.do) res = await this.act(tabId, f.node.do, t);
    else res = { ok: true };
    this.notify(); return res;
  }

  async type(tabId: string, ref: string, text: string, opts: { submit?: boolean; clear?: boolean } = {}): Promise<ActionResult> {
    await this.delay(); await this.snapshot(tabId);
    const f = this.find(tabId, ref); if (!f || f.node.t !== 'input') return { ok: false, error: `${ref} is not an input.` };
    if (f.el.covered) return { ok: false, error: 'That field is covered by a dialog.' };
    const t = this.tab(tabId); const cur = opts.clear === false ? t.form[f.node.name] ?? '' : '';
    t.form[f.node.name] = cur + text;
    this.log.push({ tab: tabId, action: 'type', ref, label: f.el.label, value: f.node.type === 'password' ? '••••' : text });
    let res: ActionResult = { ok: true };
    if (opts.submit && f.node.enter) res = await this.act(tabId, f.node.enter, t);
    this.notify(); return res;
  }

  async select(tabId: string, ref: string, value: string): Promise<ActionResult> {
    await this.snapshot(tabId); const f = this.find(tabId, ref); if (!f || f.node.t !== 'select') return { ok: false, error: `${ref} is not a dropdown.` };
    if (!f.node.options.some((o) => o.toLowerCase() === value.toLowerCase())) return { ok: false, error: `Options are: ${f.node.options.join(', ')}.` };
    this.tab(tabId).form[f.node.name] = f.node.options.find((o) => o.toLowerCase() === value.toLowerCase())!;
    this.log.push({ tab: tabId, action: 'select', ref, label: f.el.label, value }); this.notify(); return { ok: true };
  }

  async scroll(tabId: string, dir: 'up' | 'down' | 'top' | 'bottom', amount = 600): Promise<ActionResult> {
    const t = this.tab(tabId); t.scrollY = dir === 'top' ? 0 : dir === 'bottom' ? 99999 : Math.max(0, t.scrollY + (dir === 'down' ? amount : -amount));
    this.log.push({ tab: tabId, action: 'scroll', value: dir }); this.notify(); return { ok: true };
  }
  async waitFor(tabId: string, o: { ms?: number; text?: string }): Promise<ActionResult> {
    if (o.ms && this.latency) await new Promise((r) => setTimeout(r, Math.min(o.ms!, 50)));
    if (o.text) { const s = await this.snapshot(tabId); return s.text.includes(o.text) ? { ok: true } : { ok: false, error: `"${o.text}" has not appeared.` }; }
    return { ok: true };
  }
  async highlight(tabId: string, ref: string | null, label?: string): Promise<void> { this.highlighted = ref ? { tabId, ref, label } : null; this.notify(); }
}
