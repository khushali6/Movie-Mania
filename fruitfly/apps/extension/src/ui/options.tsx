import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, Cpu, History as HistoryIcon, Settings as Cog, Shield, SlidersHorizontal, Info } from 'lucide-react';
import { ProceduralFly, ToastProvider } from '@fruitfly/ui';
import '@fruitfly/ui/styles/components.css';
import { useSettings } from './useSettings';
import { General } from './options/General';
import { Models } from './options/Models';
import { Privacy } from './options/Privacy';
import { PantryPage } from './options/PantryPage';
import { History } from './options/History';
import { Advanced } from './options/Advanced';
import { About } from './options/About';

const PAGES = [['general', 'General', Cog], ['models', 'Models', Cpu], ['privacy', 'Privacy', Shield], ['pantry', 'Pantry', BookOpen], ['history', 'History', HistoryIcon], ['advanced', 'Advanced', SlidersHorizontal], ['about', 'About', Info]] as const;
const parse = () => { const [, p = 'general', arg] = location.hash.split('/'); return { page: (PAGES.find(([k]) => k === p)?.[0] ?? 'general') as (typeof PAGES)[number][0], arg }; };

function App() {
  const s = useSettings(); const [route, setRoute] = useState(parse());
  useEffect(() => { const h = () => setRoute(parse()); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  const css = `.opt{display:grid;grid-template-columns:220px minmax(0,1fr);gap:28px;max-width:1040px;margin:0 auto;padding:28px 24px 80px}.opt nav{position:sticky;top:24px;align-self:start;display:grid;gap:3px}.opt nav a{display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:10px;color:var(--muted);text-decoration:none;font:500 13.5px var(--font-ui)}.opt nav a:hover{background:var(--sunken);color:var(--ink)}.opt nav a[aria-current=page]{background:var(--raised);color:var(--ink);box-shadow:var(--shadow-1)}.opt nav svg{width:16px;height:16px;stroke-width:1.5}.opt h1{font:600 28px var(--font-display);letter-spacing:-.02em;margin:0 0 16px}@media(max-width:760px){.opt{grid-template-columns:1fr}.opt nav{position:static;grid-auto-flow:column;overflow:auto}}`;
  const title = PAGES.find(([k]) => k === route.page)![1];
  return (
    <ToastProvider>
      <div className="ff-root" style={{ minHeight: '100%' }}>
        <style>{css}</style>
        <div className="opt">
          <nav aria-label="Settings"><div className="ff-row" style={{ padding: '0 12px 14px' }}><ProceduralFly size={36} mood="idle" label="FruitFly" /><span className="ff-wordmark">FruitFly</span></div>{PAGES.map(([k, l, I]) => <a key={k} href={`#/${k}`} aria-current={route.page === k ? 'page' : undefined}><I aria-hidden />{l}</a>)}</nav>
          <main><h1>{title}</h1>
            {route.page === 'general' && <General s={s} />}{route.page === 'models' && <Models s={s} />}{route.page === 'privacy' && <Privacy s={s} />}{route.page === 'pantry' && <PantryPage s={s} />}
            {route.page === 'history' && <History selected={route.arg} />}{route.page === 'advanced' && <Advanced s={s} />}{route.page === 'about' && <About />}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
