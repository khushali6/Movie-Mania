import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Check, ChevronDown, Clipboard, Download, FileText, Globe, Layers, Lock, Paperclip, RotateCcw, Save, ShieldAlert, Square, Wand2, X, AlertTriangle, Eye, BookmarkPlus, Hand } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Approval, CompactionReport, FlyMood, Source, TaskResult } from '@fruitfly/core';
import { dur, ease, spring } from '../motion';
import { useFly, useFlyAnchor } from '../fly';
import { ProceduralFly } from '../fly/ProceduralFly';
import { usePrefersReducedMotion } from '../fly/hooks';
import type { SessionState, SessionStatus, SubagentModel, TimelineStepModel } from '../session';
import { Badge, Button, IconButton, Kbd, Popover, ProgressRing, cx } from './primitives';

const fmtN = (n: number): string => (n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : n.toLocaleString('en-IN'));
export const fmtMs = (ms?: number): string => (ms === undefined ? '' : ms < 950 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`);

/* ───────── Status chip ───────── */
const STATUS_LABEL: Record<SessionStatus | 'ready', string> = { idle: 'Ready', ready: 'Ready', working: 'Working', paused: 'Paused', needs_you: 'Needs you', throttled: 'Catching breath', done: 'Done', failed: "Couldn't finish", stopped: 'Stopped' };
export function StatusChip({ status, throttleUntil }: { status: SessionStatus; throttleUntil?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (status !== 'throttled') return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [status]);
  const left = status === 'throttled' && throttleUntil ? Math.max(0, Math.ceil((throttleUntil - now) / 1000)) : 0;
  const label = status === 'throttled' ? (left > 0 ? `Catching breath · ${left}s` : 'Catching breath') : STATUS_LABEL[status];
  return (
    <span className="ff-status" data-s={status === 'idle' ? 'ready' : status} role="status" aria-live="polite">
      <i className="ff-status-dot" aria-hidden />{label}
    </span>
  );
}

/* ───────── Nectar meter ───────── */
export function NectarMeter({ fraction, usage, onOpen }: { fraction: number; usage?: { tokensUsed: number; tokensCap: number; stepsUsed: number; stepsCap: number; cacheRead?: number }; onOpen?: () => void }) {
  const ref = useFlyAnchor<HTMLButtonElement>('nectar-meter', { side: 'left', gap: 8 });
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <Popover label="Nectar" trigger={({ toggle, ref: r }) => (
      <button type="button" className="ff-nectar" aria-label={`Nectar: ${Math.round(f * 100)} percent left today`} ref={(el) => { ref(el); (r as React.MutableRefObject<HTMLButtonElement | null>).current = el; }} onClick={() => { toggle(); onOpen?.(); }}>
        <ProgressRing value={f} size={30} stroke={3} label="Nectar left" />
        <svg className="ff-nectar-drop" viewBox="0 0 12 14" aria-hidden><path d="M6 1c2.4 3 4 5 4 7.2A4 4 0 0 1 6 12.4 4 4 0 0 1 2 8.2C2 6 3.6 4 6 1Z" fill={f < 0.2 ? 'var(--danger)' : 'var(--ff-honey)'} /></svg>
      </button>)}>
      {() => (
        <div style={{ padding: 10, display: 'grid', gap: 8, minWidth: 230 }}>
          <div className="ff-kicker">Nectar today</div>
          <div style={{ font: '600 22px var(--font-ui)' }} className="tnum">{Math.round(f * 100)}% left</div>
          {usage && <dl className="ff-muted tnum" style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto auto', gap: '4px 12px', fontSize: 12.5 }}>
            <dt>This task</dt><dd style={{ margin: 0, textAlign: 'right' }}>{fmtN(usage.tokensUsed)} of {fmtN(usage.tokensCap)} tokens</dd>
            <dt>Steps</dt><dd style={{ margin: 0, textAlign: 'right' }}>{usage.stepsUsed} of {usage.stepsCap}</dd>
            {usage.cacheRead !== undefined && <><dt>Served from cache</dt><dd style={{ margin: 0, textAlign: 'right' }}>{fmtN(usage.cacheRead)}</dd></>}
          </dl>}
        </div>)}
    </Popover>
  );
}

/* ───────── Now card (the "page preview" the fly hovers beside) ───────── */
export function NowCard({ session }: { session: SessionState }) {
  const ref = useFlyAnchor<HTMLDivElement>('now-card', { side: 'right', gap: 10 });
  const active = [...session.steps].reverse().find((s) => s.state === 'active');
  const title = session.status === 'needs_you' ? 'Waiting for you' : session.status === 'throttled' ? 'Catching my breath' : active?.title ?? (session.thinking ? 'Thinking it through' : session.status === 'done' ? 'Finished' : session.status === 'stopped' ? 'Stopped' : session.status === 'failed' ? 'Stopped early' : 'Ready');
  const sub = session.status === 'needs_you' ? session.approval?.reason : session.thinkNote ?? (active ? (active.targetLabel ? `Target: ${active.targetLabel}` : undefined) : undefined) ?? (session.sources.at(-1)?.url ? new URL(session.sources.at(-1)!.url!).hostname : undefined);
  return (
    <div ref={ref} className="ff-now" aria-live="off">
      <span className="ff-marker" style={{ borderColor: session.status === 'working' ? 'var(--ff-honey)' : undefined }} aria-hidden />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="ff-now-title">{title}</div>
        {sub && <div className="ff-now-sub" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
      <span className="ff-kicker tnum">{session.usage.stepsUsed || session.steps.length} steps</span>
    </div>
  );
}

/* ───────── Timeline ───────── */
function StepMarker({ s }: { s: TimelineStepModel['state'] }) { return <span className="ff-marker">{s === 'done' ? <Check aria-hidden /> : s === 'failed' ? <X aria-hidden /> : null}</span>; }

function Step({ step, last, open, toggle }: { step: TimelineStepModel; last: boolean; open: boolean; toggle: () => void }) {
  const anchor = useFlyAnchor<HTMLLIElement>('timeline-active-step', { side: 'right', gap: 4 });
  const reduced = usePrefersReducedMotion();
  return (
    <motion.li ref={step.state === 'active' ? anchor : undefined} layout={reduced ? false : 'position'} className="ff-step" data-s={step.state} initial={reduced ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: dur.base, ease: ease.standard }}>
      <StepMarker s={step.state} />
      <button type="button" className="ff-step-btn" aria-expanded={open} onClick={toggle}>
        <div className="ff-step-title">{step.title}</div>
        {step.digest && step.state !== 'active' && <div className="ff-step-note">{step.digest}</div>}
        {step.unexpected && <div className="ff-step-note ff-step-note--warn">{step.unexpected}</div>}
        {step.truncated && <div className="ff-step-note">Showing part of a long page</div>}
      </button>
      <span className="ff-step-time tnum">{step.state === 'active' && !last ? '' : fmtMs(step.ms)}</span>
      <AnimatePresence initial={false}>{open && (
        <motion.dl className="ff-step-detail" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: dur.base, ease: ease.standard }}>
          <dt>tool</dt><dd>{step.tool}</dd>
          {step.args && Object.keys(step.args).length > 0 && <><dt>args</dt><dd>{JSON.stringify(step.args)}</dd></>}
          {step.tokens !== undefined && <><dt>observation</dt><dd>≈{fmtN(step.tokens)} tokens{step.handle ? ` · ${step.handle}` : ''}</dd></>}
          {step.ms !== undefined && <><dt>took</dt><dd>{fmtMs(step.ms)}</dd></>}
          {step.route && <><dt>route</dt><dd>{step.route}</dd></>}
        </motion.dl>)}</AnimatePresence>
    </motion.li>
  );
}

export function Timeline({ session }: { session: SessionState }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const announced = useRef(0); const [announce, setAnnounce] = useState('');
  useEffect(() => { const a = [...session.steps].reverse().find((s) => s.state === 'active'); if (a && a.index !== announced.current) { announced.current = a.index; setAnnounce(`Step ${a.index}: ${a.title}`); } }, [session.steps]);
  useEffect(() => { if (session.status === 'done') setAnnounce('Task completed'); else if (session.status === 'needs_you') setAnnounce('I need your approval'); }, [session.status]);
  const subs = session.subagents;
  return (
    <>
      <span className="ff-sr" aria-live="polite" role="status">{announce}</span>
      <ol className="ff-timeline" aria-label="What I'm doing">
        <AnimatePresence initial={false}>
          {session.steps.map((st, i) => (
            <div key={st.id} style={{ display: 'contents' }}>
              <Step step={st} last={i === session.steps.length - 1} open={openId === st.id} toggle={() => setOpenId(openId === st.id ? null : st.id)} />
              {st.tool === 'delegate' && st.state === 'active' && subs.length > 0 && <li style={{ listStyle: 'none' }}><SubagentLane subagents={subs} /></li>}
              {session.compactions.filter((c) => c.atStep === i + 1).map((c, k) => <li key={`c${k}`} style={{ listStyle: 'none' }}><CompactedChip report={c} /></li>)}
            </div>
          ))}
        </AnimatePresence>
        {session.thinking && session.steps.every((s) => s.state !== 'active') && (
          <li className="ff-step" data-s="active"><span className="ff-marker" /><div><div className="ff-step-title">Thinking</div>{session.thinkNote && <div className="ff-step-note">{session.thinkNote}</div>}</div><span /></li>)}
      </ol>
    </>
  );
}
export function CompactedChip({ report }: { report: CompactionReport }) {
  const n = report.stepsMasked + report.turnsSummarized;
  return <span className="ff-compacted"><Badge tone="plum" icon={<Layers aria-hidden />}>Compacted {n} step{n === 1 ? '' : 's'}</Badge><span className="ff-muted tnum" style={{ fontSize: 11.5 }}>{fmtN(report.tokensBefore)} → {fmtN(report.tokensAfter)}</span></span>;
}

/* ───────── Subagents as mini-flies ───────── */
function MiniFly({ s }: { s: SubagentModel }) {
  const fly = useFly(); const reduced = usePrefersReducedMotion(); const ref = useRef<HTMLSpanElement>(null);
  const [from, setFrom] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el || !fly || reduced) { setFrom({ x: 0, y: 0 }); return; }
    const p = fly.engine.position; const r = el.getBoundingClientRect(); const layer = el.closest('body')!.getBoundingClientRect();
    void layer; setFrom({ x: p.x - r.left - 10, y: p.y - r.top - 6 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const mood: FlyMood = s.phase === 'start' ? (s.kind === 'researcher' ? 'searching' : s.kind === 'doc' ? 'curious' : 'reading') : s.phase === 'done' ? 'success' : 'confused';
  const arc = from && !reduced ? { x: [from.x, from.x * 0.45, 0], y: [from.y, Math.min(from.y, 0) * 0.5 - 22, 0], scale: [0.4, 1.1, 1] } : { x: 0, y: 0, scale: 1 };
  return (
    <motion.span ref={ref} layout className="ff-minifly" initial={{ opacity: 0 }} animate={{ opacity: 1, ...arc }} transition={{ duration: reduced ? dur.instant : 0.62, ease: ease.emphasized }} title={s.summary}>
      {reduced ? <i className="ff-dotfly" style={{ background: s.phase === 'failed' ? 'var(--danger)' : s.phase === 'done' ? 'var(--ff-lime)' : 'var(--ff-honey)' }} /> : <ProceduralFly size={22} mood={mood} seed={s.id} followCursor={false} />}
      <span>{s.label}</span>
      {s.phase === 'done' && s.summary && <Badge tone="lime" icon={<Check aria-hidden />}>{s.summary.length > 38 ? `${s.summary.slice(0, 36)}…` : s.summary}</Badge>}
    </motion.span>
  );
}
export function SubagentLane({ subagents }: { subagents: SubagentModel[] }) {
  const ref = useFlyAnchor<HTMLDivElement>('subagent-lane', { side: 'bottom', gap: 4 });
  const shown = subagents.slice(0, 4); const extra = subagents.length - shown.length;
  return <div ref={ref} className="ff-lane" aria-label="Helpers">{shown.map((s) => <MiniFly key={s.id} s={s} />)}{extra > 0 && <Badge>+{extra}</Badge>}</div>;
}

/* ───────── Approval card ───────── */
export function ApprovalCard({ approval, onApprove, onCancel, onTakeover }: { approval: Approval; onApprove: () => void; onCancel: () => void; onTakeover?: () => void }) {
  const ref = useRef<HTMLDivElement>(null); const anchor = useFlyAnchor<HTMLDivElement>('approval-card', { side: 'top-right', gap: 36, dx: -40 });
  const [armed, setArmed] = useState(false); const [ready, setReady] = useState(false); const [review, setReview] = useState(false);
  const reduced = usePrefersReducedMotion();
  // a deliberate press: the button is inert for a beat after the card appears, and sensitive actions need a second click
  useEffect(() => { const t = setTimeout(() => setReady(true), 450); return () => clearTimeout(t); }, [approval.id]);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 4000); return () => clearTimeout(t); }, [armed]);
  useEffect(() => { ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus(); }, []);
  const trap = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); return; }
    if (e.key !== 'Tab' || !ref.current) return;
    const f = [...ref.current.querySelectorAll<HTMLElement>('button:not(:disabled)')]; if (!f.length) return;
    const first = f[0]!, last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  const sensitive = approval.level === 'sensitive';
  const press = () => { if (!ready) return; if (sensitive && !armed) { setArmed(true); return; } onApprove(); };
  return (
    <motion.div ref={(el) => { ref.current = el; anchor(el); }} className="ff-approval" role="alertdialog" aria-modal="false" aria-labelledby="ff-appr-t" aria-describedby="ff-appr-d" onKeyDown={trap}
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={reduced ? { duration: dur.instant } : spring.panel}>
      <div className="ff-row" style={{ marginBottom: 4 }}><ShieldAlert size={16} strokeWidth={1.75} color="var(--ff-ruby)" aria-hidden /><span className="ff-kicker">{sensitive ? 'Needs your OK' : 'Quick check'}</span><span className="ff-spacer" />{approval.site && <Badge icon={<Globe aria-hidden />}>{approval.site}</Badge>}</div>
      <h3 id="ff-appr-t">{approval.action}</h3>
      <p id="ff-appr-d">{approval.reason}</p>
      <AnimatePresence initial={false}>{review && approval.preview && approval.preview.length > 0 && (
        <motion.div className="ff-mask" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} aria-label="Masked preview">
          {approval.preview.map((p, i) => <div className="ff-mask-row" key={i}><b>{p.label}</b><span>{p.value}</span></div>)}
        </motion.div>)}</AnimatePresence>
      <div className="ff-actions">
        <Button variant="ghost" onClick={() => setReview((r) => !r)} aria-expanded={review} icon={<Eye />}>{review ? 'Hide' : 'Review'}</Button>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" data-autofocus onClick={press} disabled={!ready} aria-label={armed ? 'Confirm: approve this action' : 'Approve this action'}>{armed ? 'Press again to confirm' : 'Approve'}</Button>
      </div>
      {onTakeover && <button type="button" className="ff-btn ff-btn--ghost ff-btn--sm" style={{ marginTop: 8 }} onClick={onTakeover}><Hand aria-hidden /> I'll do this myself</button>}
    </motion.div>
  );
}

/* ───────── Source chip ───────── */
/** one chip per site / document, not per page */
export function dedupeSources(list: Source[]): Source[] { const seen = new Set<string>(); return list.filter((s) => { const k = s.kind === 'pantry' ? `p:${s.docId ?? s.title}:${s.page ?? ''}` : `w:${(() => { try { return new URL(s.url!).hostname; } catch { return s.title; } })()}`; if (seen.has(k)) return false; seen.add(k); return true; }); }

export function SourceChip({ source }: { source: Source }) {
  const label = source.kind === 'pantry' ? `${source.title}${source.page ? ` · p.${source.page}` : ''}` : (() => { try { return new URL(source.url!).hostname.replace(/^www\./, ''); } catch { return source.title; } })();
  const Icon = source.kind === 'pantry' ? FileText : Globe;
  const inner = <><Icon aria-hidden /><span>{label}</span></>;
  return source.url ? <a className="ff-source" data-kind={source.kind} href={source.url} target="_blank" rel="noreferrer noopener" title={source.title}>{inner}</a> : <span className="ff-source" data-kind={source.kind} title={source.title}>{inner}</span>;
}

/* ───────── Result card ───────── */
export const resultToMarkdown = (r: TaskResult): string => [`## ${r.title}`, '', r.summary, '', ...(r.table ? [`| ${r.table.columns.join(' | ')} |`, `| ${r.table.columns.map(() => '---').join(' | ')} |`, ...r.table.rows.map((x) => `| ${x.join(' | ')} |`), ''] : []), ...(r.bullets ?? []).map((b) => `- ${b}`), '', ...(r.sources.length ? ['Sources:', ...r.sources.map((s) => `- ${s.title}${s.url ? ` (${s.url})` : ''}`)] : [])].join('\n').trim();
export const resultToCsv = (r: TaskResult): string => { const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s); return r.table ? [r.table.columns, ...r.table.rows].map((x) => x.map(q).join(',')).join('\n') : ''; };

function download(name: string, text: string, mime: string): void { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

export function ResultCard({ result, revealed, onFresh, onSave, onReplay }: { result: TaskResult; revealed: boolean; onFresh?: () => void; onSave?: () => void; onReplay?: () => void }) {
  const anchor = useFlyAnchor<HTMLDivElement>('result-card', { side: 'top-right', gap: 4, dx: -40 });
  const reduced = usePrefersReducedMotion(); const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(resultToMarkdown(result)); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard unavailable */ } };
  return (
    <div ref={anchor} style={{ minHeight: revealed ? undefined : 96 }}>
      <AnimatePresence>
        {revealed && (
          <motion.section className="ff-result" data-s={result.status} aria-label="Result" initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 6 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={reduced ? { duration: dur.instant } : { duration: dur.slow, ease: ease.emphasized }}>
            {!reduced && <Sparkles2 />}
            <div className="ff-kicker">{result.status === 'success' ? 'Done' : result.status === 'partial' ? 'Partly done' : "Couldn't finish"}</div>
            <h3>{result.title}</h3>
            <p>{result.summary}</p>
            {result.table && <table className="ff-table"><caption className="ff-sr">{result.table.title ?? 'Comparison'}</caption><thead><tr>{result.table.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>{result.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody></table>}
            {result.bullets && result.bullets.length > 0 && <ul className="ff-bullets">{result.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
            {result.verification && <div className="ff-verify"><Check aria-hidden />{result.verification}</div>}
            {result.sources.length > 0 && <div className="ff-sources" aria-label="Sources">{dedupeSources(result.sources).slice(0, 8).map((s, i) => <SourceChip key={i} source={s} />)}</div>}
            <div className="ff-result-actions">
              <Button size="sm" variant="ghost" onClick={copy} icon={copied ? <Check /> : <Clipboard />} aria-live="polite">{copied ? 'Copied' : 'Copy'}</Button>
              {result.table && <Button size="sm" variant="ghost" icon={<Download />} onClick={() => download('fruitfly-result.csv', resultToCsv(result), 'text/csv')}>CSV</Button>}
              <Button size="sm" variant="ghost" icon={<FileText />} onClick={() => download('fruitfly-result.md', resultToMarkdown(result), 'text/markdown')}>Markdown</Button>
              {onSave && <Button size="sm" variant="ghost" icon={<BookmarkPlus />} onClick={onSave}>Save as task</Button>}
              {onReplay && <Button size="sm" variant="ghost" icon={<RotateCcw />} onClick={onReplay}>Replay</Button>}
              <span className="ff-spacer" />
              {onFresh && <Button size="sm" variant="secondary" icon={<Wand2 />} onClick={onFresh}>Start fresh</Button>}
            </div>
          </motion.section>)}
      </AnimatePresence>
    </div>
  );
}
function Sparkles2() {
  const dots = useMemo(() => Array.from({ length: 8 }, (_, i) => ({ a: (i / 8) * Math.PI * 2, d: 44 + (i % 3) * 10 })), []);
  return <>{dots.map((d, i) => <motion.span key={i} className="ff-sparkle" style={{ left: '50%', top: 18 }} initial={{ opacity: 0.9, x: 0, y: 0, scale: 1 }} animate={{ opacity: 0, x: Math.cos(d.a) * d.d * 2, y: Math.sin(d.a) * d.d * 0.7, scale: 0.4 }} transition={{ duration: 0.8, delay: 0.12, ease: ease.standard }} aria-hidden />)}</>;
}

/* ───────── Command bar ───────── */
export interface SlashCommand { name: string; hint: string }
export const SLASH: SlashCommand[] = [
  { name: '/new', hint: 'Start fresh' }, { name: '/compact', hint: 'Tidy up the context' }, { name: '/context', hint: 'See what is in context' },
  { name: '/pantry', hint: 'Open your Pantry' }, { name: '/model', hint: 'Choose where I think' }, { name: '/stop', hint: 'Stop what I am doing' },
];

export function CommandBar({ onSubmit, onSlash, busy, onStop, suggestions, onAttach, placeholder = 'What should I do?', hint, disabled }: { onSubmit: (text: string) => void; onSlash: (cmd: string) => void; busy: boolean; onStop: () => void; suggestions?: string[]; onAttach?: () => void; placeholder?: string; hint?: ReactNode; disabled?: boolean }) {
  const [text, setText] = useState(''); const [sel, setSel] = useState(0);
  const ta = useRef<HTMLTextAreaElement>(null); const anchor = useFlyAnchor<HTMLDivElement>('composer', { side: 'top-right', gap: 8 });
  const slashOpen = text.startsWith('/') && !text.includes(' ');
  const matches = slashOpen ? SLASH.filter((c) => c.name.startsWith(text.toLowerCase())) : [];
  useEffect(() => { setSel(0); }, [text]);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = '0px'; el.style.height = `${Math.min(160, el.scrollHeight)}px`; }, [text]);
  const submit = useCallback(() => {
    const t = text.trim(); if (!t || busy || disabled) return;
    if (t.startsWith('/')) { onSlash(t.split(' ')[0]!.toLowerCase()); setText(''); return; }
    onSubmit(t); setText('');
  }, [text, busy, disabled, onSubmit, onSlash]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === '/' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); ta.current?.focus(); setText('/'); } }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return (
    <div ref={anchor}>
      {!busy && suggestions && suggestions.length > 0 && !text && <div className="ff-chips" role="group" aria-label="Suggestions">{suggestions.map((s) => <button key={s} type="button" className="ff-chip" onClick={() => { setText(s); ta.current?.focus(); }}>{s}</button>)}</div>}
      <div className="ff-composer">
        <AnimatePresence>{matches.length > 0 && (
          <motion.div className="ff-slash" role="listbox" aria-label="Commands" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: dur.fast }}>
            {matches.map((c, i) => <button key={c.name} role="option" aria-selected={i === sel} type="button" onMouseEnter={() => setSel(i)} onClick={() => { onSlash(c.name); setText(''); }}><code>{c.name}</code><span>{c.hint}</span></button>)}
          </motion.div>)}</AnimatePresence>
        <textarea ref={ta} rows={1} value={text} placeholder={placeholder} aria-label="Tell FruitFly what to do" disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (matches.length) {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % matches.length); return; }
              if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + matches.length) % matches.length); return; }
              if (e.key === 'Tab' || (e.key === 'Enter' && text !== matches[sel]!.name)) { e.preventDefault(); setText(matches[sel]!.name); return; }
              if (e.key === 'Escape') { setText(''); return; }
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
          }} />
        <div className="ff-composer-row">
          {onAttach && <IconButton label="Add to Pantry" onClick={onAttach}><Paperclip /></IconButton>}
          <span className="ff-muted" style={{ fontSize: 11.5, paddingLeft: 4 }}>{hint ?? <><Kbd>/</Kbd> for commands</>}</span>
          <span className="ff-spacer" />
          {busy ? <button type="button" className="ff-send ff-send--stop" aria-label="Stop" onClick={onStop}><Square fill="currentColor" /></button>
            : <button type="button" className="ff-send" aria-label="Send" disabled={!text.trim() || disabled} onClick={submit}><ArrowUp /></button>}
        </div>
      </div>
    </div>
  );
}

/* ───────── Context inspector ───────── */
export interface InspectorSegment { kind: string; tokens: number; fraction: number; cacheable: boolean; sensitivity: string; trimmable: boolean; description: string }
export interface InspectorData { window: number; used: number; reserve: number; compactAt: number; cachedPrefixTokens: number; segments: InspectorSegment[]; cacheHitRatio?: number }
const SEG_COLOR: Record<string, string> = { system: '#8C7B5C', tools: '#B59E6E', profile: 'var(--ff-plum)', scratchpad: 'var(--ff-lime)', docs: 'var(--ff-peach)', history: 'var(--ff-honey)', observation: '#C97A52', reserve: 'transparent' };
const SEG_NAME: Record<string, string> = { system: 'System', tools: 'Tools', profile: 'About you', scratchpad: 'Scratchpad', docs: 'Pantry', history: 'History', observation: 'Now', reserve: 'Reserve' };

export function ContextInspector({ data, onCompact, onFresh, estimated = true }: { data: InspectorData; onCompact?: () => void; onFresh?: () => void; estimated?: boolean }) {
  const [focus, setFocus] = useState<string | null>(null); const ref = useFlyAnchor<HTMLDivElement>('context-meter', { side: 'top', gap: 6 });
  const f = data.segments.find((s) => s.kind === focus);
  const usedPct = Math.round((data.used / data.window) * 100);
  return (
    <div ref={ref} aria-label="Context inspector">
      <div className="ff-row" style={{ marginBottom: 8 }}><span className="ff-kicker">Context</span><span className="ff-spacer" /><span className="ff-muted tnum" style={{ fontSize: 12 }}>{estimated ? '≈ ' : ''}{fmtN(data.used)} of {fmtN(data.window)} · {usedPct}%</span></div>
      <div className="ff-bar" role="img" aria-label={`Context ${usedPct} percent full`}>
        {data.segments.map((s) => (
          <motion.button key={s.kind} type="button" className="ff-seg" data-cached={s.cacheable && s.kind !== 'reserve' ? 'true' : undefined} layout initial={false} animate={{ width: `${Math.max(0.4, s.fraction * 100)}%` }} transition={spring.ui}
            style={{ background: SEG_COLOR[s.kind], ...(s.kind === 'reserve' ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 4px, var(--border) 4px 5px)' } : {}) }}
            aria-label={`${SEG_NAME[s.kind] ?? s.kind}: ${s.tokens} tokens`} onMouseEnter={() => setFocus(s.kind)} onFocus={() => setFocus(s.kind)} onMouseLeave={() => setFocus(null)} onBlur={() => setFocus(null)} />))}
        <i className="ff-mark" style={{ left: `${(data.compactAt / data.window) * 100}%` }} title="Compaction at 70%" />
      </div>
      <div style={{ minHeight: 44, marginTop: 8, fontSize: 12.5 }} aria-live="polite">
        {f ? <><b>{SEG_NAME[f.kind] ?? f.kind}</b> <span className="ff-muted tnum">≈{fmtN(f.tokens)} tokens · {f.sensitivity}{f.cacheable ? ' · cached prefix' : ''}{f.trimmable ? ' · can be trimmed' : ''}</span><div className="ff-muted">{f.description}</div></> : <span className="ff-muted">Hover a segment. Dashed line marks where I tidy up.</span>}
      </div>
      <div className="ff-legend">{data.segments.filter((s) => s.kind !== 'reserve').map((s) => <div className="ff-legend-item" key={s.kind}><i style={{ background: SEG_COLOR[s.kind] }} />{SEG_NAME[s.kind]}<b className="tnum">{fmtN(s.tokens)}</b></div>)}</div>
      <div className="ff-row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        {onCompact && <Button size="sm" onClick={onCompact} icon={<Layers />}>Compact now</Button>}
        {onFresh && <Button size="sm" onClick={onFresh} icon={<Wand2 />}>Start fresh</Button>}
        <span className="ff-spacer" />
        <span className="ff-muted tnum" style={{ fontSize: 11.5 }}>{data.cacheHitRatio !== undefined ? `cache hit ${Math.round(data.cacheHitRatio * 100)}%` : `cached prefix ≈${fmtN(data.cachedPrefixTokens)}`}</span>
      </div>
    </div>
  );
}
export { ChevronDown, Lock, Save, AlertTriangle, cx };
