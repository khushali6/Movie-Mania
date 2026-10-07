import { AnimatePresence, motion } from 'motion/react';
import { Check, FileText, KeyRound, Lock, LockOpen, Search, Trash2, UploadCloud, X } from 'lucide-react';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import type { Sensitivity } from '@fruitfly/core';
import { dur, ease, spring } from '../motion';
import { useFly, useFlyAnchor } from '../fly';
import { usePrefersReducedMotion } from '../fly/hooks';
import { Badge, Button, Callout, Input, ProgressRing, Segmented, Textarea, Toggle, cx } from './primitives';

export interface DocView { id: string; title: string; mime: string; bytes: number; sensitivity: Sensitivity; status: 'queued' | 'parsing' | 'embedding' | 'ready' | 'error' | 'needs_ocr'; lastUsedAt?: number; chunkCount: number; progress?: number; error?: string }
export interface PassageView { id: string; doc: string; page?: number; text: string; sensitivity: Sensitivity; headingPath?: string[] }
export interface ProfileFieldView { key: string; label: string; value: string; sensitivity: Sensitivity; includeInDigest: boolean; group?: string }
export interface NoteView { id: string; text: string; status: 'proposed' | 'kept' }
export interface VaultFieldView { key: string; label: string; requiresApproval: boolean }

const ext = (mime: string, title: string): string => ({ 'application/pdf': 'PDF', 'text/markdown': 'MD', 'text/csv': 'CSV', 'text/html': 'HTML', 'text/plain': 'TXT', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOC' } as Record<string, string>)[mime] ?? (title.split('.').pop() ?? 'FILE').slice(0, 4).toUpperCase();
const size = (b: number): string => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const ago = (t?: number): string => { if (!t) return 'not used yet'; const s = (Date.now() - t) / 1000; return s < 90 ? 'used just now' : s < 5400 ? `used ${Math.round(s / 60)} min ago` : s < 129600 ? `used ${Math.round(s / 3600)} h ago` : `used ${Math.round(s / 86400)} d ago`; };
export const SENS_COPY: Record<Sensitivity, string> = { public: 'Fine to share with any model.', personal: 'Only goes to a model you allowed for personal info.', 'local-only': 'Never leaves this device. Needs a local model.' };

export function SensitivityPill({ value, onChange, compact }: { value: Sensitivity; onChange?: (s: Sensitivity) => void; compact?: boolean }) {
  if (!onChange) return <Badge tone={value === 'local-only' ? 'plum' : value === 'personal' ? 'honey' : undefined} icon={value === 'local-only' ? <Lock aria-hidden /> : undefined}>{value === 'local-only' ? 'Local only' : value === 'personal' ? 'Personal' : 'Public'}</Badge>;
  return <Segmented<Sensitivity> label="Sensitivity" value={value} onChange={onChange} options={[{ value: 'public', label: compact ? 'Pub' : 'Public' }, { value: 'personal', label: 'Personal' }, { value: 'local-only', label: compact ? 'Local' : 'Local-only' }]} />;
}

export function DocRow({ doc, onSensitivity, onRemove, localModel }: { doc: DocView; onSensitivity: (s: Sensitivity) => void; onRemove: () => void; localModel?: boolean }) {
  const busy = doc.status === 'queued' || doc.status === 'parsing' || doc.status === 'embedding';
  const reduced = usePrefersReducedMotion();
  return (
    <motion.div layout={!reduced} className="ff-doc" initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96 }} transition={spring.ui}>
      <div className="ff-doc-ico" aria-hidden>{busy ? <ProgressRing value={doc.progress ?? 0.1} size={24} stroke={3} label="Indexing" /> : ext(doc.mime, doc.title)}</div>
      <div style={{ minWidth: 0 }}>
        <div className="ff-doc-title" title={doc.title}>{doc.title}</div>
        <div className="ff-doc-meta">
          {doc.status === 'ready' && <Badge tone="lime" icon={<Check aria-hidden />}>Indexed</Badge>}
          {busy && <Badge tone="honey">{doc.status === 'embedding' ? 'Indexing' : 'Reading'}</Badge>}
          {doc.status === 'needs_ocr' && <Badge>Needs OCR</Badge>}
          {doc.status === 'error' && <Badge tone="danger">{doc.error ?? 'Could not read'}</Badge>}
          <span className="tnum">{size(doc.bytes)}</span><span>·</span><span>{ago(doc.lastUsedAt)}</span>
        </div>
        <div style={{ marginTop: 8 }}><SensitivityPill value={doc.sensitivity} onChange={onSensitivity} compact /></div>
        {doc.sensitivity === 'local-only' && <div className="ff-hint" style={{ marginTop: 6, display: 'flex', gap: 5, alignItems: 'center' }}><Lock size={12} aria-hidden />{localModel ? 'A local model can read this.' : 'Stays on this device. Set up a local model (Ollama) to use it.'}</div>}
      </div>
      <button type="button" className="ff-iconbtn" aria-label={`Remove ${doc.title}`} onClick={onRemove}><Trash2 /></button>
    </motion.div>
  );
}

export function PantryShelf({ docs, onSensitivity, onRemove, localModel, empty }: { docs: DocView[]; onSensitivity: (id: string, s: Sensitivity) => void; onRemove: (id: string) => void; localModel?: boolean; empty?: ReactNode }) {
  const ref = useFlyAnchor<HTMLDivElement>('pantry-shelf', { side: 'top-right', gap: 4 });
  return <div ref={ref} aria-label="Your documents"><AnimatePresence initial={false}>{docs.length === 0 ? empty : docs.map((d) => <DocRow key={d.id} doc={d} localModel={localModel} onSensitivity={(s) => onSensitivity(d.id, s)} onRemove={() => onRemove(d.id)} />)}</AnimatePresence></div>;
}

export function DropZone({ onFiles, onPaste }: { onFiles: (files: File[]) => void | Promise<void>; onPaste?: () => void }) {
  const [over, setOver] = useState(false); const fly = useFly(); const input = useRef<HTMLInputElement>(null);
  const enter = () => { setOver(true); fly?.setMood('curious'); fly?.lookAtAnchor('pantry-shelf'); };
  const leave = () => { setOver(false); fly?.lookAtAnchor(null); fly?.setMood('idle'); };
  const drop = useCallback(async (files: File[]) => {
    setOver(false); if (!files.length) return;
    // the fly picks the file up and carries it to the shelf
    if (fly) { fly.engine.carry('document'); void fly.flyToAnchor('pantry-shelf', { mood: 'acting', style: 'carry', perch: false }).then(() => new Promise<void>((res) => { const r = document.querySelector('[aria-label="Your documents"]')?.getBoundingClientRect(); if (r) fly.engine.dropProp({ x: r.left + r.width / 2, y: r.top + 28 }, res); else { fly.engine.clearProp(); res(); } })).then(() => { fly.setMood('success'); fly.perchAt('perch-default'); }); }
    await onFiles(files);
  }, [fly, onFiles]);
  return (
    <div className="ff-drop" data-over={over} data-idle={!over} onDragEnter={(e) => { e.preventDefault(); enter(); }} onDragOver={(e) => e.preventDefault()} onDragLeave={leave} onDrop={(e) => { e.preventDefault(); void drop([...e.dataTransfer.files]); }}>
      <UploadCloud size={22} strokeWidth={1.5} aria-hidden style={{ margin: '0 auto 6px', display: 'block' }} />
      <div><b style={{ color: 'var(--ink)' }}>Drop files here</b>, or <button type="button" className="ff-btn ff-btn--ghost ff-btn--sm" style={{ display: 'inline-flex', height: 24, padding: '0 6px', color: 'var(--ink)', textDecoration: 'underline' }} onClick={() => input.current?.click()}>browse</button></div>
      <div className="ff-hint" style={{ marginTop: 4 }}>PDF, Word, Markdown, text, CSV, saved pages. Indexed on this device.</div>
      {onPaste && <Button size="sm" variant="ghost" style={{ marginTop: 8 }} onClick={onPaste}>Paste text instead</Button>}
      <input ref={input} type="file" hidden multiple accept=".pdf,.docx,.md,.markdown,.txt,.csv,.html,.htm" onChange={(e) => { void drop([...(e.target.files ?? [])]); e.target.value = ''; }} aria-label="Choose files to add to Pantry" />
    </div>
  );
}

export function PantrySearch({ onSearch, results, query }: { onSearch: (q: string) => void; results: PassageView[]; query: string }) {
  const [q, setQ] = useState(query);
  const hl = (t: string) => { const terms = q.toLowerCase().split(/\s+/).filter((x) => x.length > 2); if (!terms.length) return t; const re = new RegExp(`(${terms.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig'); return t.split(re).map((p, i) => (i % 2 ? <mark key={i}>{p}</mark> : p)); };
  return (
    <div className="ff-stack" style={{ gap: 8 }}>
      <div style={{ position: 'relative' }}><Search size={15} strokeWidth={1.5} style={{ position: 'absolute', left: 11, top: 12, color: 'var(--muted)' }} aria-hidden /><Input style={{ paddingLeft: 32 }} placeholder="Search your Pantry" aria-label="Search your Pantry" value={q} onChange={(e) => { setQ(e.target.value); onSearch(e.target.value); }} /></div>
      {q.trim() && results.length === 0 && <div className="ff-hint">Nothing in your documents matches that.</div>}
      {results.map((p) => <div className="ff-passage" key={p.id}><div className="ff-row" style={{ marginBottom: 4 }}><FileText size={13} aria-hidden /><b style={{ fontWeight: 600, fontSize: 12 }}>{p.doc}{p.page ? ` · p.${p.page}` : ''}</b><span className="ff-spacer" /><SensitivityPill value={p.sensitivity} /></div>{hl(p.text.length > 300 ? `${p.text.slice(0, 298)}…` : p.text)}</div>)}
    </div>
  );
}

/* ───────── About you ───────── */
export function ProfileForm({ fields, onChange, digestTokens, standing }: { fields: ProfileFieldView[]; onChange: (key: string, patch: Partial<ProfileFieldView>) => void; digestTokens: number; standing: { lines: number; tokens: number; overLimit: boolean } }) {
  const groups = [...new Set(fields.filter((f) => f.key !== 'standing_instructions').map((f) => f.group ?? 'Other'))];
  const st = fields.find((f) => f.key === 'standing_instructions');
  return (
    <div className="ff-stack" style={{ gap: 10 }}>
      <div className="ff-callout ff-callout--info" role="status"><KeyRound aria-hidden /><div><b>About you</b>Short, and it goes into every request: <span className="tnum"><b style={{ display: 'inline' }}>≈ {digestTokens} tokens</b> in every request</span>. Local-only fields never leave this device.</div></div>
      {groups.map((g) => (
        <div key={g} className="ff-card" style={{ padding: '4px 14px' }}>
          <div className="ff-kicker" style={{ padding: '10px 0 2px' }}>{g}</div>
          {fields.filter((f) => (f.group ?? 'Other') === g && f.key !== 'standing_instructions').map((f) => (
            <div className="ff-pfield" key={f.key}>
              <div className="ff-pfield-head"><label className="ff-label" htmlFor={`pf-${f.key}`} style={{ flex: 1 }}>{f.label}</label><SensitivityPill value={f.sensitivity} onChange={(s) => onChange(f.key, { sensitivity: s })} compact /></div>
              <Input id={`pf-${f.key}`} value={f.value} onChange={(e) => onChange(f.key, { value: e.target.value })} placeholder={f.label} />
              <label className="ff-row ff-hint" style={{ gap: 8 }}><Toggle label={`Include ${f.label} in every request`} checked={f.includeInDigest} onChange={(v) => onChange(f.key, { includeInDigest: v })} />Include in every request</label>
            </div>))}
        </div>))}
      {st && <div className="ff-card"><div className="ff-row"><label className="ff-label" htmlFor="pf-standing" style={{ flex: 1 }}>Standing instructions</label><span className={cx('ff-hint tnum', standing.overLimit && 'ff-error-text')} aria-live="polite">{standing.lines}/200 lines · ≈{standing.tokens}/2000 tokens</span></div><Textarea id="pf-standing" rows={4} value={st.value} onChange={(e) => onChange('standing_instructions', { value: e.target.value })} placeholder={'One rule per line, e.g.\nPrefer free delivery.\nAsk before spending over ₹10,000.'} style={{ marginTop: 6 }} /></div>}
    </div>
  );
}

export function NotesList({ notes, onKeep, onDelete, onEdit }: { notes: NoteView[]; onKeep: (id: string) => void; onDelete: (id: string) => void; onEdit: (id: string, text: string) => void }) {
  return (
    <div className="ff-stack" style={{ gap: 8 }} aria-label="Notes the fly keeps">
      <AnimatePresence initial={false}>{notes.map((n) => (
        <motion.div key={n.id} layout className="ff-card" style={{ padding: '10px 12px' }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: dur.base, ease: ease.standard }}>
          {n.status === 'proposed' && <div className="ff-kicker" style={{ marginBottom: 4 }}>I'd like to remember</div>}
          <input className="ff-input" style={{ border: 0, boxShadow: 'none', padding: '2px 0', background: 'transparent' }} aria-label="Note" value={n.text} onChange={(e) => onEdit(n.id, e.target.value)} />
          <div className="ff-row" style={{ marginTop: 6 }}>{n.status === 'proposed' ? <><Button size="sm" variant="primary" onClick={() => onKeep(n.id)}>Keep</Button><Button size="sm" variant="ghost" onClick={() => onDelete(n.id)}>Not now</Button></> : <Button size="sm" variant="ghost" onClick={() => onDelete(n.id)} icon={<Trash2 />}>Delete</Button>}</div>
        </motion.div>))}</AnimatePresence>
      {notes.length === 0 && <div className="ff-hint">Nothing kept yet. When I learn something worth remembering, I'll ask first.</div>}
    </div>
  );
}

/* ───────── Vault ───────── */
function Padlock({ open }: { open: boolean }) {
  const reduced = usePrefersReducedMotion();
  return (
    <svg className="ff-vault-ico" viewBox="0 0 52 52" aria-hidden>
      <motion.path d="M17 24v-7a9 9 0 0 1 18 0v7" fill="none" stroke="var(--muted)" strokeWidth="3.4" strokeLinecap="round" animate={reduced ? {} : { y: open ? -6 : 0, rotate: open ? -18 : 0 }} style={{ transformOrigin: '17px 24px' }} transition={spring.settle} />
      <rect x="10" y="23" width="32" height="22" rx="6" fill="var(--ff-honey)" stroke="color-mix(in srgb, var(--ff-honey) 60%, black)" strokeWidth="1.2" />
      <motion.circle cx="26" cy="33" r="3" fill="var(--accent-ink)" animate={{ scale: open ? 0.8 : 1 }} /><rect x="24.8" y="34" width="2.4" height="6" rx="1.2" fill="var(--accent-ink)" />
    </svg>
  );
}
export function VaultPanel({ state, fields, onSetup, onUnlock, onLock, onAdd, onRemove }: { state: 'unset' | 'locked' | 'unlocked'; fields: VaultFieldView[]; onSetup: (pass: string) => Promise<void> | void; onUnlock: (pass: string) => Promise<void> | void; onLock: () => void; onAdd: (key: string, label: string, value: string) => Promise<void> | void; onRemove: (key: string) => void }) {
  const [pass, setPass] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [nk, setNk] = useState(''); const [nv, setNv] = useState('');
  const go = async (fn: (p: string) => Promise<void> | void) => { setBusy(true); setErr(''); try { await fn(pass); setPass(''); } catch (e) { setErr(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(false); } };
  return (
    <div className="ff-card ff-vault">
      <Padlock open={state === 'unlocked'} />
      <h3 style={{ margin: '0 0 4px', font: '600 15px var(--font-ui)' }}>{state === 'unset' ? 'Set up your vault' : state === 'locked' ? 'Vault locked' : 'Vault open'}</h3>
      <p className="ff-muted" style={{ margin: '0 auto 12px', fontSize: 12.5, maxWidth: 300 }}>For passport, card and ID numbers. The model never sees them: I fill them in at the last second, after you approve. Encryption protects a copied profile folder, not malware running as you.</p>
      {state !== 'unlocked' && <form className="ff-stack" style={{ gap: 8, textAlign: 'left' }} onSubmit={(e) => { e.preventDefault(); void go(state === 'unset' ? onSetup : onUnlock); }}>
        <Input type="password" autoComplete="off" placeholder={state === 'unset' ? 'Choose a passphrase (8+ characters)' : 'Passphrase'} aria-label="Vault passphrase" value={pass} onChange={(e) => setPass(e.target.value)} />
        {err && <span className="ff-error-text" role="alert">{err}</span>}
        <Button variant="primary" type="submit" loading={busy} disabled={pass.length < (state === 'unset' ? 8 : 1)} icon={state === 'unset' ? <KeyRound /> : <LockOpen />}>{state === 'unset' ? 'Create vault' : 'Unlock'}</Button>
      </form>}
      {state === 'unlocked' && <div className="ff-stack" style={{ textAlign: 'left', gap: 8 }}>
        {fields.map((f) => <div className="ff-row ff-card" style={{ padding: '8px 12px' }} key={f.key}><Lock size={14} aria-hidden /><span style={{ flex: 1 }}>{f.label}</span><Badge>{f.requiresApproval ? 'Asks each time' : 'Auto'}</Badge><button className="ff-iconbtn" aria-label={`Remove ${f.label}`} onClick={() => onRemove(f.key)}><X /></button></div>)}
        <form className="ff-row" onSubmit={(e) => { e.preventDefault(); if (nk && nv) { void Promise.resolve(onAdd(nk.toLowerCase().replace(/[^a-z0-9]+/g, '_'), nk, nv)).then(() => { setNk(''); setNv(''); }); } }}>
          <Input placeholder="Label (Passport)" aria-label="Field label" value={nk} onChange={(e) => setNk(e.target.value)} /><Input type="password" autoComplete="off" placeholder="Value" aria-label="Field value" value={nv} onChange={(e) => setNv(e.target.value)} /><Button type="submit" disabled={!nk || !nv}>Add</Button>
        </form>
        <Button variant="ghost" onClick={onLock} icon={<Lock />}>Lock now</Button>
      </div>}
    </div>
  );
}

export function StorageMeter({ bytes, quota, nearlyFull, onManage }: { bytes: number; quota?: number; nearlyFull: boolean; onManage?: () => void }) {
  return nearlyFull ? <Callout tone="warn" title="Pantry is nearly full." action={onManage && <Button size="sm" onClick={onManage}>Manage storage</Button>}>{size(bytes)}{quota ? ` of ${size(quota)}` : ''} used on this device.</Callout> : <div className="ff-hint tnum">{size(bytes)} used on this device{quota ? ` · ${size(quota)} available` : ''}</div>;
}
