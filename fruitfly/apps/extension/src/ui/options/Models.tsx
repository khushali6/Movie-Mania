import { useEffect, useMemo, useState } from 'react';
import { Cpu, KeyRound, Plug, Unplug } from 'lucide-react';
import { Badge, Button, Callout, ConnectGatewayWizard, Dialog, Field, GatewayStatus, Input, ModelRoutePicker, Segmented, Select, Toggle, type ProfileName, type RouteView } from '@fruitfly/ui';
import { loadKeys, setKey, type Settings } from '../../shared/settings';
import { profilesFrom } from '../../shared/routes';
import { makeGuard } from '../../shared/guard';
import { Row, Section, send, set } from './common';

const DOCS = 'https://github.com/tashfeenahmed/freellmapi';

export function Models({ s }: { s: Settings }) {
  const [wizard, setWizard] = useState(false); const [gw, setGw] = useState<'connected' | 'asleep' | 'auth' | 'none'>(s.gateway.enabled ? 'connected' : 'none');
  const [health, setHealth] = useState<Record<string, RouteView['health']>>({}); const [keys, setKeys] = useState<Awaited<ReturnType<typeof loadKeys>>>({});
  const [ollamaMsg, setOllamaMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { void loadKeys().then(setKeys); void send<{ routes: { id: string; health: { state: RouteView['health']; p50ms: number } }[] }>({ ff: 'diagnostics' }).then((d) => setHealth(Object.fromEntries((d?.routes ?? []).map((r) => [r.id, r.health.state])))).catch(() => undefined); }, [s]);
  useEffect(() => { if (s.gateway.enabled) void send<{ data?: { reachable: boolean; authRequired: boolean } }>({ ff: 'command', command: { cmd: 'ping_gateway' } }).then((r) => setGw(r?.data?.reachable ? 'connected' : 'asleep')).catch(() => setGw('asleep')); else setGw('none'); }, [s.gateway.enabled, s.gateway.url]);
  const profiles = useMemo(() => {
    const p = profilesFrom(s); const toView = (n: ProfileName): RouteView[] => p[n].chain.map((r) => ({ id: r.id, label: r.label, kind: r.kind, allowsPersonal: r.allowsPersonal, health: health[r.id] ?? 'healthy', p50ms: 0 }));
    return { fast: toView('fast'), smart: toView('smart'), vision: toView('vision'), embed: toView('embed'), local: toView('local') } as Record<ProfileName, RouteView[]>;
  }, [s, health]);
  const req = async (origins: string[]) => { try { return await chrome.permissions.request({ origins }); } catch { return false; } };
  const guard = useMemo(() => makeGuard({ settings: () => s }), [s]);

  const testOllama = async () => {
    if (!(await req(['http://localhost/*', 'http://127.0.0.1/*']))) { setOllamaMsg({ ok: false, text: 'I need permission to talk to localhost first.' }); return; }
    try { const r = await guard.fetch({ id: 'ollama', kind: 'local', allowsPersonal: true }, `${s.ollama.url.replace(/\/$/, '')}/api/tags`, {}, { category: 'gateway-probe' }); const j = (await r.json()) as { models?: { name: string }[] }; const names = (j.models ?? []).map((m) => m.name); setOllamaMsg({ ok: true, text: names.length ? `Found: ${names.slice(0, 5).join(', ')}` : 'Ollama is running, but has no models yet.' }); } catch { setOllamaMsg({ ok: false, text: "I can't reach Ollama at that address." }); }
  };

  const wiz = {
    detect: async (url: string) => { if (!(await req(['http://localhost/*', 'http://127.0.0.1/*']))) return { reachable: false, authRequired: false }; const r = await send<{ data?: { reachable: boolean; authRequired: boolean } }>({ ff: 'command', command: { cmd: 'ping_gateway', baseUrl: url } }); return r?.data ?? { reachable: false, authRequired: false }; },
    test: (url: string, key: string) => send<{ chat: boolean; tools: boolean; stream: boolean; error?: string }>({ ff: 'test_gateway', url, key }),
    save: async ({ url, key, template }: { url: string; key: string; template: string }) => { await setKey('gateway', key); set((x) => ({ ...x, mode: 'live', gateway: { enabled: true, url, template: template as Settings['gateway']['template'] } })); },
  };

  return (
    <div className="ff-stack" style={{ gap: 16 }}>
      <Section title="Free gateway" hint={<>FruitFly can use a local gateway that pools the free tiers of many providers behind one OpenAI-style address (<a href={DOCS} target="_blank" rel="noreferrer noopener">FreeLLMAPI</a>). Free tiers change without notice, some have terms about prompts being used to improve models, and the gateway is meant for personal use. That is why personal info is off for remote routes until you allow it.</>}>
        <Row label="Gateway" hint={s.gateway.enabled ? s.gateway.url : 'Not connected'}><GatewayStatus state={gw} />{s.gateway.enabled ? <Button size="sm" icon={<Unplug />} onClick={async () => { await setKey('gateway', undefined); set((x) => ({ ...x, gateway: { ...x.gateway, enabled: false } })); }}>Disconnect</Button> : <Button size="sm" variant="primary" icon={<Plug />} onClick={() => setWizard(true)}>Connect</Button>}</Row>
        {s.gateway.enabled && <Row label="Route template"><Segmented label="Route template" value={s.gateway.template} onChange={(v) => set((x) => ({ ...x, gateway: { ...x.gateway, template: v } }))} options={[{ value: 'balanced', label: 'Balanced' }, { value: 'fast', label: 'Fast' }, { value: 'max-quality', label: 'Max quality' }, { value: 'private-only', label: 'Private only' }]} /></Row>}
        {gw === 'asleep' && s.gateway.enabled && <Callout tone="warn" title="I can't reach your gateway.">It might not be running. Start it, or switch to demo mode or another route.</Callout>}
        {gw === 'auth' && <Callout tone="danger" title="That key didn't work." action={<Button size="sm" variant="primary" onClick={() => setWizard(true)}>Reconnect</Button>} />}
      </Section>
      <Dialog open={wizard} onClose={() => setWizard(false)} title="Connect your gateway" wide><ConnectGatewayWizard api={wiz} docsUrl={DOCS} onDone={() => setWizard(false)} /></Dialog>

      <Section title="On this device (Ollama)" hint="A model that runs on your computer. Nothing leaves it, so it's the only route for documents marked local-only.">
        <Row label="Use Ollama"><Toggle label="Use Ollama" checked={s.ollama.enabled} onChange={(v) => set((x) => ({ ...x, ollama: { ...x.ollama, enabled: v } }))} /></Row>
        {s.ollama.enabled && <div className="ff-stack"><Field label="Address">{(id) => <Input id={id} value={s.ollama.url} onChange={(e) => set((x) => ({ ...x, ollama: { ...x.ollama, url: e.target.value } }))} />}</Field>
          <div className="two" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Field label="Chat model">{(id) => <Input id={id} value={s.ollama.model} onChange={(e) => set((x) => ({ ...x, ollama: { ...x.ollama, model: e.target.value } }))} />}</Field><Field label="Embedding model" hint="For Smart search in your Pantry.">{(id) => <Input id={id} value={s.ollama.embedModel} onChange={(e) => set((x) => ({ ...x, ollama: { ...x.ollama, embedModel: e.target.value } }))} />}</Field></div>
          <div className="ff-row"><Button size="sm" icon={<Cpu />} onClick={() => void testOllama()}>Test connection</Button>{ollamaMsg && <span className={ollamaMsg.ok ? 'ff-hint' : 'ff-error-text'} role="status">{ollamaMsg.text}</span>}</div></div>}
      </Section>

      <Section title="Your own keys" hint="A paid key is the steadiest option. Keys are stored on this computer, never shown to pages, and never included in prompts or logs.">
        {(['anthropic', 'gemini'] as const).map((k) => (
          <div key={k} className="ff-stack" style={{ gap: 8 }}>
            <Row label={k === 'anthropic' ? 'Anthropic' : 'Google Gemini'} hint={keys[k] ? 'Key saved' : 'No key yet'}><Toggle label={`Use ${k}`} checked={s.byo[k].enabled && !!keys[k]} disabled={!keys[k]} onChange={(v) => set((x) => ({ ...x, mode: v ? 'live' : x.mode, byo: { ...x.byo, [k]: { ...x.byo[k], enabled: v } } }))} /></Row>
            <div className="ff-row"><Input type="password" autoComplete="off" aria-label={`${k} key`} placeholder={keys[k] ? '••••••••••••' : 'Paste key'} id={`key-${k}`} style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === 'Enter') (e.currentTarget.nextElementSibling as HTMLButtonElement | null)?.click(); }} />
              <Button size="sm" onClick={async () => { const el = document.getElementById(`key-${k}`) as HTMLInputElement; if (el.value.length > 8) { await setKey(k, el.value); el.value = ''; setKeys(await loadKeys()); } }}>Save</Button>
              {keys[k] && <Button size="sm" variant="ghost" icon={<KeyRound />} onClick={async () => { await setKey(k, undefined); set((x) => ({ ...x, byo: { ...x.byo, [k]: { ...x.byo[k], enabled: false } } })); setKeys(await loadKeys()); }}>Remove</Button>}</div>
            <Select label={`${k} model`} value={s.byo[k].model} onChange={(v) => set((x) => ({ ...x, byo: { ...x.byo, [k]: { ...x.byo[k], model: v } } }))} options={(k === 'anthropic' ? ['claude-haiku-4-5-20251001', 'claude-sonnet-5-5', 'claude-opus-5-5'] : ['gemini-2.5-flash', 'gemini-2.5-pro']).map((m) => ({ value: m, label: m }))} />
          </div>))}
      </Section>

      <Section title="Routes" hint="I try routes from the top. If one is rate limited or down, I move to the next in the middle of a task. Remote routes never get personal info unless you switch it on for that route.">
        <ModelRoutePicker profiles={profiles} onReorder={(p, ids) => set((x) => ({ ...x, routeOrder: { ...x.routeOrder, [p]: ids } }))} onTogglePersonal={(id, a) => set((x) => ({ ...x, allowPersonal: { ...x.allowPersonal, [id]: a } }))} />
        <div className="ff-row"><Badge tone="plum">Local-only material only ever uses on-device routes.</Badge></div>
      </Section>
    </div>
  );
}
