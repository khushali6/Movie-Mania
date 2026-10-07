import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FLY_MOODS, type FlyEnergy, type FlyMood } from '@fruitfly/core';
import { FlyProvider, ProceduralFly, ticker, useFly, useFlyAnchor, useFlyMood, type FlyEngine } from '../src';
import './lab.css';

const NOTES: Record<FlyMood, string> = {
  idle: 'Alive when nothing happens', greeting: 'Wave, hop, settle', curious: 'Leans toward the cursor', thinking: 'Slow orbit, pauses, turns',
  searching: 'Short darts, inspects', reading: 'Hovers, scans down', acting: 'Compress, dive, rebound', typing: 'Tiny rhythmic taps',
  waiting: 'Slow fan, looks around', asking: 'Foreleg up, “I need you”', success: 'Pop, loop, 5–12 sparks', confused: 'Tilt, look L/R, back off',
  error: 'Calm stop, recoil, drop', sleeping: 'Folds wings, slow breath',
};

function Fps() {
  const [s, setS] = useState(ticker.getStats());
  useEffect(() => { const id = setInterval(() => setS({ ...ticker.getStats() }), 400); return () => clearInterval(id); }, []);
  return (
    <div className="fps" data-testid="fps">
      {s.fps.toFixed(0)} fps · {s.avgMs.toFixed(1)} ms<br />worst {s.worstMs.toFixed(0)} ms · long {s.longFrames}
    </div>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o} aria-pressed={o === value} onClick={() => onChange(o)}>{o}</button>)}
    </div>
  );
}

function MoodGrid({ energy, reduced }: { energy: FlyEnergy; reduced: boolean }) {
  return (
    <div className="grid" data-testid="mood-grid">
      {FLY_MOODS.map((m) => (
        <div className="card" key={m} data-mood={m}>
          <div className="stage"><ProceduralFly mood={m} size={96} energy={energy} reducedMotion={reduced} seed={m} label={`${m} fly`} /></div>
          <b>{m}</b><span>{NOTES[m]}</span>
        </div>
      ))}
    </div>
  );
}

function Playground() {
  const fly = useFly();
  const mood = useFlyMood();
  const [log, setLog] = useState<string[]>([]);
  const add = (s: string) => setLog((l) => [`${(performance.now() / 1000).toFixed(1)}s  ${s}`, ...l].slice(0, 30));
  const refA = useFlyAnchor<HTMLDivElement>('lab-a', { side: 'right' });
  const refB = useFlyAnchor<HTMLDivElement>('lab-b', { side: 'left' });
  const refC = useFlyAnchor<HTMLDivElement>('lab-c', { side: 'top' });
  const refPerch = useFlyAnchor<HTMLDivElement>('perch-default', { side: 'center' });
  const refResult = useFlyAnchor<HTMLDivElement>('result-card', { side: 'top-right' });
  const refComposer = useFlyAnchor<HTMLTextAreaElement>('composer', { side: 'right' });
  const drag = useRef<{ el: HTMLElement; dx: number; dy: number } | null>(null);
  const [delivered, setDelivered] = useState(false);

  const go = async (id: string, style?: 'dart' | 'glide') => { add(`flyTo ${id} (${style ?? 'auto'})`); await fly?.flyToAnchor(id, { style, mood: 'curious' }); add(`arrived ${id}`); fly?.setMood('idle'); };
  const down = (e: React.PointerEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); drag.current = { el: e.currentTarget, dx: e.clientX - r.left, dy: e.clientY - r.top }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent<HTMLElement>) => { const d = drag.current; if (!d) return; const p = d.el.parentElement!.getBoundingClientRect(); d.el.style.left = `${e.clientX - p.left - d.dx}px`; d.el.style.top = `${e.clientY - p.top - d.dy}px`; };
  const up = () => { drag.current = null; };

  return (
    <>
      <div className="bar" style={{ position: 'static', marginBottom: 12 }}>
        <button className="btn" onClick={() => go('lab-a', 'dart')}>Dart to A</button>
        <button className="btn" onClick={() => go('lab-b')}>Glide to B</button>
        <button className="btn" onClick={() => go('lab-c')}>Fly to C</button>
        <button className="btn" onClick={() => { fly?.setMood('acting'); fly?.click(); add('click beat'); }}>Click</button>
        <button className="btn" onClick={() => { setDelivered(false); add('deliverResult'); void fly?.deliverResult().then(() => { setDelivered(true); add('card landed'); }); }}>Deliver result</button>
        <button className="btn" onClick={() => { fly?.halt(); add('halt (interrupt)'); }}>Interrupt</button>
        <span style={{ color: 'var(--muted)', fontSize: 13 }}>mood: <b data-testid="mood" style={{ color: 'var(--ink)' }}>{mood}</b></span>
      </div>
      <div className="stage-big" id="stage">
        <div ref={refPerch} style={{ position: 'absolute', left: 40, top: 60, width: 4, height: 4 }} />
        <div ref={refA} className="target" style={{ left: 300, top: 70 }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>Anchor A (drag me)</div>
        <div ref={refB} className="target" style={{ left: 120, top: 280 }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>Anchor B</div>
        <div ref={refC} className="target" style={{ left: 520, top: 200 }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>Anchor C</div>
        <textarea ref={refComposer} placeholder="Composer: the fly stays beside, never on top" style={{ position: 'absolute', left: 24, bottom: 20, width: 330, height: 58, borderRadius: 12, border: '1px solid var(--border-strong)', padding: 10, background: 'var(--raised)', color: 'var(--ink)', font: '14px var(--font-ui)' }} />
        <div ref={refResult} style={{ position: 'absolute', right: 30, bottom: 22, width: 300, minHeight: 150, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--raised)', boxShadow: 'var(--shadow-2)', padding: 18, transformOrigin: '30% 0', transform: delivered ? 'scale(1)' : 'scale(.96)', opacity: delivered ? 1 : 0.35, transition: 'all .36s cubic-bezier(.3,0,0,1)' }}>
          <b>Result card</b><div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 6 }}>Cheapest laptop under ₹60,000: Acer Aspire 5 at ₹47,990.</div>
        </div>
      </div>
      <div className="log" data-testid="log">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
    </>
  );
}

function FinalTest() {
  const fly = useFly();
  const [step, setStep] = useState('');
  const [running, setRunning] = useState(false);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const run = async () => {
    if (!fly || running) return;
    setRunning(true);
    const S = async (label: string, mood: FlyMood, anchor?: string, ms = 900) => { setStep(label); if (anchor) await fly.flyToAnchor(anchor, { mood }); else fly.setMood(mood, { force: true }); await sleep(ms); };
    await S('User opens FruitFly: wakes', 'sleeping', 'perch-default', 900);
    await S('wake → idle hover', 'idle', undefined, 1200);
    await S('User enters task → notices', 'curious', 'lab-c', 700);
    await S('thinking', 'thinking', undefined, 1600);
    await S('target discovered → fly accelerates, approaches', 'searching', 'lab-a', 1300);
    await S('reads', 'reading', undefined, 1700);
    await S('clicks', 'acting', undefined, 700); fly.click();
    await S('navigates → reads new page', 'reading', 'lab-b', 1500);
    await S('types', 'typing', 'composer', 1500);
    await S('waits', 'waiting', undefined, 1400);
    await S('confused when unexpected', 'confused', undefined, 1900);
    await S('recovers', 'thinking', 'lab-a', 1200);
    await S('completes task → success', 'success', undefined, 2300);
    await S('returns to idle', 'idle', 'perch-default', 800);
    setStep('Done'); setRunning(false);
  };
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <button className="btn primary" onClick={run} disabled={running} data-testid="run-final">{running ? 'Running…' : 'Run final character test'}</button>
      <span data-testid="final-step" style={{ fontSize: 13, color: 'var(--muted)' }}>{step}</span>
    </div>
  );
}

function CursorZone() {
  return <div className="cursor-zone" data-fly-avoid>Move the cursor near the fly. It notices after a beat, glances, sometimes drifts closer, backs off if you rush it.</div>;
}

function App() {
  const [energy, setEnergy] = useState<FlyEnergy>('normal');
  const [reduced, setReduced] = useState(false);
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [fps, setFps] = useState(true);
  const [stage, setStage] = useState<HTMLElement | null>(null);
  void stage; void setStage;
  useEffect(() => { const r = document.documentElement; if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme); }, [theme]);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => { setContainer(document.getElementById('stage')); }, []);
  void (null as unknown as FlyEngine);

  return (
    <FlyProvider container={container} energy={energy} reducedMotion={reduced} size={60} sleepAfter={0}>
      <div className="lab">
        <h1>Fly Lab</h1>
        <p className="sub">Every mood, every state. The fly is one procedural SVG driven by a physics engine; nothing here is a GIF.</p>
        <div className="bar">
          <Seg label="Energy" value={energy} options={['calm', 'normal', 'lively'] as const} onChange={setEnergy} />
          <Seg label="Theme" value={theme} options={['auto', 'light', 'dark'] as const} onChange={setTheme} />
          <button className="btn" aria-pressed={reduced} onClick={() => setReduced((r) => !r)} data-testid="toggle-reduced">Reduced motion: {reduced ? 'on' : 'off'}</button>
          <button className="btn" onClick={() => setFps((f) => !f)}>FPS overlay</button>
        </div>
        <h2>Moods</h2>
        <MoodGrid energy={energy} reduced={reduced} />
        <h2>Anchor playground</h2>
        <p className="sub">The fly lands beside targets, never on top of the input. Drag anchors, then fly.</p>
        <Playground />
        <h2>Final character test</h2>
        <p className="sub">The sequence from the character spec: wake, idle, task, think, target, read, click, navigate, read, type, wait, confused, recover, success, idle.</p>
        <FinalTest />
        <h2>Cursor reaction</h2>
        <CursorZone />
      </div>
      {fps && <Fps />}
    </FlyProvider>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
