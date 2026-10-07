import { Pause, Play, SkipBack } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AgentEvent } from '@fruitfly/core';
import { initialSession, reduceEvent } from '../session';
import { usePrefersReducedMotion } from '../fly/hooks';
import { Timeline } from './agent';
import { Button, Badge } from './primitives';

export interface ReplayData { goal: string; events: AgentEvent[]; path: [number, number, number][]; sites: string[]; tokens: number }

/** Scrub through a finished task: timeline up to the cursor, plus the fly's path as a ghost trail over a wireframe viewport. */
export function Replay({ data }: { data: ReplayData }) {
  const events = useMemo(() => data.events.filter((e) => e.type !== 'usage'), [data.events]);
  const [i, setI] = useState(events.length); const [playing, setPlaying] = useState(false); const reduced = usePrefersReducedMotion();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => { if (!playing) return; timer.current = setInterval(() => setI((x) => { if (x >= events.length) { setPlaying(false); return x; } return x + 1; }), reduced ? 120 : 380); return () => { if (timer.current) clearInterval(timer.current); }; }, [playing, events.length, reduced]);
  const session = useMemo(() => events.slice(0, i).reduce(reduceEvent, initialSession()), [events, i]);
  const t0 = events[0]?.at ?? 0; const t1 = events[events.length - 1]?.at ?? t0 + 1;
  const progress = events.length ? Math.max(0, Math.min(1, ((events[Math.max(0, i - 1)]?.at ?? t0) - t0) / Math.max(1, t1 - t0))) : 0;
  const maxT = data.path.at(-1)?.[0] ?? 1;
  const pts = data.path.filter((p) => p[0] / maxT <= progress + 0.001);
  const marks = events.map((e, n) => ({ n, e })).filter(({ e }) => e.type === 'step_started' || e.type === 'approval_needed' || e.type === 'result');
  return (
    <div className="ff-stack">
      <div className="ff-row"><Button size="sm" variant="ghost" icon={<SkipBack />} onClick={() => { setI(0); setPlaying(false); }} aria-label="Back to start" /><Button size="sm" icon={playing ? <Pause /> : <Play />} onClick={() => { if (i >= events.length) setI(0); setPlaying((p) => !p); }}>{playing ? 'Pause' : 'Play'}</Button>
        <input type="range" className="ff-slider" aria-label="Replay position" min={0} max={events.length} value={i} onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} style={{ flex: 1 }} />
        <span className="ff-muted tnum" style={{ fontSize: 12 }}>{i}/{events.length}</span></div>
      <div style={{ position: 'relative', height: 14 }} aria-hidden>{marks.map(({ n, e }) => <i key={n} style={{ position: 'absolute', left: `${(n / Math.max(1, events.length)) * 100}%`, top: 3, width: 3, height: 8, borderRadius: 2, background: e.type === 'approval_needed' ? 'var(--ff-ruby)' : e.type === 'result' ? 'var(--ff-lime)' : 'var(--ff-honey)' }} />)}</div>
      <div className="two" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 300px', gap: 16, alignItems: 'start' }}>
        <div><div className="ff-goal">{data.goal}</div><Timeline session={session} /></div>
        <div className="ff-card" style={{ padding: 12 }}>
          <div className="ff-kicker" style={{ marginBottom: 6 }}>Where the fly went</div>
          <svg viewBox="0 0 1000 620" width="100%" role="img" aria-label="The fly's path over the page" style={{ background: 'var(--sunken)', borderRadius: 10, display: 'block' }}>
            <rect x="8" y="8" width="984" height="604" rx="14" fill="none" stroke="var(--border-strong)" strokeDasharray="6 8" />
            {pts.length > 1 && <polyline points={pts.map((p) => `${p[1]},${p[2] * 0.62}`).join(' ')} fill="none" stroke="var(--ff-honey)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" opacity=".55" />}
            {pts.length > 0 && <circle cx={pts.at(-1)![1]} cy={pts.at(-1)![2] * 0.62} r="16" fill="var(--ff-honey)" />}
          </svg>
          <div className="ff-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>{data.sites.map((s) => <Badge key={s}>{s}</Badge>)}<span className="ff-muted tnum" style={{ fontSize: 12 }}>≈{data.tokens.toLocaleString('en-IN')} tokens</span></div>
        </div>
      </div>
    </div>
  );
}
