import type { AgentEvent } from '@fruitfly/core';
import { DemoPanelController } from '@fruitfly/demo';
import { SessionStore, Store, type FixAction, type InspectorData, type PanelController, type PanelEnv, type PantryApi } from '@fruitfly/ui';
import { PanelMsgSchema } from '../shared/messages';
import { loadSettings, onSettings, updateSettings, type Settings } from '../shared/settings';
import { isLiveConfigured, routeLabel } from '../shared/routes';
import { originPattern } from '../background/chrome-browser';
import { LocalPantry } from './pantry-api';

const send = (m: unknown): Promise<unknown> => chrome.runtime.sendMessage(m).catch(() => undefined);

/** Panel ⇄ service worker. In demo mode the same loop runs in this page against the mock browser. */
export class ExtPanelController implements PanelController {
  session = new SessionStore();
  env = new Store<PanelEnv>({ mode: 'demo', routeLabel: 'Demo mode', gateway: 'none', nectar: 1, pantryOn: true, running: false, firstRun: true });
  pantry: PantryApi; local: LocalPantry; demo: DemoPanelController; settings!: Settings;
  private port: chrome.runtime.Port | null = null; private listeners = new Set<(e: AgentEvent) => void>(); private retry = 0;
  private lastPermission: string | null = null;

  constructor() {
    this.local = new LocalPantry(); this.pantry = this.local.api;
    // demo mode uses its own in-memory Pantry with fake data: your real documents are never touched by the scripted model
    this.demo = new DemoPanelController({ session: this.session, env: this.env, thinkMs: 520 });
    this.demo.onEvent((e) => this.listeners.forEach((l) => l(e)));
    void this.init();
  }
  private async init() {
    this.settings = await loadSettings(); this.applySettings(this.settings);
    onSettings((s) => { this.settings = s; this.applySettings(s); });
    this.connect();
  }
  private applySettings(s: Settings) { this.env.patch({ mode: s.mode, routeLabel: routeLabel(s), pantryOn: s.pantry.enabled, firstRun: !s.onboarded && s.firstUseAt > 0 && !this.session.state.goal, localModel: s.ollama.enabled, gateway: s.gateway.enabled ? this.env.get().gateway === 'none' ? 'connected' : this.env.get().gateway : 'none' }); }

  private connect() {
    try { this.port = chrome.runtime.connect({ name: 'panel' }); } catch { return; }
    this.port.onMessage.addListener((raw) => {
      const p = PanelMsgSchema.safeParse(raw); if (!p.success) return; const m = p.data; this.retry = 0;
      if (m.kind === 'hello') { if (this.settings?.mode === 'live' && m.backlog.length) { this.session.reset(); m.backlog.forEach((e) => this.session.dispatch(e)); } this.env.patch({ nectar: m.nectar, gateway: m.gateway === 'none' && !this.settings?.gateway.enabled ? 'none' : m.gateway, running: m.running }); }
      else if (m.kind === 'event') { if (this.settings?.mode === 'demo') return; this.session.dispatch(m.event); this.listeners.forEach((l) => l(m.event)); if (m.event.type === 'task_started') this.env.patch({ running: true, firstRun: false }); if (m.event.type === 'result' || m.event.type === 'stopped') this.env.patch({ running: false }); }
      else if (m.kind === 'env') { const { kind: _k, permission, ...rest } = m; void _k; this.env.patch({ ...(rest as Partial<PanelEnv>), ...(permission !== undefined ? { permission: permission ?? undefined } : {}) }); if (permission) this.lastPermission = permission.host; }
    });
    this.port.onDisconnect.addListener(() => { this.port = null; setTimeout(() => this.connect(), Math.min(5000, 300 * 2 ** this.retry++)); });
  }

  onEvent(fn: (e: AgentEvent) => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private live(): boolean { return this.settings?.mode === 'live'; }
  start(goal: string): void {
    if (!this.live()) { this.demo.start(goal); return; }
    if (!isLiveConfigured(this.settings)) { this.session.reset(); }
    this.env.patch({ firstRun: false, running: true }); void send({ ff: 'command', command: { cmd: 'start_task', goal, mode: 'live' } });
  }
  stop() { if (this.live()) void send({ ff: 'command', command: { cmd: 'stop' } }); else this.demo.stop(); }
  pause() { if (this.live()) void send({ ff: 'command', command: { cmd: 'pause' } }); else this.demo.pause(); }
  resume() { if (this.live()) void send({ ff: 'command', command: { cmd: 'resume' } }); else this.demo.resume(); }
  approve(id: string) { if (this.live()) void send({ ff: 'command', command: { cmd: 'approve', approvalId: id } }); else this.demo.approve(id); }
  cancelApproval(id: string) { if (this.live()) void send({ ff: 'command', command: { cmd: 'cancel_approval', approvalId: id } }); else this.demo.cancelApproval(id); }
  takeover() { if (this.live()) void send({ ff: 'command', command: { cmd: 'takeover' } }); else this.demo.takeover(); }
  compact() { if (this.live()) void send({ ff: 'command', command: { cmd: 'compact' } }); else this.demo.compact(); }
  newTask() { if (this.live()) void send({ ff: 'command', command: { cmd: 'new_task' } }); this.demo.newTask(); this.session.reset(); this.env.patch({ running: false }); }
  revealResult() { this.session.patch({ resultRevealed: true }); }
  suggestions(): string[] { const s = this.settings?.savedTasks.slice(0, 3).map((t) => t.goal) ?? []; return [...s, ...this.demo.suggestions()].slice(0, 4); }
  async inspector(): Promise<InspectorData> { if (!this.live()) return this.demo.inspector(); const r = (await send({ ff: 'get_inspector' })) as InspectorData | null; return r ?? this.demo.inspector(); }
  openSettings(page: 'models' | 'privacy' | 'general' | 'pantry' = 'general') { void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#/${page}`) }); }
  saveTask() {
    const g = this.session.state.goal; if (!g) return;
    void updateSettings((s) => ({ ...s, savedTasks: [...s.savedTasks.filter((t) => t.goal !== g), { id: `t_${Date.now().toString(36)}`, name: g.slice(0, 40), goal: g, description: this.session.state.result?.title ?? '' }].slice(-12) }));
  }
  replay() { void chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#/history/${this.session.state.taskId ?? ''}`) }); }
  fix(a: FixAction): void {
    switch (a) {
      case 'use-demo': void updateSettings((s) => ({ ...s, mode: 'demo' })); break;
      case 'start-gateway': case 'reconnect': case 'other-route': case 'switch-route': case 'continue-local': case 'setup-ollama': this.openSettings('models'); break;
      case 'raise-cap': this.openSettings('general'); break;
      case 'manage-storage': this.openSettings('pantry'); break;
      case 'compact': this.compact(); break;
      case 'take-over': this.takeover(); break;
      case 'retry': this.resume(); break;
      case 'allow-site': { const host = this.lastPermission; if (!host) break; chrome.permissions.request({ origins: [originPattern(`https://${host}/`), originPattern(`http://${host}/`)] }).then((ok) => send({ ff: ok ? 'permission_granted' : 'permission_denied', host })).catch(() => send({ ff: 'permission_denied', host })); break; }
      default: break;
    }
  }
}
