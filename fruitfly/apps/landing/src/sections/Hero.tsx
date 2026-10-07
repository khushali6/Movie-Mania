import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FlyProvider, SidePanel, useFly } from '@fruitfly/ui';
import { DemoPanelController, MockBrowserView, SCENARIOS } from '@fruitfly/demo';
import { demoPantry } from '../pantry';
import { Reveal } from './common';

function Bridge({ controller, view }: { controller: DemoPanelController; view: React.RefObject<HTMLDivElement | null> }) {
  const fly = useFly();
  useEffect(() => { controller.attachFly(fly); controller.attachView(view.current); return () => controller.attachFly(null); }, [controller, fly, view]);
  return null;
}

/** The real agent loop, router, context layer and Pantry, driven by a scripted model against a mock browser. */
function LiveDemo() {
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const controller = useMemo(() => new DemoPanelController({ thinkMs: 520, pantry: demoPantry, seedPantry: false }), []);
  const [, force] = useState(0); const view = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => { return controller.onBrowser(() => force((n) => n + 1)); }, [controller]);
  useEffect(() => { const h = (e: Event) => { const g = (e as CustomEvent<string>).detail; setActive(g); controller.start(g); }; window.addEventListener('ff:run', h); return () => window.removeEventListener('ff:run', h); }, [controller]);
  return (
    <div className="lp-stage" ref={setStage} data-testid="hero-stage">
      {stage && (
        <FlyProvider container={stage} size={58} sleepAfter={0}>
          <Bridge controller={controller} view={view} />
          <div className="lp-stage-left" ref={view}>
            <div className="lp-chips" role="group" aria-label="Try a job">
              {SCENARIOS.map((s) => <button key={s.id} type="button" className="ff-chip" aria-pressed={active === s.goal} title={s.blurb} onClick={() => { setActive(s.goal); controller.start(s.goal); }}>{s.label}</button>)}
            </div>
            <MockBrowserView browser={controller.browser} height="clamp(280px, 62vw, 440px)" />
            <p className="lp-caption">A sample browser. The fly lands beside the real element before each action. Nothing here is recorded.</p>
          </div>
          <div className="lp-stage-panel"><SidePanel controller={controller} /></div>
        </FlyProvider>)}
    </div>
  );
}

export function Hero() {
  return (
    <section id="top" className="lp-hero" aria-labelledby="hero-h">
      <div className="lp-wrap">
        <div className="lp-hero-copy">
          <motion.p className="lp-eyebrow" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }}>A browser agent for Chrome</motion.p>
          <motion.h1 id="hero-h" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .05, ease: [.3, 0, 0, 1] }}>
            A small fly that <em>does your errands.</em>
          </motion.h1>
          <motion.p className="lp-sub" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .15, ease: [.3, 0, 0, 1] }}>
            FruitFly browses for you, asks before anything risky, and knows your documents without sending them anywhere. Watch it work below. Nothing is mocked except the websites.
          </motion.p>
          <motion.div className="lp-actions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, delay: .25, ease: [.3, 0, 0, 1] }}>
            <a className="ff-btn ff-btn--primary lp-cta" href="#install">Add to Chrome</a>
            <a className="ff-btn lp-cta" href="#demo" onClick={() => window.dispatchEvent(new CustomEvent('ff:run', { detail: SCENARIOS[0]!.goal }))}>Watch a job run</a>
          </motion.div>
        </div>
        <Reveal><div id="demo"><LiveDemo /></div></Reveal>
      </div>
    </section>
  );
}
