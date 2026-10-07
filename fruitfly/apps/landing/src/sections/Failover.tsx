import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Activity, Gauge, Cpu, Cloud } from 'lucide-react';
import { createDemoRig, SCENARIOS } from '@fruitfly/demo';
import type { RouterEvent } from '@fruitfly/gateway';
import { Button, dur } from '@fruitfly/ui';
import { Section } from './common';

const LANES = [
  { id: 'demo:free-pool', label: 'Free pool · auto', icon: Cloud },
  { id: 'demo:backup', label: 'Free pool · smart', icon: Cloud },
  { id: 'demo:on-device', label: 'On this device', icon: Cpu },
] as const;
type LaneState = 'idle' | 'serving' | 'limited';

function say(e: RouterEvent): string | null {
  switch (e.type) {
    case 'retry': return `${label(e.route)} is busy (${e.reason}). Trying again.`;
    case 'route_switch': return e.from ? `Switching from ${label(e.from)} to ${label(e.to)}. ${e.reason}.` : `Using ${label(e.to)}.`;
    case 'throttled': return `${label(e.route)} is throttled. I will queue, not hammer it.`;
    case 'breaker': return `${label(e.route)}: ${e.state}.`;
    default: return null;
  }
}
const label = (id: string) => LANES.find((l) => l.id === id)?.label ?? id;

export function Failover() {
  const [lanes, setLanes] = useState<Record<string, LaneState>>({});
  const [lines, setLines] = useState<string[]>([]);
  const [state, setState] = useState<'idle' | 'running' | 'done'>('idle');
  const [steps, setSteps] = useState(0);
  const token = useRef(0);

  const run = useCallback(async () => {
    const my = ++token.current; setState('running'); setLines([]); setLanes({}); setSteps(0);
    const events: RouterEvent[] = [];
    // the real router, breakers and rate limiter, with a scripted model and a scripted 429 on the third call
    const rig = await createDemoRig({ scenario: 'laptop', failoverDemo: true, rateLimitAtCall: 3, thinkMs: 0, latency: 0, sleep: async () => undefined, onRouterEvent: (e) => events.push(e) });
    const goal = SCENARIOS.find((s) => s.id === 'laptop')!.goal;
    const result = await rig.controller.start(goal, { mode: 'demo' });
    setSteps(result.steps.length);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let current: string | undefined;
    for (const e of events) {
      if (token.current !== my) return;
      const s = say(e);
      setLanes((prev) => {
        const n = { ...prev };
        if (e.type === 'route_switch') { if (e.from) n[e.from] = 'limited'; n[e.to] = 'serving'; current = e.to; }
        else if (e.type === 'usage') { if (!current) { n[e.route] = 'serving'; current = e.route; } }
        else if (e.type === 'retry' || (e.type === 'breaker' && e.state !== 'closed' && e.state !== 'healthy')) n[e.route] = 'limited';
        return n;
      });
      if (s) { setLines((l) => (l.includes(s) ? l : [...l, s])); await new Promise((r) => setTimeout(r, reduced ? 0 : 650)); }
    }
    if (token.current === my) setState('done');
  }, []);

  return (
    <Section id="gateway" eyebrow="Models" title={<>Never <em>runs dry.</em></>} lede="FruitFly can use a free model pool, your own keys, or a model on your own computer. When one route is rate limited or goes down mid-task, it moves to the next without losing its place. Press the button to hit a rate limit on purpose." tone="sunken">
      <div className="lp-failover">
        <div className="lp-lanes" role="list" aria-label="Model routes">
          {LANES.map((l) => { const st = lanes[l.id] ?? 'idle'; return (
            <motion.div key={l.id} role="listitem" className={`lp-lane lp-lane-${st}`} animate={{ scale: st === 'serving' ? 1.02 : 1 }} transition={{ duration: dur.base }}>
              <l.icon size={16} aria-hidden /><b>{l.label}</b>
              <span className="lp-lane-state">{st === 'serving' ? 'Serving' : st === 'limited' ? 'Rate limited' : 'Waiting'}</span>
            </motion.div>); })}
        </div>
        <div className="lp-failover-side">
          <Button variant="primary" onClick={() => void run()} disabled={state === 'running'}><Gauge size={16} aria-hidden /> {state === 'idle' ? 'Hit a rate limit' : state === 'running' ? 'Running…' : 'Run it again'}</Button>
          <ol className="lp-lines" aria-live="polite" aria-label="What the router did">
            <AnimatePresence initial={false}>{lines.map((l) => <motion.li key={l} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: dur.base }}><Activity size={13} aria-hidden /> {l}</motion.li>)}</AnimatePresence>
          </ol>
          {state === 'done' && <p className="lp-done">Finished the whole job in {steps} steps. It never lost its place.</p>}
        </div>
      </div>
    </Section>
  );
}
