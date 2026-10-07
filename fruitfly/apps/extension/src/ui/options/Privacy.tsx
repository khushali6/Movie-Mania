import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, Globe, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Callout, Dialog, Field, Input, Segmented, Toggle } from '@fruitfly/ui';
import type { LedgerEntry, LedgerSummary } from '@fruitfly/egress';
import { IdbPantryStore, Pantry } from '@fruitfly/pantry';
import { loadSettings, type Settings } from '../../shared/settings';
import { IdbTaskStore } from '../../shared/stores';
import { Row, Section, download, fmtBytes, send, set } from './common';

const CAT: Record<string, string> = { 'model-remote': 'Remote model', 'model-local': 'Model on this device', 'embedding-download': 'Model download', 'gateway-probe': 'Gateway check', browsing: 'Pages I browse' };
const RANGES = { '1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000, all: 0 } as const;

export function Privacy({ s }: { s: Settings }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([]); const [range, setRange] = useState<keyof typeof RANGES>('24h');
  const [origins, setOrigins] = useState<string[]>([]); const [usage, setUsage] = useState({ docs: 0, bytes: 0, tasks: 0 });
  const [wipe, setWipe] = useState(false); const [confirm, setConfirm] = useState(''); const [backup, setBackup] = useState<null | 'export' | 'import'>(null); const [pass, setPass] = useState(''); const [msg, setMsg] = useState('');
  const refresh = useCallback(async () => {
    const l = await send<{ entries: LedgerEntry[] }>({ ff: 'ledger_get' }); setEntries(l?.entries ?? []);
    setOrigins(((await chrome.permissions.getAll()).origins ?? []).filter((o) => !o.startsWith('chrome')));
    const p = new Pantry({ store: await IdbPantryStore.open() }); const u = await p.usage(); setUsage({ docs: u.docs, bytes: u.bytes, tasks: (await new IdbTaskStore().list(500)).length });
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const since = RANGES[range] ? Date.now() - RANGES[range] : 0;
  const summary: LedgerSummary[] = useMemo(() => { const m = new Map<string, LedgerSummary>(); for (const e of entries) { if (e.t < since) continue; const k = `${e.category}|${e.host}`; const x = m.get(k) ?? { category: e.category, host: e.host, requests: 0, bytesOut: 0, bytesIn: 0, sensitivities: [] }; x.requests++; x.bytesOut += e.bytesOut; x.bytesIn += e.bytesIn; for (const z of e.sensitivities) if (!x.sensitivities.includes(z)) x.sensitivities.push(z); m.set(k, x); } return [...m.values()].sort((a, b) => b.bytesOut - a.bytesOut); }, [entries, since]);
  const last = [...entries].reverse().find((e) => e.category === 'model-remote' || e.category === 'model-local');

  const doBackup = async () => {
    const store = await IdbPantryStore.open(); const p = new Pantry({ store });
    if (backup === 'export') { const b = await p.exportBackup(pass); download(`fruitfly-backup-${new Date().toISOString().slice(0, 10)}.ffbackup`, b as unknown as BlobPart, 'application/octet-stream'); setMsg('Backup saved. Keep the passphrase: I cannot recover it.'); }
    setBackup(null); setPass('');
  };
  const importFile = async (f: File) => { try { const p = new Pantry({ store: await IdbPantryStore.open() }); await p.importBackup(new Uint8Array(await f.arrayBuffer()), pass); await send({ ff: 'pantry_changed' }); setMsg('Restored from backup.'); void refresh(); } catch (e) { setMsg(e instanceof Error ? e.message : 'That did not work.'); } setBackup(null); setPass(''); };

  return (
    <div className="ff-stack" style={{ gap: 16 }}>
      <Section title="What stays on this device" hint="Your documents, vectors, profile, notes, history, replays, keys and settings live on this computer. I have no servers and no accounts. The only traffic I make is to the model you chose, the pages I'm asked to browse, and a gateway check you run yourself.">
        <div className="ff-row" style={{ flexWrap: 'wrap' }}><Badge tone="lime" icon={<ShieldCheck aria-hidden />}>No telemetry</Badge><Badge>No accounts</Badge><Badge>No remote code</Badge><Badge tone="plum">Local-only never leaves</Badge></div>
        <Row label="Ask me before sending personal info" hint="Shows exactly what would be sent. On by default."><Toggle label="Ask before sending personal info" checked={s.askBeforePersonal} onChange={(v) => set((x) => ({ ...x, askBeforePersonal: v }))} /></Row>
      </Section>

      <Section title="Network ledger" hint="Every request I make, by where it went. Counts and sizes only: never what was in them.">
        <div className="ff-row"><Segmented label="Time range" value={range} onChange={setRange} options={[{ value: '1h', label: '1 hour' }, { value: '24h', label: '24 hours' }, { value: '7d', label: '7 days' }, { value: 'all', label: 'All' }]} /><span className="ff-spacer" /><Button size="sm" variant="ghost" onClick={() => void refresh()}>Refresh</Button></div>
        {summary.length === 0 ? <div className="ff-hint">Nothing has left this computer in that time.</div> : (
          <table className="ff-table" aria-label="Network ledger"><thead><tr><th scope="col">Where</th><th scope="col">Host</th><th scope="col">Requests</th><th scope="col">Sent</th><th scope="col">Received</th></tr></thead>
            <tbody>{summary.map((r) => <tr key={`${r.category}${r.host}`}><td style={{ textAlign: 'left' }}>{CAT[r.category] ?? r.category}</td><td style={{ textAlign: 'left', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.host}</td><td>{r.requests}</td><td>{fmtBytes(r.bytesOut)}</td><td>{fmtBytes(r.bytesIn)}</td></tr>)}</tbody></table>)}
      </Section>

      <Section title="What gets sent" hint="Page text and your question go to the model that answers. Personal items (your About you digest, Pantry passages) go only to routes you allowed for personal info, with card numbers, emails, phone numbers and IDs swapped for placeholders. Local-only items never go to a remote route; if no local model is available I say so.">
        {last ? <Callout tone="info" title="Your last request">{CAT[last.category]} · {last.host} · {fmtBytes(last.bytesOut)} sent. It carried: {last.segmentKinds.join(', ') || 'text'} ({last.sensitivities.join(', ') || 'public'}).</Callout> : <div className="ff-hint">No requests yet.</div>}
      </Section>

      <Section title="Sites I can use" hint="I only act on sites you allow, one at a time. Banks, government and health sites always ask first.">
        {origins.length === 0 ? <div className="ff-hint">No sites allowed yet.</div> : origins.map((o) => <Row key={o} label={o.replace(/^https?:\/\//, '').replace('/*', '')} hint={o.includes('localhost') || o.includes('127.0.0.1') ? 'Your own computer (gateway / Ollama)' : undefined}><Button size="sm" variant="ghost" icon={<Globe />} onClick={async () => { await chrome.permissions.remove({ origins: [o] }); void refresh(); }}>Revoke</Button></Row>)}
      </Section>

      <Section title="Your data" hint="Everything here is yours to take or delete.">
        <Row label="Pantry" hint={`${usage.docs} document${usage.docs === 1 ? '' : 's'} · ${fmtBytes(usage.bytes)}`}><span /></Row>
        <Row label="History and replays" hint={`${usage.tasks} task${usage.tasks === 1 ? '' : 's'}. No vault values, keys or raw Pantry text are stored in them.`}><Button size="sm" variant="ghost" onClick={async () => { await new IdbTaskStore().wipe(); void refresh(); }}>Clear history</Button></Row>
        <Row label="Backup" hint="One encrypted file with your documents, profile, notes and vault."><Button size="sm" icon={<Download />} onClick={() => setBackup('export')}>Export</Button><Button size="sm" icon={<Upload />} onClick={() => setBackup('import')}>Import</Button></Row>
        {msg && <Callout tone="info"><span role="status">{msg}</span></Callout>}
        <Row label="Delete everything" hint="Documents, profile, notes, vault, history, replays, keys, settings and site permissions."><Button variant="danger" size="sm" icon={<Trash2 />} onClick={() => setWipe(true)}>Delete everything…</Button></Row>
      </Section>

      <Dialog open={!!backup} onClose={() => setBackup(null)} title={backup === 'export' ? 'Export a backup' : 'Import a backup'} description="The file is encrypted with a passphrase you choose. I can't recover it for you.">
        <Field label="Passphrase">{(id) => <Input id={id} type="password" autoComplete="off" value={pass} onChange={(e) => setPass(e.target.value)} data-autofocus />}</Field>
        <div className="ff-actions" style={{ marginTop: 14 }}><Button onClick={() => setBackup(null)}>Cancel</Button>{backup === 'export' ? <Button variant="primary" disabled={pass.length < 8} onClick={() => void doBackup()}>Export</Button> : <label className="ff-btn ff-btn--primary" style={{ cursor: pass ? 'pointer' : 'not-allowed', opacity: pass ? 1 : 0.5 }}>Choose file<input type="file" hidden accept=".ffbackup,application/octet-stream" disabled={!pass} onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); }} /></label>}</div>
      </Dialog>
      <Dialog open={wipe} onClose={() => setWipe(false)} title="Delete everything?" description="This can't be undone. It removes your documents, profile, notes, vault, history, replays, keys, settings and site permissions from this computer.">
        <Field label="Type DELETE to confirm">{(id) => <Input id={id} value={confirm} onChange={(e) => setConfirm(e.target.value)} data-autofocus />}</Field>
        <div className="ff-actions" style={{ marginTop: 14 }}><Button onClick={() => setWipe(false)}>Cancel</Button><Button variant="danger-solid" disabled={confirm !== 'DELETE'} onClick={async () => { await send({ ff: 'wipe_all' }); setWipe(false); setConfirm(''); setMsg('Everything was deleted.'); void refresh(); void loadSettings(); }}>Delete everything</Button></div>
      </Dialog>
    </div>
  );
}
