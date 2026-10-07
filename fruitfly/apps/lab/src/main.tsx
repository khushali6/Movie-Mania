import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ticker } from '@fruitfly/ui';
import './lab.css';
import { Moods } from './pages/Moods';
import { PanelPage } from './pages/PanelPage';
import { ComponentsPage } from './pages/ComponentsPage';
import { FinalTest } from './pages/FinalTest';

const PAGES = [['moods', 'Moods'], ['panel', 'Side panel'], ['components', 'Components'], ['test', 'Character test']] as const;
type Page = (typeof PAGES)[number][0];
const read = (): Page => (PAGES.find(([k]) => location.hash.slice(2).startsWith(k))?.[0] ?? 'moods');

function Fps() {
  const [s, setS] = useState(ticker.getStats());
  useEffect(() => { const id = setInterval(() => setS({ ...ticker.getStats() }), 400); return () => clearInterval(id); }, []);
  return <div className="fps" data-testid="fps">{s.fps.toFixed(0)} fps · {s.avgMs.toFixed(1)} ms<br />worst {s.worstMs.toFixed(0)} ms · long {s.longFrames}</div>;
}

function App() {
  const [page, setPage] = useState<Page>(read());
  const [theme, setTheme] = useState<'auto' | 'light' | 'dark'>('auto');
  const [fps, setFps] = useState(true);
  useEffect(() => { const h = () => setPage(read()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  useEffect(() => { const r = document.documentElement; if (theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', theme); }, [theme]);
  return (
    <div className="lab ff-root" style={{ background: 'transparent' }}>
      <h1>Fly Lab</h1>
      <p className="sub">Every mood, every state, every component. The fly is one procedural SVG driven by a physics engine; nothing here is a GIF.</p>
      <div className="bar">
        <nav className="nav" aria-label="Lab pages">{PAGES.map(([k, l]) => <a key={k} href={`#/${k}`} aria-current={page === k ? 'page' : undefined}>{l}</a>)}</nav>
        <div className="ff-seg-ctl" role="group" aria-label="Theme">{(['auto', 'light', 'dark'] as const).map((t) => <button key={t} aria-pressed={theme === t} onClick={() => setTheme(t)}>{t}</button>)}</div>
        <button className="ff-btn ff-btn--sm" onClick={() => setFps((f) => !f)}>FPS overlay</button>
      </div>
      {page === 'moods' && <Moods />}
      {page === 'panel' && <PanelPage />}
      {page === 'components' && <ComponentsPage />}
      {page === 'test' && <FinalTest />}
      {fps && <Fps />}
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
