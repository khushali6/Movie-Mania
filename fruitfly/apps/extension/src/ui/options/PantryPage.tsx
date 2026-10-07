import { useEffect, useMemo, useState } from 'react';
import { Callout, Progress, Segmented, Toggle } from '@fruitfly/ui';
import { IdbPantryStore, Pantry } from '@fruitfly/pantry';
import type { Settings } from '../../shared/settings';
import { makeEmbedder, makeGuard } from '../../shared/guard';
import { Row, Section, fmtBytes, send, set } from './common';

export function PantryPage({ s }: { s: Settings }) {
  const [usage, setUsage] = useState<{ bytes: number; quota?: number; docs: number; chunks: number; nearlyFull: boolean } | null>(null);
  const [progress, setProgress] = useState<number | null>(null); const [err, setErr] = useState('');
  const guard = useMemo(() => makeGuard({ settings: () => s }), [s]);
  useEffect(() => { void (async () => { const p = new Pantry({ store: await IdbPantryStore.open() }); setUsage(await p.usage()); })(); }, [progress]);
  const choose = async (v: 'basic' | 'ollama') => {
    if (v === 'ollama' && !s.ollama.enabled) { setErr('Turn on Ollama under Models first.'); return; }
    setErr(''); set((x) => ({ ...x, pantry: { ...x.pantry, embedder: v } }));
    const next = { ...s, pantry: { ...s.pantry, embedder: v } };
    try { const p = new Pantry({ store: await IdbPantryStore.open(), embedder: makeEmbedder(s, guard) }); setProgress(0); await p.load(); await p.setEmbedder(makeEmbedder(next, guard), (d, t) => setProgress(t ? d / t : 1)); await send({ ff: 'pantry_changed' }); } catch (e) { setErr(e instanceof Error ? e.message : 'Could not re-index.'); }
    setProgress(null);
  };
  return (
    <div className="ff-stack" style={{ gap: 16 }}>
      <Section title="Pantry" hint="Things I keep for you: documents, a short profile, and notes. Indexed and searched on this device.">
        <Row label="Use Pantry"><Toggle label="Use Pantry" checked={s.pantry.enabled} onChange={(v) => set((x) => ({ ...x, pantry: { ...x.pantry, enabled: v } }))} /></Row>
        <Row label="Search quality" hint="Basic runs entirely on this device with nothing to download. Smart uses an embedding model in your local Ollama for deeper matching. Switching re-indexes in the background."><Segmented label="Search quality" value={s.pantry.embedder} onChange={(v) => void choose(v)} options={[{ value: 'basic', label: 'Basic' }, { value: 'ollama', label: 'Smart (Ollama)' }]} /></Row>
        {progress !== null && <div role="status" aria-live="polite"><div className="ff-hint" style={{ marginBottom: 6 }}>Re-indexing your documents…</div><Progress value={progress} label="Re-indexing" /></div>}
        {err && <Callout tone="warn">{err}</Callout>}
      </Section>
      <Section title="Storage">
        {usage ? <div className="ff-stack" style={{ gap: 6 }}><Row label="Documents">{usage.docs}</Row><Row label="Passages indexed">{usage.chunks}</Row><Row label="Used on this device">{fmtBytes(usage.bytes)}{usage.quota ? ` of ${fmtBytes(usage.quota)}` : ''}</Row></div> : <div className="ff-hint">Loading…</div>}
        {usage?.nearlyFull && <Callout tone="warn" title="Pantry is nearly full.">Remove documents you no longer need from the Pantry tab in the side panel.</Callout>}
        <div className="ff-hint">Add and manage documents from the Pantry tab in the side panel, or drop files onto it.</div>
      </Section>
    </div>
  );
}
