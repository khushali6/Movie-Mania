import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { FlyProvider, SidePanel, useFly, useSession } from '@fruitfly/ui';
import '@fruitfly/ui/styles/components.css';
import { MockBrowserView } from '@fruitfly/demo';
import { ExtPanelController } from './panel-controller';
import { reducedFrom, useSettings } from './useSettings';

function DemoBrowser({ controller }: { controller: ExtPanelController }) {
  const fly = useFly(); const ref = useRef<HTMLDivElement>(null); const [, force] = useState(0);
  const s = useSession(controller.session);
  useEffect(() => { controller.demo.attachFly(fly); controller.demo.attachView(ref.current); return () => controller.demo.attachFly(null); }, [controller, fly]);
  useEffect(() => controller.demo.onBrowser(() => force((n) => n + 1)), [controller]);
  if (controller.settings?.mode !== 'demo' || !controller.demo.browser || !s.goal) return <div ref={ref} />;
  return <div ref={ref} style={{ margin: '0 0 12px' }}><MockBrowserView browser={controller.demo.browser} height={190} /><div className="ff-hint" style={{ marginTop: 4 }}>A mock browser, so you can watch how I work.</div></div>;
}

function App() {
  const controller = useMemo(() => new ExtPanelController(), []);
  const s = useSettings();
  return (
    <FlyProvider size={52} energy={s.ui.energy} sleepAfter={s.ui.sleepAfter} reducedMotion={reducedFrom(s)} entrance>
      <div style={{ height: '100%' }}><SidePanel controller={controller} taskExtra={<DemoBrowser controller={controller} />} /></div>
    </FlyProvider>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
