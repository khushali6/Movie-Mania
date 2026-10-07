import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileText, Lock, Globe, Cpu } from 'lucide-react';
import type { Passage } from '@fruitfly/pantry';
import type { Sensitivity } from '@fruitfly/core';
import { Segmented, dur } from '@fruitfly/ui';
import { demoPantry, pantryReady } from '../pantry';
import { Section } from './common';

const QUESTIONS = ['What does my lease say about notice and pets?', 'Which electricity bills are still pending or overdue?', 'How much does the Kyoto guesthouse cost per night?'];
type Route = 'device' | 'remote-personal' | 'remote-public';
const ALLOW: Record<Route, Sensitivity> = { device: 'local-only', 'remote-personal': 'personal', 'remote-public': 'public' };
const ROUTE_NOTE: Record<Route, string> = { device: 'A model on this device can read everything, including private documents.', 'remote-personal': 'A remote model can read documents you marked personal. Private ones stay home.', 'remote-public': 'A remote model sees nothing from your Pantry. It only gets what is public.' };

const BADGE: Record<Sensitivity, { label: string; icon: typeof Lock }> = { 'local-only': { label: 'Stays on device', icon: Lock }, personal: { label: 'Personal', icon: FileText }, public: { label: 'Public', icon: Globe } };

export function PantryDemo() {
  const [q, setQ] = useState(QUESTIONS[0]!); const [route, setRoute] = useState<Route>('remote-personal');
  const [out, setOut] = useState<{ passages: Passage[]; withheld: number; ms: number; plan: string } | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      await pantryReady;
      const r = await demoPantry.search(q, { maxAllowed: ALLOW[route], force: true, k: 4 });
      // compare with what the most-trusted asker would see, so weak leftovers from other documents are not shown as answers
      const best = (await demoPantry.search(q, { maxAllowed: 'local-only', force: true, k: 1 })).passages[0]?.score ?? 0;
      const passages = r.passages.filter((p) => p.score >= best * 0.45).slice(0, 3);
      if (live) setOut({ passages, withheld: r.withheld, ms: r.ms, plan: r.plan.mode });
    })();
    return () => { live = false; };
  }, [q, route]);
  return (
    <Section id="pantry" eyebrow="Pantry" title={<>Knows you, <em>stays home.</em></>} lede="Drop in leases, invoices, notes, trip plans. FruitFly indexes them inside your browser and pulls out only the few lines a question needs. Change who is asking and watch what it is allowed to see. This is the real search, running on this page.">
      <div className="lp-pantry">
        <div className="lp-pantry-ctl">
          <label className="lp-label" htmlFor="pq">Ask your Pantry</label>
          <div className="lp-qs" role="group" aria-label="Sample questions">{QUESTIONS.map((x) => <button key={x} type="button" className="ff-chip" aria-pressed={x === q} onClick={() => setQ(x)}>{x}</button>)}</div>
          <input id="pq" className="ff-input" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="lp-label">Who is asking</div>
          <Segmented<Route> label="Who is asking" value={route} onChange={setRoute} options={[{ value: 'device', label: 'Model on this device' }, { value: 'remote-personal', label: 'Remote model' }, { value: 'remote-public', label: 'Remote, public only' }]} />
          <p className="lp-note" aria-live="polite"><Cpu size={14} aria-hidden /> {ROUTE_NOTE[route]}</p>
        </div>
        <div className="lp-pantry-out" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            {out?.passages.map((p) => { const B = BADGE[p.sensitivity]; return (
              <motion.article key={p.id} layout className="lp-passage" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: dur.base }}>
                <header><b>{p.doc}</b>{p.headingPath.length > 0 && <span className="lp-path">{p.headingPath.join(' › ')}</span>}<span className={`lp-badge lp-badge-${p.sensitivity}`}><B.icon size={12} aria-hidden /> {B.label}</span></header>
                <p>{p.text.length > 280 ? `${p.text.slice(0, 280)}…` : p.text}</p>
              </motion.article>); })}
          </AnimatePresence>
          {out && out.passages.length === 0 && <p className="lp-empty">Nothing the current asker may read matches this question.</p>}
          {out && out.withheld > 0 && <p className="lp-withheld"><Lock size={14} aria-hidden /> {out.withheld} passage{out.withheld === 1 ? '' : 's'} kept back because of who is asking.</p>}
          {out && <p className="lp-meta">Found in {Math.max(1, Math.round(out.ms))} ms · plan: {out.plan}</p>}
        </div>
      </div>
    </Section>
  );
}
