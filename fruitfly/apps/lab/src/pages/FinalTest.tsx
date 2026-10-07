import { useEffect, useRef, useState } from 'react';
import type { FlyMood } from '@fruitfly/core';
import { FlyProvider, useFly, useFlyAnchor, useFlyMood } from '@fruitfly/ui';

function Playground() {
  const fly = useFly(); const mood = useFlyMood();
  const [log, setLog] = useState<string[]>([]); const [delivered, setDelivered] = useState(false);
  const add = (s: string) => setLog((l) => [`${(performance.now() / 1000).toFixed(1)}s  ${s}`, ...l].slice(0, 30));
  const refA = useFlyAnchor<HTMLDivElement>('lab-a', { side: 'right' }); const refB = useFlyAnchor<HTMLDivElement>('lab-b', { side: 'left' }); const refC = useFlyAnchor<HTMLDivElement>('lab-c', { side: 'top' });
  const refPerch = useFlyAnchor<HTMLDivElement>('perch-default', { side: 'center' }); const refResult = useFlyAnchor<HTMLDivElement>('result-card', { side: 'top-right' }); const refComposer = useFlyAnchor<HTMLTextAreaElement>('composer', { side: 'right' });
  const drag = useRef<{ el: HTMLElement; dx: number; dy: number } | null>(null);
  const go = async (id: string, style?: 'dart' | 'glide') => { add(`flyTo ${id} (${style ?? 'auto'})`); await fly?.flyToAnchor(id, { style, mood: 'curious' }); add(`arrived ${id}`); fly?.setMood('idle'); };
  const down = (e: React.PointerEvent<HTMLElement>) => { const r = e.currentTarget.getBoundingClientRect(); drag.current = { el: e.currentTarget, dx: e.clientX - r.left, dy: e.clientY - r.top }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent<HTMLElement>) => { const d = drag.current; if (!d) return; const p = d.el.parentElement!.getBoundingClientRect(); d.el.style.left = `${e.clientX - p.left - d.dx}px`; d.el.style.top = `${e.clientY - p.top - d.dy}px`; };
  return (
    <>
      <div className="bar" style={{ position: 'static', marginBottom: 12 }}>
        <button className="ff-btn ff-btn--sm" onClick={() => go('lab-a', 'dart')}>Dart to A</button>
        <button className="ff-btn ff-btn--sm" onClick={() => go('lab-b')}>Glide to B</button>
        <button className="ff-btn ff-btn--sm" onClick={() => go('lab-c')}>Fly to C</button>
        <button className="ff-btn ff-btn--sm" onClick={() => { fly?.setMood('acting'); fly?.click(); add('click beat'); }}>Click</button>
        <button className="ff-btn ff-btn--sm" onClick={() => { setDelivered(false); add('deliverResult'); void fly?.deliverResult().then(() => { setDelivered(true); add('card landed'); }); }}>Deliver result</button>
        <button className="ff-btn ff-btn--sm" onClick={() => { fly?.halt(); add('halt (interrupt)'); }}>Interrupt</button>
        <span className="ff-hint">mood: <b data-testid="mood" style={{ color: 'var(--ink)' }}>{mood}</b></span>
      </div>
      <div className="stage-big" id="stage">
        <div ref={refPerch} style={{ position: 'absolute', left: 40, top: 60, width: 4, height: 4 }} />
        <div ref={refA} className="target" style={{ left: 300, top: 70 }} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)}>Anchor A (drag me)</div>
        <div ref={refB} className="target" style={{ left: 120, top: 280 }} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)}>Anchor B</div>
        <div ref={refC} className="target" style={{ left: 520, top: 200 }} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)}>Anchor C</div>
        <textarea ref={refComposer} className="ff-textarea" placeholder="Composer: the fly stays beside, never on top" style={{ position: 'absolute', left: 24, bottom: 20, width: 330, height: 58 }} />
        <div ref={refResult} style={{ position: 'absolute', right: 30, bottom: 22, width: 300, minHeight: 150, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--raised)', boxShadow: 'var(--shadow-2)', padding: 18, transformOrigin: '30% 0', transform: delivered ? 'scale(1)' : 'scale(.96)', opacity: delivered ? 1 : 0.35, transition: 'all .36s cubic-bezier(.3,0,0,1)' }}>
          <b>Result card</b><div className="ff-muted" style={{ fontSize: 13, marginTop: 6 }}>Cheapest laptop under ₹60,000: Redmi Book 15 at ₹42,990.</div>
        </div>
      </div>
      <div className="log" data-testid="log">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
    </>
  );
}

function Sequence() {
  const fly = useFly(); const [step, setStep] = useState(''); const [running, setRunning] = useState(false);
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const run = async () => {
    if (!fly || running) return; setRunning(true);
    const S = async (label: string, mood: FlyMood, anchor?: string, ms = 900) => { setStep(label); if (anchor) await fly.flyToAnchor(anchor, { mood }); else fly.setMood(mood, { force: true }); await sleep(ms); };
    await S('User opens FruitFly: wakes', 'sleeping', 'perch-default', 900); await S('wake → idle hover', 'idle', undefined, 1200);
    await S('User enters task → notices', 'curious', 'lab-c', 700); await S('thinking', 'thinking', undefined, 1600);
    await S('target discovered → accelerates, approaches', 'searching', 'lab-a', 1300); await S('reads', 'reading', undefined, 1700);
    await S('clicks', 'acting', undefined, 700); fly.click(); await S('navigates → reads new page', 'reading', 'lab-b', 1500);
    await S('types', 'typing', 'composer', 1500); await S('waits', 'waiting', undefined, 1400); await S('confused when unexpected', 'confused', undefined, 1900);
    await S('recovers', 'thinking', 'lab-a', 1200); await S('completes task → success', 'success', undefined, 2300); await S('returns to idle', 'idle', 'perch-default', 800);
    setStep('Done'); setRunning(false);
  };
  return <div className="ff-row"><button className="ff-btn ff-btn--primary" onClick={run} disabled={running} data-testid="run-final">{running ? 'Running…' : 'Run final character test'}</button><span data-testid="final-step" className="ff-hint">{step}</span></div>;
}

export function FinalTest() {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => { setContainer(document.getElementById('stage')); }, []);
  return (
    <FlyProvider container={container} size={60} sleepAfter={0}>
      <h2>Anchor playground</h2>
      <p className="sub">The fly lands beside targets and never on top of the input. Drag anchors, then fly. Interrupt decelerates, looks at the cursor, and goes idle.</p>
      <Playground />
      <h2>Final character test</h2>
      <p className="sub">Wake, idle, task, think, target, read, click, navigate, read, type, wait, confused, recover, success, idle: one continuous physical action.</p>
      <Sequence />
      <h2>Cursor reaction</h2>
      <div className="cursor-zone">Move the cursor near the fly. It notices after a beat, glances, sometimes drifts closer, backs off if you rush it.</div>
    </FlyProvider>
  );
}
