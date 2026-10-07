import { useEffect, useMemo, useRef, useState } from 'react';
import { FlyProvider, SidePanel, useFly } from '@fruitfly/ui';
import { DemoPanelController, MockBrowserView, SCENARIOS } from '@fruitfly/demo';

function Bridge({ controller, view }: { controller: DemoPanelController; view: React.RefObject<HTMLDivElement | null> }) {
  const fly = useFly();
  useEffect(() => { controller.attachFly(fly); controller.attachView(view.current); return () => controller.attachFly(null); }, [controller, fly, view]);
  return null;
}

export function PanelPage() {
  const [stage, setStage] = useState<HTMLElement | null>(null);
  const controller = useMemo(() => new DemoPanelController({ thinkMs: 520 }), []);
  const [, force] = useState(0); const view = useRef<HTMLDivElement>(null);
  const [failover, setFailover] = useState(false);
  useEffect(() => controller.onBrowser(() => force((n) => n + 1)), [controller]);
  controller.options.failoverDemo = failover; controller.options.rateLimitAtCall = failover ? 3 : undefined;
  return (
    <>
      <h2>Side panel with a live scripted run</h2>
      <p className="sub">The real agent loop, router, context layer and Pantry, driven by a scripted model against a mock browser. Pick a job, or type one. Nothing leaves this page.</p>
      <div className="panel-stage" ref={setStage} data-testid="panel-stage">
        {stage && (
          <FlyProvider container={stage} size={58} sleepAfter={0}>
            <Bridge controller={controller} view={view} />
            <div ref={view} style={{ display: 'grid', gap: 14, alignContent: 'start' }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} role="group" aria-label="Sample jobs">
                {SCENARIOS.map((s) => <button key={s.id} className="ff-chip" title={s.blurb} onClick={() => controller.start(s.goal)}>{s.label}</button>)}
                <label className="ff-row ff-hint" style={{ marginLeft: 'auto', gap: 8 }}>Simulate a rate limit <input type="checkbox" checked={failover} onChange={(e) => setFailover(e.target.checked)} /></label>
              </div>
              <MockBrowserView browser={controller.browser} height={430} />
              <div className="ff-hint">This is a mock browser. The fly lands beside the real element before each action.</div>
            </div>
            <div className="panel-frame"><SidePanel controller={controller} /></div>
          </FlyProvider>)}
      </div>
    </>
  );
}
