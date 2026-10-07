import { Pantry, type Embedder } from '@fruitfly/pantry';
import { MockBrowser, type AgentController } from '@fruitfly/agent';
import type { FlyApi, InspectorData, PanelController, PanelEnv, PantryApi, DocView, FixAction } from '@fruitfly/ui';
import { SessionStore, Store } from '@fruitfly/ui';
import { ContextManager } from '@fruitfly/context';
import type { AgentEvent, Sensitivity } from '@fruitfly/core';
import { createDemoRig, type DemoRig } from './rig';
import { scenarioForGoal, SCENARIOS } from './brains';
import { seedDemoPantry } from './seed';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface DemoPanelOptions { session?: SessionStore; env?: Store<PanelEnv>; pantry?: Pantry; seedPantry?: boolean; thinkMs?: number; latency?: number; failoverDemo?: boolean; reducedPacing?: boolean; rateLimitAtCall?: number; onBrowser?: (b: MockBrowser) => void }

/**
 * The same loop, router, context layer and Pantry as the real extension, driven by a scripted model against the MockBrowser.
 * Used by the landing page, onboarding, Fly Lab and e2e tests.
 */
export class DemoPanelController implements PanelController {
  session: SessionStore;
  env: Store<PanelEnv>;
  private envInit: PanelEnv = { mode: 'demo', routeLabel: 'Demo mode', gateway: 'connected', nectar: 0.86, pantryOn: true, running: false, firstRun: true, localModel: true };
  pantry: PantryApi;
  rig?: DemoRig;
  browser: MockBrowser | null = null;
  private fly: FlyApi | null = null;
  private listeners = new Set<(e: AgentEvent) => void>();
  private pantryObj: Pantry;
  private subs = new Set<() => void>();
  options: DemoPanelOptions;
  private view: ParentNode | null = null;
  private browserSubs = new Set<() => void>();

  constructor(opts: DemoPanelOptions = {}) {
    this.options = opts;
    this.session = opts.session ?? new SessionStore(); this.env = opts.env ?? new Store<PanelEnv>(this.envInit);
    this.pantryObj = opts.pantry ?? new Pantry({ vault: { iterations: 2000 } });
    this.pantry = this.makePantryApi();
    if (opts.seedPantry !== false) void seedDemoPantry(this.pantryObj).then(() => this.bump());
  }

  attachFly(f: FlyApi | null): void { this.fly = f; }
  attachView(el: ParentNode | null): void { this.view = el; }
  onBrowser(cb: () => void): () => void { this.browserSubs.add(cb); return () => this.browserSubs.delete(cb); }
  onEvent(fn: (e: AgentEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit = (e: AgentEvent) => { this.session.dispatch(e); this.listeners.forEach((l) => l(e)); if (e.type === 'task_started' || e.type === 'result' || e.type === 'stopped' || e.type === 'error') this.env.patch({ running: e.type === 'task_started' }); };

  /** the fly arrives beside the real element before the action happens */
  private beat = async (info: { kind: string; ref?: string; label?: string }) => {
    const fly = this.fly; const pace = this.options.reducedPacing ? 0 : 1;
    if (fly && info.ref && this.view) {
      const el = this.view.querySelector<HTMLElement>(`[data-ff-ref="${info.ref}"]`);
      if (el) {
        const r = el.getBoundingClientRect(); const eng = fly.engine; const layer = document.querySelector('.ff-fly-layer')?.getBoundingClientRect();
        const ox = layer?.left ?? 0, oy = layer?.top ?? 0;
        // wide elements (inputs, banners): hover above their right end, inside the page; small ones: beside them
        const to = r.width > 240 ? { x: r.right - 40 - ox, y: r.top - 20 - oy } : { x: r.right + 26 - ox, y: r.top + r.height / 2 - 6 - oy };
        await new Promise<void>((res) => { eng.flyTo(to, { style: 'dart', look: { x: r.left + r.width / 2 - (layer?.left ?? 0), y: r.top + r.height / 2 - (layer?.top ?? 0) }, onArrive: res }); setTimeout(res, 1600); });
        if (info.kind === 'click') fly.click(); else if (info.kind === 'type') fly.setMood('typing');
        await sleep(info.kind === 'click' ? 260 * pace : 380 * pace);
        return;
      }
    }
    if (fly && (info.kind === 'read' || info.kind === 'search')) await sleep(450 * pace);
    else await sleep(180 * pace);
  };

  private env2(): void { this.env.patch({ running: false }); }

  start(goal: string): void {
    this.session.reset();
    const scenario = scenarioForGoal(goal);
    this.env.patch({ firstRun: false, running: true });
    void (async () => {
      this.rig = await createDemoRig({ scenario, pantry: this.pantryObj, latency: this.options.latency ?? 0, thinkMs: this.options.thinkMs ?? 520, failoverDemo: this.options.failoverDemo, rateLimitAtCall: this.options.rateLimitAtCall, beforeAction: this.beat, afterAction: async () => { await sleep(this.options.reducedPacing ? 0 : 160); }, onRouterEvent: (e) => this.routerEvent(e), sleep: async (ms) => { await sleep(Math.min(ms, 900)); } });
      this.browser = this.rig.browser; this.options.onBrowser?.(this.browser); this.browserSubs.forEach((l) => l());
      this.rig.controller.on((e) => this.emit(e));
      try { await this.rig.controller.start(goal, { mode: 'demo' }); } catch (e) { this.emit({ type: 'error', taskId: 'x', at: Date.now(), code: 'unknown', message: e instanceof Error ? e.message : String(e), recoverable: false }); }
      this.env2(); this.env.patch({ nectar: Math.max(0.1, this.env.get().nectar - 0.03) });
    })();
  }
  private routerEvent(e: import('@fruitfly/gateway').RouterEvent): void {
    const base = { taskId: this.session.state.taskId ?? 'demo', at: Date.now() };
    if (e.type === 'route_switch') { this.env.patch({ routeLabel: e.to.replace('demo:', '') }); this.emit({ ...base, type: 'route_switch', from: e.from, to: e.to, reason: e.reason }); }
    else if (e.type === 'throttled') this.emit({ ...base, type: 'throttled', untilMs: e.untilMs, routeId: e.route });
    else if (e.type === 'unthrottled') this.emit({ ...base, type: 'unthrottled' });
  }
  stop(): void { this.rig?.controller.stop(); this.fly?.halt(); }
  pause(): void { this.rig?.controller.pause(); this.emit({ type: 'paused', taskId: this.session.state.taskId ?? 'demo', at: Date.now() }); }
  resume(): void { this.rig?.controller.resumePaused(); }
  approve(id: string): void { this.rig?.controller.approve(id); }
  cancelApproval(id: string): void { this.rig?.controller.cancelApproval(id); }
  takeover(): void { this.rig?.controller.takeover(); }
  compact(): void { /* the demo context is tiny; the inspector shows it */ }
  newTask(): void { this.rig?.controller.stop(); this.session.reset(); this.env.patch({ running: false }); this.fly?.setMood('idle'); this.fly?.perchAt('perch-default'); }
  revealResult(): void { this.session.patch({ resultRevealed: true }); }
  suggestions(): string[] { return SCENARIOS.slice(0, 4).map((s) => s.goal); }
  fix(a: FixAction): void { if (a === 'use-demo') this.env.patch({ mode: 'demo', gateway: 'connected' }); }
  saveTask(): void { /* demo: nothing to save */ }

  inspector(): InspectorData {
    const t = this.rig?.controller.task;
    const cm = new ContextManager();
    if (!t) return { window: 64_000, used: 1_100, reserve: 9_000, compactAt: 44_800, cachedPrefixTokens: 1_100, segments: [{ kind: 'system', tokens: 700, fraction: 0.011, cacheable: true, sensitivity: 'public', trimmable: false, description: 'Rules, safety and style. Fixed.' }, { kind: 'tools', tokens: 400, fraction: 0.006, cacheable: true, sensitivity: 'public', trimmable: false, description: 'Tool schemas for the active groups. Fixed.' }, { kind: 'reserve', tokens: 9000, fraction: 0.14, cacheable: false, sensitivity: 'public', trimmable: false, description: 'Room kept free for the answer.' }] };
    return cm.inspect(t, { id: 'demo', maxContext: 64_000, maxOutput: 4096, supportsTools: true, supportsVision: false, supportsStreaming: false }, { tools: [] }, undefined) as InspectorData;
  }

  private bump = () => this.subs.forEach((s) => s());
  private makePantryApi(): PantryApi {
    const p = this.pantryObj; const subs = this.subs; const bump = () => this.bump();
    const view = (d: Awaited<ReturnType<Pantry['list']>>[number]): DocView => ({ id: d.id, title: d.title, mime: d.mime, bytes: d.bytes, sensitivity: d.sensitivity, status: d.status, lastUsedAt: d.lastUsedAt, chunkCount: d.chunkCount, error: d.error });
    return {
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
      docs: async () => (await p.list()).map(view),
      addFiles: async (files) => { for (const f of files) await p.addFile(f); bump(); },
      addText: async (t, x, s) => { await p.addText(t, x, { sensitivity: s }); bump(); },
      remove: async (id) => { await p.remove(id); bump(); },
      setSensitivity: async (id, s: Sensitivity) => { await p.setSensitivity(id, s); bump(); },
      search: async (q) => (await p.search(q, { maxAllowed: 'local-only', force: true, k: 4 })).passages.map((x) => ({ id: x.id, doc: x.doc, page: x.page, text: x.text, sensitivity: x.sensitivity, headingPath: x.headingPath })),
      profile: async () => { const fields = await p.profile.get(); const d = await p.profile.digest(); const st = (await import('@fruitfly/pantry')).standingInstructions(fields); return { fields, digestTokens: d.tokens, standing: st }; },
      setProfile: async (k, patch) => { await p.profile.update(k, patch); bump(); },
      notes: async () => (await p.notes.list()).map((n) => ({ id: n.id, text: n.text, status: n.status })),
      keepNote: async (id) => { await p.notes.keep(id); bump(); }, deleteNote: async (id) => { await p.notes.dismiss(id); bump(); }, editNote: async (id, t) => { await p.notes.edit(id, t); bump(); },
      vault: { state: async () => (!(await p.vault.isSetUp()) ? 'unset' : p.vault.isUnlocked() ? 'unlocked' : 'locked'), fields: async () => p.vault.list(), setup: async (x) => { await p.vault.setup(x); bump(); }, unlock: async (x) => { await p.vault.unlock(x); bump(); }, lock: async () => { p.vault.lock(); bump(); }, add: async (k, l, v) => { await p.vault.set(k, l, v); bump(); }, remove: async (k) => { await p.vault.remove(k); bump(); } },
      usage: async () => { const u = await p.usage(); return { bytes: u.bytes, quota: u.quota, nearlyFull: u.nearlyFull }; },
    };
  }
}
export type { Embedder, AgentController };
