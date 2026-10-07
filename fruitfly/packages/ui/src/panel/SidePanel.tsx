import { AnimatePresence, motion } from 'motion/react';
import { BookOpen, Command, Gauge, Layers, ListChecks, MoreHorizontal, Pause, Play, Settings, Shield, Sparkles, Wand2, Cpu, Hand } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { dur, ease, spring, variants } from '../motion';
import { useFly, useFlyAnchor } from '../fly';
import { ProceduralFly } from '../fly/ProceduralFly';
import { usePrefersReducedMotion } from '../fly/hooks';
import { useSession } from '../session';
import { useStore } from '../store';
import { ApprovalCard, CommandBar, ContextInspector, NectarMeter, NowCard, ResultCard, StatusChip, Timeline, type InspectorData } from '../components/agent';
import { GatewayStatus } from '../components/models';
import { DropZone, NotesList, PantrySearch, PantryShelf, ProfileForm, StorageMeter, VaultPanel, type DocView, type NoteView, type PassageView, type ProfileFieldView, type VaultFieldView } from '../components/pantry';
import { CommandPalette, type PaletteItem } from '../components/palette';
import { Button, Callout, Dialog, EmptyState, IconButton, MenuItem, MenuSep, Popover, Segmented, Tabs, Textarea, ToastProvider, useToast } from '../components/primitives';
import { errorCopy } from './copy';
import type { PanelController } from './types';

function Hero({ firstRun, pantryOn }: { firstRun?: boolean; pantryOn: boolean }) {
  return (
    <EmptyState
      art={<div style={{ position: 'relative', width: 120, height: 92 }} aria-hidden>
        <svg viewBox="0 0 120 92" width="120" height="92" style={{ position: 'absolute', inset: 0 }}><path d="M12 56a48 48 0 0 0 96 0Z" fill="var(--ff-peach)" opacity=".85" /><path d="M12 56a48 48 0 0 0 96 0" fill="none" stroke="color-mix(in srgb, var(--ff-peach) 60%, var(--ff-ruby))" strokeWidth="3" strokeLinecap="round" /><path d="M20 58a40 40 0 0 0 80 0" fill="none" stroke="rgb(255 255 255 / .5)" strokeWidth="2" /><circle cx="46" cy="64" r="1.6" fill="#8a3b22" opacity=".5" /><circle cx="70" cy="70" r="1.6" fill="#8a3b22" opacity=".5" /><circle cx="84" cy="62" r="1.6" fill="#8a3b22" opacity=".5" /></svg>
        <div style={{ position: 'absolute', left: 30, top: 0 }}><ProceduralFly size={64} mood="sleeping" label="FruitFly, asleep on a peach slice" seed="hero" /></div>
      </div>}
      title={firstRun ? 'Give me a job.' : 'Nothing yet. Give me a job.'}
      body={pantryOn ? 'I browse for you, ask before anything risky, and know your documents without sending them anywhere.' : 'I browse for you and ask before anything risky. Stop works instantly.'}
    />
  );
}

function ContextMeterButton({ controller, onCompact, onFresh }: { controller: PanelController; onCompact: () => void; onFresh: () => void }) {
  const [data, setData] = useState<InspectorData | null>(null); const tick = useSession(controller.session).tick;
  const load = useCallback(async () => setData(await controller.inspector()), [controller]);
  useEffect(() => { void load(); }, [load, tick]);
  const pct = data ? Math.min(100, Math.round((data.used / data.window) * 100)) : 0;
  return (
    <Popover label="Context" trigger={({ toggle, ref }) => <IconButton label={`Context ${pct}% full`} ref={ref} onClick={() => { void load(); toggle(); }}><Gauge /></IconButton>}>
      {(close) => <div style={{ padding: 10, width: 330 }}>{data ? <ContextInspector data={data} onCompact={() => { onCompact(); close(); }} onFresh={() => { onFresh(); close(); }} /> : null}</div>}
    </Popover>
  );
}

function Header({ controller, onPalette }: { controller: PanelController; onPalette: () => void }) {
  const s = useSession(controller.session); const env = useStore(controller.env);
  const toast = useToast();
  return (
    <header className="ff-header">
      <ProceduralFly size={34} mood={s.status === 'working' ? 'thinking' : s.status === 'needs_you' ? 'asking' : 'idle'} label="FruitFly" seed="avatar" followCursor={false} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="ff-wordmark">FruitFly</div>
        <span className="ff-route">{env.mode === 'demo' ? 'Demo mode' : env.routeLabel}</span>
      </div>
      <StatusChip status={s.status} throttleUntil={s.throttle?.until} />
      <ContextMeterButton controller={controller} onCompact={() => { controller.compact(); toast.push({ text: 'Tidying up the context' }); }} onFresh={controller.newTask} />
      <NectarMeter fraction={env.nectar} usage={s.usage} />
      <Popover label="Menu" trigger={({ toggle, ref }) => <IconButton label="More" ref={ref} onClick={toggle}><MoreHorizontal /></IconButton>}>
        {(close) => <div role="menu" style={{ display: 'grid' }}>
          <MenuItem icon={<Wand2 />} onClick={() => { controller.newTask(); close(); }}>New task</MenuItem>
          <MenuItem icon={<Layers />} onClick={() => { controller.compact(); close(); }}>Compact context</MenuItem>
          <MenuItem icon={<Command />} onClick={() => { close(); onPalette(); }}>Command palette</MenuItem>
          <MenuSep />
          <MenuItem icon={<Cpu />} onClick={() => { controller.openSettings?.('models'); close(); }}>Models and gateway</MenuItem>
          <MenuItem icon={<Shield />} onClick={() => { controller.openSettings?.('privacy'); close(); }}>Privacy center</MenuItem>
          <MenuItem icon={<Settings />} onClick={() => { controller.openSettings?.('general'); close(); }}>Settings</MenuItem>
        </div>}
      </Popover>
    </header>
  );
}

function Banners({ controller }: { controller: PanelController }) {
  const s = useSession(controller.session); const env = useStore(controller.env);
  const copy = s.error ? errorCopy(s.error.code) : undefined;
  return (
    <div className="ff-stack" style={{ gap: 8, marginBottom: s.error || env.gateway !== 'connected' ? 10 : 0 }}>
      <AnimatePresence initial={false}>
        {env.mode === 'live' && env.gateway === 'asleep' && !s.error && <motion.div key="gw" {...variants.fadeUp}><Callout tone="warn" title="I can't reach your gateway." action={<div className="ff-row" style={{ marginTop: 8, flexWrap: 'wrap' }}><Button size="sm" onClick={() => controller.fix('start-gateway')}>Start it</Button><Button size="sm" variant="ghost" onClick={() => controller.fix('use-demo')}>Use demo</Button><Button size="sm" variant="ghost" onClick={() => controller.fix('other-route')}>Use another route</Button></div>}>It might not be running. Local models still work.</Callout></motion.div>}
        {s.status === 'throttled' && <motion.div key="thr" {...variants.fadeUp}><Callout tone="info" title="Catching my breath.">The free pool is busy. I'll carry on in a moment; Stop still works.</Callout></motion.div>}
        {env.permission && <motion.div key="perm" {...variants.fadeUp}><Callout tone="warn" title={`I need your permission for ${env.permission.host}.`} action={<div className="ff-row" style={{ marginTop: 8 }}><Button size="sm" variant="primary" onClick={() => controller.fix('allow-site')}>Allow this site</Button></div>}>I only act on sites you allow.</Callout></motion.div>}
        {s.injections.length > 0 && <motion.div key="inj" {...variants.fadeUp}><Callout tone="warn" title="This page seems to be giving me instructions. I'm ignoring them."><span className="ff-muted" style={{ fontSize: 12 }}>“{s.injections.at(-1)!.excerpt.slice(0, 120)}”</span></Callout></motion.div>}
        {copy && s.error && <motion.div key="err" {...variants.fadeUp}><Callout tone={s.error.recoverable ? 'warn' : 'danger'} title={copy.title} action={copy.actions.length ? <div className="ff-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>{copy.actions.map((a, i) => <Button key={a.fix} size="sm" variant={i === 0 ? 'primary' : 'ghost'} onClick={() => controller.fix(a.fix)}>{a.label}</Button>)}</div> : undefined}>{copy.body ?? s.error.message}</Callout></motion.div>}
      </AnimatePresence>
    </div>
  );
}

function TaskView({ controller, extra }: { controller: PanelController; extra?: ReactNode }) {
  const s = useSession(controller.session); const env = useStore(controller.env); const fly = useFly();
  const empty = !s.goal && s.status === 'idle';
  // the result card unfolds only once the fly has carried it in
  const revealedFor = useRef<string>('');
  useEffect(() => {
    if (!s.result || s.resultRevealed) return;
    const key = `${s.taskId}:${s.result.title}`; if (revealedFor.current === key) return; revealedFor.current = key;
    if (!fly || s.result.status === 'failed') { controller.revealResult(); return; }
    let done = false; const fin = () => { if (!done) { done = true; controller.revealResult(); } };
    const safety = setTimeout(fin, 4200);
    // handleEvent for `result` runs the carry → drop → success sequence
    Promise.resolve(fly.handleEvent({ type: 'result', taskId: s.taskId ?? '', at: Date.now(), result: s.result })).then(fin).finally(() => clearTimeout(safety));
  }, [s.result, s.resultRevealed, s.taskId, fly, controller]);
  return (
    <div>
      <Banners controller={controller} />
      {empty ? <Hero firstRun={env.firstRun} pantryOn={env.pantryOn} /> : (
        <>
          <div className="ff-goal">{s.goal}</div>
          {(s.status === 'working' || s.status === 'throttled' || s.status === 'paused' || s.status === 'needs_you') && <NowCard session={s} />}
          {extra}
          <Timeline session={s} />
          <AnimatePresence>{s.approval && <ApprovalCard key={s.approval.id} approval={s.approval} onApprove={() => controller.approve(s.approval!.id)} onCancel={() => controller.cancelApproval(s.approval!.id)} onTakeover={controller.takeover} />}</AnimatePresence>
          {s.notes.filter((n) => n.state === 'proposed').map((n) => <Callout key={n.id} tone="info" title="I'd like to remember" action={<div className="ff-row" style={{ marginTop: 8 }}><Button size="sm" variant="primary" onClick={() => controller.pantry?.keepNote(n.id)}>Keep</Button><Button size="sm" variant="ghost" onClick={() => controller.pantry?.deleteNote(n.id)}>Not now</Button></div>}>{n.text}</Callout>)}
          {s.result && <div style={{ marginTop: 10 }}><ResultCard result={s.result} revealed={s.resultRevealed} onFresh={controller.newTask} onSave={controller.saveTask} onReplay={controller.replay} /></div>}
          {s.status === 'stopped' && !s.result && <Callout tone="info" title="Stopped.">Nothing else will happen. Start fresh whenever you like.<div className="ff-row" style={{ marginTop: 8 }}><Button size="sm" onClick={controller.newTask}>Start fresh</Button></div></Callout>}
        </>)}
    </div>
  );
}

function usePantryData(c: PanelController) {
  const api = c.pantry; const [v, setV] = useState(0);
  useEffect(() => api?.subscribe(() => setV((x) => x + 1)), [api]);
  const [state, setState] = useState<{ docs: DocView[]; profile?: Awaited<ReturnType<NonNullable<typeof api>['profile']>>; notes: NoteView[]; vaultState: 'unset' | 'locked' | 'unlocked'; vault: VaultFieldView[]; usage?: { bytes: number; quota?: number; nearlyFull: boolean } }>({ docs: [], notes: [], vaultState: 'unset', vault: [] });
  useEffect(() => { if (!api) return; let live = true; void (async () => { const [docs, profile, notes, vs, vault, usage] = await Promise.all([api.docs(), api.profile(), api.notes(), api.vault.state(), api.vault.fields().catch(() => []), api.usage()]); if (live) setState({ docs, profile, notes, vaultState: vs, vault, usage }); })(); return () => { live = false; }; }, [api, v]);
  return state;
}

function PantryView({ controller }: { controller: PanelController }) {
  const api = controller.pantry; const data = usePantryData(controller); const env = useStore(controller.env);
  const [sub, setSub] = useState<'docs' | 'you' | 'vault'>('docs'); const [q, setQ] = useState(''); const [hits, setHits] = useState<PassageView[]>([]); const [paste, setPaste] = useState(false);
  const [pTitle, setPTitle] = useState(''); const [pText, setPText] = useState('');
  const toast = useToast();
  if (!api) return <EmptyState title="Pantry is off" body="Turn it on in Settings to let me know your documents, on this device." action={<Button onClick={() => controller.openSettings?.('pantry')}>Open settings</Button>} />;
  return (
    <div className="ff-stack">
      <Segmented<'docs' | 'you' | 'vault'> label="Pantry sections" value={sub} onChange={setSub} options={[{ value: 'docs', label: 'Documents' }, { value: 'you', label: 'About you' }, { value: 'vault', label: 'Vault' }]} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={sub} {...variants.fadeUp} className="ff-stack">
          {sub === 'docs' && <>
            {data.usage?.nearlyFull && <StorageMeter bytes={data.usage.bytes} quota={data.usage.quota} nearlyFull onManage={() => controller.fix('manage-storage')} />}
            <DropZone onFiles={async (files) => { await api.addFiles(files); toast.push({ text: `${files.length} added to your Pantry` }); }} onPaste={() => setPaste(true)} />
            <PantrySearch query={q} results={hits} onSearch={(t) => { setQ(t); void (t.trim() ? api.search(t).then(setHits) : setHits([])); }} />
            <PantryShelf docs={data.docs} localModel={env.localModel} onSensitivity={(id, s) => void api.setSensitivity(id, s)} onRemove={(id) => void api.remove(id)} empty={<EmptyState art={<ProceduralFly size={56} mood="sleeping" label="" seed="empty" followCursor={false} />} title="Nothing here yet." body="Add a document and I'll know it." />} />
            {data.usage && !data.usage.nearlyFull && <StorageMeter bytes={data.usage.bytes} quota={data.usage.quota} nearlyFull={false} />}
          </>}
          {sub === 'you' && data.profile && <>
            <ProfileForm fields={data.profile.fields} digestTokens={data.profile.digestTokens} standing={data.profile.standing} onChange={(k, p) => void api.setProfile(k, p)} />
            <div className="ff-kicker" style={{ marginTop: 6 }}>Notes the fly keeps</div>
            <NotesList notes={data.notes} onKeep={(id) => void api.keepNote(id)} onDelete={(id) => void api.deleteNote(id)} onEdit={(id, t) => void api.editNote(id, t)} />
          </>}
          {sub === 'vault' && <VaultPanel state={data.vaultState} fields={data.vault} onSetup={(p) => api.vault.setup(p)} onUnlock={(p) => api.vault.unlock(p)} onLock={() => void api.vault.lock()} onAdd={(k, l, v) => api.vault.add(k, l, v)} onRemove={(k) => void api.vault.remove(k)} />}
        </motion.div>
      </AnimatePresence>
      <Dialog open={paste} onClose={() => setPaste(false)} title="Paste text" description="Saved to your Pantry, on this device.">
        <div className="ff-stack"><input className="ff-input" placeholder="Title" aria-label="Title" value={pTitle} onChange={(e) => setPTitle(e.target.value)} /><Textarea rows={7} aria-label="Text" placeholder="Paste anything…" value={pText} onChange={(e) => setPText(e.target.value)} />
          <div className="ff-actions"><Button onClick={() => setPaste(false)}>Cancel</Button><Button variant="primary" disabled={!pText.trim()} onClick={async () => { await api.addText(pTitle || 'Pasted text', pText, 'personal'); setPaste(false); setPTitle(''); setPText(''); toast.push({ text: 'Added to your Pantry' }); }}>Add</Button></div></div>
      </Dialog>
    </div>
  );
}

export interface SidePanelProps { controller: PanelController; className?: string; /** shown under the "now" card while a task runs (the demo browser, in demo mode) */ taskExtra?: ReactNode }

function PanelInner({ controller, taskExtra }: SidePanelProps) {
  const s = useSession(controller.session); const env = useStore(controller.env);
  const [tab, setTab] = useState<'task' | 'pantry'>('task'); const [palette, setPalette] = useState(false);
  const perch = useFlyAnchor<HTMLDivElement>('perch-default', { side: 'center' });
  const scroller = useRef<HTMLDivElement>(null); const reducedMotion = usePrefersReducedMotion(); const pinned = useRef(true);
  useEffect(() => { const el = scroller.current; if (!el) return; const on = () => { pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }; el.addEventListener('scroll', on, { passive: true }); return () => el.removeEventListener('scroll', on); }, []);
  // when the result card unfolds, bring its top into view; the fly is perched on its corner
  useEffect(() => { if (!s.resultRevealed) return; const el = scroller.current; const card = el?.querySelector<HTMLElement>('[aria-label="Result"]'); if (el && card) { pinned.current = false; const top = card.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - 10; el.scrollTo({ top, behavior: reducedMotion ? 'auto' : 'smooth' }); } }, [s.resultRevealed, reducedMotion]);
  // keep the newest step in view unless the user scrolled up to read
  useEffect(() => { const el = scroller.current; if (el && pinned.current) el.scrollTo({ top: el.scrollHeight, behavior: reducedMotion ? 'auto' : 'smooth' }); }, [s.tick, reducedMotion]);
  const toast = useToast(); const fly = useFly();
  const busy = s.status === 'working' || s.status === 'throttled' || s.status === 'needs_you' || env.running;
  const slash = useCallback((cmd: string) => {
    switch (cmd) {
      case '/new': controller.newTask(); break; case '/compact': controller.compact(); toast.push({ text: 'Tidying up the context' }); break;
      case '/stop': controller.stop(); break; case '/pantry': setTab('pantry'); break; case '/model': controller.openSettings?.('models'); break;
      case '/context': (document.querySelector('[aria-label^="Context "]') as HTMLButtonElement | null)?.click(); break;
    }
  }, [controller, toast]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((p) => !p); }
      else if (mod && e.key === '.') { e.preventDefault(); controller.stop(); }
      else if (mod && e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); s.status === 'paused' ? controller.resume() : controller.pause(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [controller, s.status]);
  useEffect(() => controller.onEvent((e) => { void fly?.handleEvent(e.type === 'result' ? { ...e, type: 'fly_hint', mood: 'idle' } as never : e); }), [controller, fly]);
  const items: PaletteItem[] = useMemo(() => [
    { id: 'new', label: 'New task', hint: '/new', icon: <Wand2 />, run: controller.newTask },
    { id: 'compact', label: 'Compact context', hint: '/compact', icon: <Layers />, run: controller.compact },
    { id: 'pantry', label: 'Open Pantry', hint: '/pantry', icon: <BookOpen />, run: () => setTab('pantry') },
    { id: 'task', label: 'Back to task', icon: <ListChecks />, run: () => setTab('task') },
    { id: 'stop', label: 'Stop', hint: '⌘.', icon: <Hand />, run: controller.stop },
    { id: 'pause', label: s.status === 'paused' ? 'Resume' : 'Pause', hint: '⌘⇧P', icon: s.status === 'paused' ? <Play /> : <Pause />, run: s.status === 'paused' ? controller.resume : controller.pause },
    { id: 'models', label: 'Models and gateway', hint: '/model', icon: <Cpu />, run: () => controller.openSettings?.('models') },
    { id: 'privacy', label: 'Privacy center', icon: <Shield />, run: () => controller.openSettings?.('privacy') },
    { id: 'settings', label: 'Settings', icon: <Settings />, run: () => controller.openSettings?.('general') },
  ], [controller, s.status]);
  return (
    <div className="ff-panel ff-root">
      <Header controller={controller} onPalette={() => setPalette(true)} />
      <div style={{ padding: '0 14px 6px' }}><Tabs<'task' | 'pantry'> label="Panel" value={tab} onChange={setTab} tabs={[{ value: 'task', label: 'Task', icon: <Sparkles /> }, { value: 'pantry', label: 'Pantry', icon: <BookOpen /> }]} /></div>
      <div className="ff-scroll" aria-live="off" ref={scroller}>
        <AnimatePresence mode="wait" initial={false}><motion.div key={tab} initial={{ opacity: 0, x: tab === 'pantry' ? 12 : -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.base, ease: ease.standard }}>{tab === 'task' ? <TaskView controller={controller} extra={taskExtra} /> : <PantryView controller={controller} />}</motion.div></AnimatePresence>
      </div>
      <div ref={perch} aria-hidden style={{ position: 'absolute', right: 40, bottom: 112, width: 2, height: 2 }} />
      <div className="ff-footer">
        <CommandBar busy={busy} onStop={controller.stop} onSubmit={(g) => { setTab('task'); controller.start(g); }} onSlash={slash} suggestions={s.goal ? undefined : controller.suggestions()} onAttach={() => setTab('pantry')}
          disabled={s.status === 'needs_you'} hint={s.status === 'needs_you' ? 'Waiting for your OK above' : undefined}
          placeholder={s.status === 'done' ? 'Ask a follow-up, or start fresh' : 'What should I do?'} />
        {env.mode === 'live' && <div className="ff-row" style={{ marginTop: 8 }}><GatewayStatus state={env.gateway} onClick={() => controller.openSettings?.('models')} /></div>}
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} items={items} />
    </div>
  );
}

export function SidePanel(p: SidePanelProps) { return <ToastProvider><PanelInner {...p} /></ToastProvider>; }
export { spring };
