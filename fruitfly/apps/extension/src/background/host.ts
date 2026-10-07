import { AgentController, RouterModelClient, type ModelClient } from '@fruitfly/agent';
import { ContextManager, TokenMeter } from '@fruitfly/context';
import { CommandSchema, type AgentEvent, type Approval, type Command, type ProfileName } from '@fruitfly/core';
import { EgressGuard, summarizeLedger } from '@fruitfly/egress';
import { BudgetTracker, CircuitBreakers, ModelRouter, RateLimiter, ResponseCache, anthropicProvider, buildProfiles, detectGateway, geminiProvider, ollamaProvider, openaiProvider, type RouterEvent } from '@fruitfly/gateway';
import { IdbPantryStore, Pantry } from '@fruitfly/pantry';
import { loadKeys, loadSettings, onSettings, type Settings } from '../shared/settings';
import { isLiveConfigured, profilesFrom, routeLabel } from '../shared/routes';
import { makeEmbedder, makeGuard } from '../shared/guard';
import { ChromeLedger, IdbObservationStore, IdbTaskStore, PersistentValue, breakerStore, budgetStore, limiterStore, sanitizeReplay, type ReplayRecord } from '../shared/stores';
import type { InternalMsg, PanelMsg } from '../shared/messages';
import { ChromeBrowser, ChromeSitePolicy, originPattern } from './chrome-browser';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MOOD_FOR_KIND: Record<string, string> = { read: 'reading', search: 'searching', click: 'acting', type: 'typing', navigate: 'acting', wait: 'waiting', other: 'thinking' };

export class AgentHost {
  settings!: Settings; keys: Awaited<ReturnType<typeof loadKeys>> = {};
  guard!: EgressGuard; router!: ModelRouter; client!: ModelClient; breakers!: CircuitBreakers; budget!: BudgetTracker; limiter!: RateLimiter;
  readonly browser = new ChromeBrowser(); readonly tasks = new IdbTaskStore(); readonly observations = new IdbObservationStore(); readonly ledger = new ChromeLedger();
  pantry!: Pantry; controller!: AgentController; policy!: ChromeSitePolicy;
  readonly ports = new Set<chrome.runtime.Port>(); backlog: AgentEvent[] = []; path: [number, number, number][] = []; errors: { code: string; at: number }[] = [];
  private meter = new TokenMeter(); private context = new ContextManager(); private breakerP = new PersistentValue<never>('ff:breakers'); private limiterP = new PersistentValue<never>('ff:limiter'); private budgetP = new PersistentValue<never>('ff:budget');
  private permissionHost: string | null = null; private currentTaskId: string | undefined; private taskEvents: AgentEvent[] = [];
  ready: Promise<void>;

  constructor() { this.ready = this.init(); }

  private async init(): Promise<void> {
    this.settings = await loadSettings(); this.keys = await loadKeys();
    await Promise.all([this.breakerP.init(), this.limiterP.init(), this.budgetP.init()]);
    this.backlog = ((await chrome.storage.session.get('ff:backlog'))['ff:backlog'] as AgentEvent[] | undefined) ?? [];
    this.build();
    onSettings((s) => { this.settings = s; this.build(); this.broadcast({ kind: 'env', route: routeLabel(s), gateway: this.gatewayState() }); });
    chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c['ff:keys']) void loadKeys().then((k) => { this.keys = k; this.build(); }); });
    // a service worker that was killed mid-task picks up where it left off
    const active = (await chrome.storage.session.get('ff:active'))['ff:active'] as string | undefined;
    if (active) { const t = await this.tasks.load(active); if (t && (t.status === 'running' || t.status === 'waiting_approval')) { this.currentTaskId = active; void this.controller.resume(active).catch(() => undefined); } else await chrome.storage.session.remove('ff:active'); }
  }

  gatewayState(): 'connected' | 'asleep' | 'auth' | 'none' {
    if (!this.settings.gateway.enabled) return 'none';
    const h = this.breakers?.health('gateway:auto:smart'); const h2 = this.breakers?.health('gateway:auto');
    if (h?.state === 'auth' || h2?.state === 'auth') return 'auth';
    if (h?.state === 'down' || h2?.state === 'down' || this.gwDown) return 'asleep'; return 'connected';
  }
  private gwDown = false;

  /** (Re)build the model stack from settings. Cheap; runs on every settings change. */
  build(): void {
    const s = this.settings;
    this.guard = makeGuard({ settings: () => this.settings, confirm: (preview) => this.confirmSend(preview), ledger: this.ledger });
    this.breakers = new CircuitBreakers(breakerStore(this.breakerP));
    this.limiter = new RateLimiter(Date.now, limiterStore(this.limiterP), {});
    this.budget = new BudgetTracker({ perTask: s.budget.perTask, dayHard: s.budget.dayHard, daySoft: s.budget.dayHard * 0.8, monthHard: s.budget.monthHard, monthSoft: s.budget.monthHard * 0.8 }, budgetStore(this.budgetP));
    const profiles = profilesFrom(s);
    for (const p of Object.values(profiles)) for (const r of p.chain) this.limiter.register(r.id, r.limits);
    this.router = new ModelRouter({ profiles: () => profilesFrom(this.settings), providers: { 'openai-compat': openaiProvider, freellmapi: openaiProvider, ollama: ollamaProvider, anthropic: anthropicProvider, gemini: geminiProvider }, guard: this.guard, breakers: this.breakers, limiter: this.limiter, budget: this.budget, cache: new ResponseCache(), keys: (ref) => (ref ? (this.keys as Record<string, string | undefined>)[ref] : undefined), onEvent: (e) => this.routerEvent(e) });
    this.client = new RouterModelClient(this.router, () => buildProfiles('balanced'));
    const real = this.client as RouterModelClient;
    this.client = { complete: (p, r, o) => real.complete(p, r, o), modelInfo: (p) => this.modelInfo(p), allowance: (p) => this.allowance(p) };
    this.policy = new ChromeSitePolicy((host) => { this.permissionHost = host; this.broadcast({ kind: 'env', permission: { host } }); void this.browser.overlay(this.browser.touchedTabs[0] ?? 0, { op: 'needs_you', text: `Needs permission for ${host}` }); }, () => []);
    this.browser.onNeedPermission = (host) => { this.permissionHost = host; this.broadcast({ kind: 'env', permission: { host } }); };
    this.browser.onTouch = (tabId) => { void this.browser.installOverlay(tabId, { size: 38, energy: this.settings.ui.energy, reduced: this.settings.ui.reducedMotion === 'on' ? true : this.settings.ui.reducedMotion === 'off' ? false : undefined }); };
    void this.buildPantry();
    this.controller = new AgentController(() => ({
      model: this.client, browser: this.browser, context: this.context, meter: this.meter, observations: this.observations, store: this.tasks,
      pantry: this.settings.pantry.enabled ? this.pantry : undefined, sitePolicy: this.policy, settings: { stepsCap: this.settings.stepsCap, tokensCap: this.settings.budget.perTask },
      beforeAction: (i) => this.beforeAction(i), afterAction: async () => { await sleep(120); },
    }));
    this.controller.on((e) => this.onEvent(e));
  }

  private modelInfo(p: ProfileName) { const rs = profilesFrom(this.settings)[p]?.chain ?? []; const f = rs[0]; if (!f) return { id: 'none', maxContext: 16_000, maxOutput: 2048, supportsTools: true, supportsVision: false, supportsStreaming: false }; return { id: f.model, label: f.label, maxContext: Math.min(...rs.slice(0, 2).map((r) => r.caps.maxContext)), maxOutput: f.caps.maxOutput, supportsTools: f.caps.tools, supportsVision: f.caps.vision, supportsStreaming: f.caps.streaming }; }
  private allowance(p: ProfileName) { const rs = profilesFrom(this.settings)[p]?.chain ?? []; if (rs.some((r) => r.kind === 'local')) return 'local-only' as const; return rs.some((r) => r.allowsPersonal) ? ('personal' as const) : ('public' as const); }

  private async buildPantry(): Promise<void> {
    const store = await IdbPantryStore.open();
    this.pantry = new Pantry({ store, embedder: makeEmbedder(this.settings, this.guard), vault: { iterations: 600_000, autoLockMs: 15 * 60_000 } });
    const raw = (await chrome.storage.session.get('ff:vaultkey'))['ff:vaultkey'] as number[] | undefined;
    if (raw) await this.pantry.vault.importSessionKey(new Uint8Array(raw).buffer).catch(() => undefined);
  }

  /** "Ask me before sending personal info": shown as an approval with the exact segments that would leave. */
  private async confirmSend(preview: Parameters<NonNullable<ConstructorParameters<typeof EgressGuard>[0]>['confirm'] & object>[0]): Promise<boolean> {
    const approval: Approval = { id: `send_${Date.now().toString(36)}`, taskId: this.currentTaskId ?? 'none', action: 'Send personal info to a model?', reason: `${preview.segments.filter((s) => s.sensitivity === 'personal').length} personal item(s) would go to ${preview.route}.`, level: 'confirm', preview: preview.segments.map((s) => ({ label: `${s.kind} (${s.sensitivity})`, value: `≈${s.tokens} tokens${s.redactions ? `, ${s.redactions} redacted` : ''}` })) };
    const ev: AgentEvent = { type: 'approval_needed', taskId: approval.taskId, at: Date.now(), approval };
    this.onEvent(ev);
    const d = await this.controller.gate.request(approval);
    this.onEvent({ type: 'approval_resolved', taskId: approval.taskId, at: Date.now(), approvalId: approval.id, decision: d });
    return d === 'approve';
  }

  private routerEvent(e: RouterEvent): void {
    const base = { taskId: this.currentTaskId ?? 'none', at: Date.now() };
    if (e.type === 'route_switch') this.onEvent({ ...base, type: 'route_switch', from: e.from, to: e.to, reason: e.reason });
    else if (e.type === 'throttled') this.onEvent({ ...base, type: 'throttled', untilMs: e.untilMs, routeId: e.route });
    else if (e.type === 'unthrottled') this.onEvent({ ...base, type: 'unthrottled' });
    else if (e.type === 'breaker') { this.gwDown = false; this.broadcast({ kind: 'env', gateway: this.gatewayState() }); }
  }

  private async beforeAction(i: { kind: string; tabId?: string; ref?: string; label?: string }): Promise<void> {
    const tab = Number(i.tabId); if (!tab) return sleep(100);
    if (i.ref) { await this.browser.overlay(tab, { op: 'target', ref: i.ref, label: i.label, kind: i.kind }); await sleep(i.kind === 'click' ? 420 : 460); if (i.kind === 'click') await this.browser.overlay(tab, { op: 'click' }); }
    else { await this.browser.overlay(tab, { op: 'mood', mood: MOOD_FOR_KIND[i.kind] ?? 'thinking' }); await sleep(180); }
  }

  // ── events ──
  private onEvent(e: AgentEvent): void {
    if (e.type === 'task_started') { this.currentTaskId = e.taskId; this.taskEvents = []; this.path = []; void chrome.storage.session.set({ 'ff:active': e.taskId }); void chrome.alarms.create('ff-keepalive', { periodInMinutes: 0.4 }); this.backlog = []; }
    this.taskEvents.push(e);
    if (e.type !== 'usage' || this.backlog.length % 5 === 0) { this.backlog.push(e); if (this.backlog.length > 400) this.backlog.splice(0, this.backlog.length - 400); void chrome.storage.session.set({ 'ff:backlog': this.backlog }); }
    if (e.type === 'error') this.errors.push({ code: e.code, at: e.at });
    if (e.type === 'step_started') { this.currentTaskId = e.taskId; }
    if (e.type === 'approval_needed') { void chrome.action.setBadgeText({ text: '!' }); void chrome.action.setBadgeBackgroundColor({ color: '#C2342B' }); for (const t of this.browser.touchedTabs) void this.browser.overlay(t, { op: 'needs_you' }); }
    if (e.type === 'approval_resolved') { void chrome.action.setBadgeText({ text: '' }); for (const t of this.browser.touchedTabs) void this.browser.overlay(t, { op: 'mood', mood: 'acting' }); }
    if (e.type === 'result' || e.type === 'stopped' || (e.type === 'error' && !e.recoverable)) void this.finish(e);
    this.broadcast({ kind: 'event', event: e }); this.broadcast({ kind: 'env', nectar: this.budget.nectar() });
  }

  private async finish(e: AgentEvent): Promise<void> {
    await chrome.storage.session.remove('ff:active'); await chrome.alarms.clear('ff-keepalive'); await chrome.action.setBadgeText({ text: '' });
    const id = this.currentTaskId; const t = id ? await this.tasks.load(id) : undefined;
    if (t && this.taskEvents.length) {
      const sites = [...new Set(t.sources.filter((s) => s.url).map((s) => { try { return new URL(s.url!).hostname; } catch { return ''; } }).filter(Boolean))];
      const rec: ReplayRecord = { taskId: t.id, goal: t.goal, at: Date.now(), events: this.taskEvents.slice(-300), path: this.path.slice(-600), sites, tokens: t.budgets.tokensUsed };
      try { await this.tasks.saveReplay(sanitizeReplay(rec, Object.values(this.keys).filter(Boolean) as string[])); } catch { /* never store a replay that could hold a secret */ }
    }
    setTimeout(() => void this.browser.hideOverlays(), e.type === 'result' ? 2600 : 600);
    // helper tabs the agent opened are closed with the task
    for (const tab of [...this.browser.opened]) await this.browser.closeTab(String(tab));
    this.broadcast({ kind: 'env', running: false });
  }

  /** the loop pauses at its next boundary; tell the panel and the page right away so the button never feels dead */
  private announcePause(): void { if (this.currentTaskId) this.onEvent({ type: 'paused', taskId: this.currentTaskId, at: Date.now() }); }

  broadcast(m: PanelMsg): void { for (const p of this.ports) { try { p.postMessage(m); } catch { this.ports.delete(p); } } }

  hello(port: chrome.runtime.Port): void {
    this.ports.add(port); port.onDisconnect.addListener(() => this.ports.delete(port));
    port.postMessage({ kind: 'hello', running: !!this.controller.running && this.controller.task?.status === 'running', taskId: this.currentTaskId, backlog: this.backlog, nectar: this.budget.nectar(), route: routeLabel(this.settings), gateway: this.gatewayState() } satisfies PanelMsg);
  }

  // ── commands from the panel ──
  async command(raw: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
    await this.ready;
    const p = CommandSchema.safeParse(raw); if (!p.success) return { ok: false, error: 'Bad command' };
    const c: Command = p.data;
    switch (c.cmd) {
      case 'start_task': {
        if (!isLiveConfigured(this.settings)) { const at = Date.now(); this.onEvent({ type: 'task_started', taskId: 'none', at, goal: c.goal, mode: 'live' }); this.onEvent({ type: 'error', taskId: 'none', at, code: 'gateway_down', message: "I can't reach your gateway.", recoverable: false }); return { ok: false, error: 'not_configured' }; }
        void this.controller.start(c.goal, { mode: 'live', profile: c.profile ?? 'smart', stepsCap: this.settings.stepsCap, tokensCap: this.settings.budget.perTask }).catch((e: Error) => this.onEvent({ type: 'error', taskId: this.currentTaskId ?? 'none', at: Date.now(), code: 'unknown', message: e.message, recoverable: false }));
        return { ok: true };
      }
      case 'stop': this.controller.stop(); return { ok: true };
      case 'pause': this.controller.pause(); this.announcePause(); return { ok: true };
      case 'resume': if (this.controller.isPaused) this.controller.resumePaused(); else void this.controller.resume(); return { ok: true };
      case 'approve': this.controller.approve(c.approvalId); return { ok: true };
      case 'cancel_approval': this.controller.cancelApproval(c.approvalId); return { ok: true };
      case 'takeover': this.controller.takeover(); return { ok: true };
      case 'new_task': this.controller.stop(); this.backlog = []; await chrome.storage.session.remove(['ff:backlog', 'ff:active']); return { ok: true };
      case 'compact': { const t = this.controller.task; if (t) { const m = this.client.modelInfo(t.routeProfile); const r = await this.context.compact(t, 'user', m, { tools: [] }); await this.tasks.save(r.task); this.controller.task = r.task; this.onEvent({ type: 'compacted', taskId: t.id, at: Date.now(), report: r.report }); } return { ok: true }; }
      case 'ping_gateway': { const d = await detectGateway(this.guard, c.baseUrl ?? this.settings.gateway.url).catch(() => ({ reachable: false, authRequired: false, via: 'none' as const })); this.gwDown = !d.reachable; this.broadcast({ kind: 'env', gateway: this.gatewayState() }); return { ok: true, data: d }; }
      default: return { ok: false, error: 'Unsupported here' };
    }
  }

  async internal(m: InternalMsg, sender?: chrome.runtime.MessageSender): Promise<unknown> {
    await this.ready;
    switch (m.ff) {
      case 'command': return this.command(m.command);
      case 'permission_granted': this.policy.settle(m.host, true); this.permissionHost = null; this.broadcast({ kind: 'env', permission: null }); return { ok: true };
      case 'permission_denied': this.policy.settle(m.host, false); this.broadcast({ kind: 'env', permission: null }); return { ok: true };
      case 'takeover_from_page': this.controller.takeover(); this.controller.pause(); this.announcePause(); return { ok: true };
      case 'stop_from_page': this.controller.stop(); return { ok: true };
      case 'fly_path': this.path.push(...m.pts); return { ok: true };
      case 'pantry_changed': {
        await this.pantry.reload();
        const raw = (await chrome.storage.session.get('ff:vaultkey'))['ff:vaultkey'] as number[] | undefined;
        if (raw) await this.pantry.vault.importSessionKey(new Uint8Array(raw).buffer).catch(() => undefined); else this.pantry.vault.lock();
        return { ok: true };
      }
      case 'get_inspector': { const t = this.controller.task; const model = this.client.modelInfo(t?.routeProfile ?? 'smart'); return t ? this.context.inspect(t, model, { tools: [] }, this.meter.report(t.id)) : null; }
      case 'ledger_get': { const all = await this.ledger.all(); return { entries: all.slice(-200), summary: summarizeLedger(all) }; }
      case 'test_gateway': return this.testGateway(m.url, m.key);
      case 'add_page_to_pantry': return this.addPage(m.tabId ?? sender?.tab?.id);
      case 'forget_site': await chrome.permissions.remove({ origins: [originPattern(`https://${m.host}/`), originPattern(`http://${m.host}/`)] }).catch(() => undefined); return { ok: true };
      case 'diagnostics': return this.diagnostics();
      case 'wipe_all': return this.wipeAll();
      case 'run_saved': { const t = this.settings.savedTasks.find((x) => x.id === m.id); return t ? this.command({ cmd: 'start_task', goal: t.goal }) : { ok: false }; }
      default: return { ok: true };
    }
  }

  private async testGateway(url: string, key?: string) {
    const out = { chat: false, tools: false, stream: false, error: undefined as string | undefined };
    try {
      const route = { id: 'wizard', kind: 'local' as const, allowsPersonal: false };
      const hdr = (k?: string) => ({ 'content-type': 'application/json', ...(k ? { authorization: `Bearer ${k}` } : {}) });
      const call = async (body: unknown) => this.guard.fetch(route, `${url.replace(/\/$/, '')}/chat/completions`, { method: 'POST', headers: hdr(key), body: JSON.stringify(body) }, { category: 'gateway-probe' });
      const r1 = await call({ model: 'auto', max_tokens: 8, messages: [{ role: 'user', content: 'Say ok.' }] });
      if (r1.status === 401 || r1.status === 403) { out.error = "That key didn't work."; return out; }
      out.chat = r1.ok; if (!r1.ok) { out.error = `The gateway answered ${r1.status}.`; return out; }
      const r2 = await call({ model: 'auto', max_tokens: 24, tool_choice: 'auto', tools: [{ type: 'function', function: { name: 'ping', description: 'Reply by calling this.', parameters: { type: 'object', properties: {} } } }], messages: [{ role: 'user', content: 'Call the ping tool.' }] });
      out.tools = r2.ok && (((await r2.json()) as { choices?: { message?: { tool_calls?: unknown[] } }[] }).choices?.[0]?.message?.tool_calls?.length ?? 0) > 0;
      const r3 = await call({ model: 'auto', max_tokens: 8, stream: true, messages: [{ role: 'user', content: 'Say ok.' }] });
      out.stream = r3.ok && (r3.headers.get('content-type') ?? '').includes('event-stream');
    } catch (e) { out.error = e instanceof Error ? e.message : 'I cannot reach your gateway.'; }
    return out;
  }

  private async addPage(tabId?: number) {
    if (!tabId) return { ok: false };
    const p = await this.browser.addPage(tabId);
    const doc = await this.pantry.addText(p.title || 'Saved page', p.html, { kind: 'html', source: { kind: 'page', url: p.url } });
    this.broadcast({ kind: 'env' }); try { await chrome.runtime.sendMessage({ ff: 'pantry_changed' }); } catch { /* no listeners */ }
    return { ok: true, id: doc.id, title: doc.title };
  }

  async diagnostics() {
    const m = chrome.runtime.getManifest(); const all = await this.ledger.all();
    const routes = Object.values(profilesFrom(this.settings)).flatMap((p) => p.chain).map((r) => ({ id: r.id, kind: r.kind, health: this.breakers.health(r.id) }));
    return { versions: { extension: m.version, chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] }, mode: this.settings.mode, routes, errors: this.errors.slice(-20), ledger: summarizeLedger(all), pantry: { enabled: this.settings.pantry.enabled, embedder: this.pantry?.embedderId }, note: 'No page content, documents, prompts or keys are included.' };
  }

  async wipeAll() {
    await this.pantry.wipe(); await this.tasks.wipe(); await this.observations.purge(); await this.ledger.clear();
    await chrome.storage.local.clear(); await chrome.storage.session.clear();
    const perms = await chrome.permissions.getAll(); if (perms.origins?.length) await chrome.permissions.remove({ origins: perms.origins }).catch(() => undefined);
    await this.init(); this.broadcast({ kind: 'env' }); return { ok: true };
  }
}
