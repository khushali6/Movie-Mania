import { Reorder, motion } from 'motion/react';
import { Check, GripVertical, Lock, Plug, Radio, RefreshCw, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { dur, ease } from '../motion';
import { useFlyAnchor } from '../fly';
import { Badge, Button, Callout, CheckRow, Input, Segmented, Toggle } from './primitives';

export type Health = 'healthy' | 'cooling' | 'limited' | 'down' | 'auth';
export interface RouteView { id: string; label: string; kind: 'local' | 'remote'; allowsPersonal: boolean; health: Health; p50ms: number; lastError?: string; budgetLeft?: number; nextProbeAt?: number }
export type ProfileName = 'fast' | 'smart' | 'vision' | 'embed' | 'local';

export const HEALTH_COPY: Record<Health, { label: string; body: string; fix?: string }> = {
  healthy: { label: 'Healthy', body: 'Answering normally.' },
  cooling: { label: 'Cooling', body: 'It had a few hiccups. I will try it again shortly.', fix: 'Try now' },
  limited: { label: 'Rate limited', body: 'Catching its breath. I use the next route meanwhile.', fix: 'Switch route' },
  down: { label: 'Down', body: "I can't reach it.", fix: 'Check connection' },
  auth: { label: 'Key invalid', body: "That key didn't work.", fix: 'Reconnect' },
};

export type GatewayState = 'connected' | 'asleep' | 'auth' | 'none';
export function GatewayStatus({ state, onClick }: { state: GatewayState; onClick?: () => void }) {
  const ref = useFlyAnchor<HTMLButtonElement>('gateway-status', { side: 'left', gap: 8 });
  const map = { connected: ['healthy', 'Gateway connected'], asleep: ['down', 'Gateway asleep'], auth: ['auth', 'Reconnect gateway'], none: ['cooling', 'No gateway'] } as const;
  const [h, label] = map[state];
  return <button ref={ref} type="button" className="ff-gw-status" onClick={onClick} aria-label={label}><i className="ff-health" data-h={h} />{label}</button>;
}

export function RouteRow({ r, onToggle, position }: { r: RouteView; onToggle: (allow: boolean) => void; position: number }) {
  const copy = HEALTH_COPY[r.health];
  return (
    <div className="ff-route-row">
      <span className="ff-grip" aria-hidden><GripVertical /></span>
      <i className="ff-health" data-h={r.health} aria-label={copy.label} role="img" />
      <div style={{ minWidth: 0 }}>
        <div className="ff-row" style={{ gap: 6 }}><b style={{ fontWeight: 500, fontSize: 13.5 }}>{position}. {r.label}</b>{r.kind === 'local' && <Badge tone="plum" icon={<Lock aria-hidden />}>On this device</Badge>}</div>
        <div className="ff-hint tnum">{copy.label}{r.p50ms ? ` · ${r.p50ms} ms` : ''}{r.budgetLeft !== undefined ? ` · ${Math.round(r.budgetLeft * 100)}% nectar` : ''}{r.lastError && r.health !== 'healthy' ? ` · ${r.lastError}` : ''}</div>
      </div>
      {r.kind === 'remote' ? <label className="ff-row ff-hint" style={{ gap: 6 }}>Personal info<Toggle label={`Allow personal info on ${r.label}`} checked={r.allowsPersonal} onChange={onToggle} /></label> : <Badge tone="lime">Private</Badge>}
      <span />
    </div>
  );
}

export function ModelRoutePicker({ profiles, onReorder, onTogglePersonal }: { profiles: Record<ProfileName, RouteView[]>; onReorder: (p: ProfileName, ids: string[]) => void; onTogglePersonal: (routeId: string, allow: boolean) => void }) {
  const [p, setP] = useState<ProfileName>('smart');
  const items = profiles[p] ?? [];
  const usage: Record<ProfileName, string> = { fast: 'Summaries, intent checks and helpers.', smart: 'Planning, hard reasoning and the final check.', vision: 'Screenshot fallback.', embed: 'Search queries (documents are indexed on this device).', local: 'Anything marked local-only.' };
  return (
    <div className="ff-stack" style={{ gap: 10 }}>
      <Segmented<ProfileName> label="Route profile" value={p} onChange={setP} options={(['fast', 'smart', 'vision', 'embed', 'local'] as ProfileName[]).map((x) => ({ value: x, label: x[0]!.toUpperCase() + x.slice(1) }))} />
      <div className="ff-hint">{usage[p]} Drag to reorder: I try routes from the top.</div>
      {items.length === 0 ? <Callout tone="info">Nothing here yet. {p === 'vision' ? 'Add a vision-capable key to use screenshots.' : 'Connect a gateway or add a key.'}</Callout> : (
        <Reorder.Group axis="y" values={items.map((i) => i.id)} onReorder={(ids) => onReorder(p, ids)} style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
          {items.map((r, i) => <Reorder.Item key={r.id} value={r.id} style={{ listStyle: 'none' }} whileDrag={{ scale: 1.015, boxShadow: 'var(--shadow-3)' }}><RouteRow r={r} position={i + 1} onToggle={(a) => onTogglePersonal(r.id, a)} /></Reorder.Item>)}
        </Reorder.Group>)}
    </div>
  );
}

/* ───────── Connect Gateway wizard ───────── */
export interface WizardApi { detect(url: string): Promise<{ reachable: boolean; authRequired: boolean }>; test(url: string, key: string): Promise<{ chat: boolean; tools: boolean; stream: boolean; error?: string }>; save(o: { url: string; key: string; template: string }): Promise<void> }
export function ConnectGatewayWizard({ api, onDone, defaultUrl = 'http://localhost:3001/v1', docsUrl = 'https://github.com/tashfeenahmed/freellmapi' }: { api: WizardApi; onDone: () => void; defaultUrl?: string; docsUrl?: string }) {
  const [step, setStep] = useState(1); const [url, setUrl] = useState(defaultUrl); const [key, setKey] = useState('');
  const [det, setDet] = useState<'idle' | 'scanning' | 'found' | 'missing'>('idle');
  const [checks, setChecks] = useState<{ chat: 'idle' | 'ok' | 'fail'; tools: 'idle' | 'ok' | 'fail'; stream: 'idle' | 'ok' | 'fail' }>({ chat: 'idle', tools: 'idle', stream: 'idle' });
  const [tpl, setTpl] = useState('balanced'); const [err, setErr] = useState('');
  const scan = async () => { setDet('scanning'); const r = await api.detect(url).catch(() => ({ reachable: false, authRequired: false })); setDet(r.reachable ? 'found' : 'missing'); };
  const test = async () => {
    setErr(''); setChecks({ chat: 'idle', tools: 'idle', stream: 'idle' });
    const r = await api.test(url, key).catch((e: unknown) => ({ chat: false, tools: false, stream: false, error: e instanceof Error ? e.message : 'Failed' }));
    const seq: ('chat' | 'tools' | 'stream')[] = ['chat', 'tools', 'stream'];
    for (const k of seq) { await new Promise((res) => setTimeout(res, 260)); setChecks((c) => ({ ...c, [k]: r[k] ? 'ok' : 'fail' })); }
    if (r.error) setErr(r.error);
  };
  const allOk = checks.chat === 'ok';
  return (
    <div className="ff-stack" style={{ gap: 14 }}>
      <div className="ff-row" aria-label={`Step ${step} of 4`}>{[1, 2, 3, 4].map((n) => <motion.i key={n} style={{ height: 4, flex: 1, borderRadius: 4, background: n <= step ? 'var(--ff-honey)' : 'var(--border)' }} layout />)}</div>
      {step === 1 && <>
        <div><b>1. Find your gateway</b><div className="ff-hint">FruitFly talks to a free-model gateway running on your computer. Nothing is sent anywhere else.</div></div>
        <Input aria-label="Gateway address" value={url} onChange={(e) => { setUrl(e.target.value); setDet('idle'); }} />
        {det === 'scanning' && <div className="ff-row ff-hint"><Radio className="ff-spin" style={{ animation: 'none' }} size={14} aria-hidden /> Looking…</div>}
        {det === 'found' && <Callout tone="info" title="Found it."><span>Your gateway answered.</span></Callout>}
        {det === 'missing' && <Callout tone="warn" title="I can't reach your gateway.">It isn't running at that address. <a href={docsUrl} target="_blank" rel="noreferrer noopener">Install options (Docker, desktop app or script)</a> are in its docs. Start it, then look again.</Callout>}
        <div className="ff-row"><Button onClick={scan} loading={det === 'scanning'} icon={<RefreshCw />}>Look for it</Button><span className="ff-spacer" /><Button variant="primary" disabled={det !== 'found'} onClick={() => setStep(2)} arrow>Next</Button></div></>}
      {step === 2 && <>
        <div><b>2. Paste your unified key</b><div className="ff-hint">From the gateway dashboard, Keys page. It stays on this computer and is never shown to pages.</div></div>
        <Input type="password" autoComplete="off" aria-label="Unified key" placeholder="freellmapi-…" value={key} onChange={(e) => setKey(e.target.value)} />
        <div className="ff-row"><Button variant="ghost" onClick={() => setStep(1)}>Back</Button><span className="ff-spacer" /><Button variant="primary" disabled={key.length < 6} onClick={() => { setStep(3); void test(); }} arrow>Test it</Button></div></>}
      {step === 3 && <>
        <div><b>3. Three tiny checks</b></div>
        <div><CheckRow state={checks.chat}>Answers a question</CheckRow><CheckRow state={checks.tools}>Can use tools</CheckRow><CheckRow state={checks.stream}>Streams words as they come</CheckRow></div>
        {err && <Callout tone="danger" title={/key|auth/i.test(err) ? "That key didn't work." : 'Something went wrong.'}>{err}</Callout>}
        {allOk && checks.tools === 'fail' && <Callout tone="info">No tool calling here, so I'll use a plain-text action format. It works, just a little slower.</Callout>}
        <div className="ff-row"><Button variant="ghost" onClick={() => setStep(2)}>Back</Button><Button onClick={() => void test()} icon={<RefreshCw />}>Run again</Button><span className="ff-spacer" /><Button variant="primary" disabled={!allOk} onClick={() => setStep(4)} arrow>Next</Button></div></>}
      {step === 4 && <>
        <div><b>4. How should I use it?</b></div>
        <Segmented label="Route template" value={tpl} onChange={setTpl} options={[{ value: 'balanced', label: 'Balanced' }, { value: 'fast', label: 'Fast' }, { value: 'max-quality', label: 'Max quality' }, { value: 'private-only', label: 'Private only' }]} />
        <div className="ff-hint">{({ balanced: 'Fast routes for helpers, smart routes for planning. Falls back to your device.', fast: 'Quickest answers first.', 'max-quality': 'Smartest models first, even when slower.', 'private-only': 'Only models on this device. Nothing leaves.' } as Record<string, string>)[tpl]}</div>
        <div className="ff-row"><Button variant="ghost" onClick={() => setStep(3)}>Back</Button><span className="ff-spacer" /><Button variant="primary" icon={<Plug />} onClick={async () => { await api.save({ url, key, template: tpl }); onDone(); }}>Connect</Button></div></>}
    </div>
  );
}
export { Check, X, dur, ease };
export type { ReactNode };
