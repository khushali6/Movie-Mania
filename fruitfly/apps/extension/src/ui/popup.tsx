import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PanelRightOpen, Settings as Cog } from 'lucide-react';
import { Button, ProceduralFly, StatusChip } from '@fruitfly/ui';
import '@fruitfly/ui/styles/components.css';
import { useSettings } from './useSettings';
import { isLiveConfigured } from '../shared/routes';

function App() {
  const s = useSettings(); const [text, setText] = useState(''); const [running, setRunning] = useState(false);
  useEffect(() => { const p = chrome.runtime.connect({ name: 'panel' }); p.onMessage.addListener((m: { kind?: string; running?: boolean }) => { if (m.kind === 'hello') setRunning(!!m.running); }); return () => p.disconnect(); }, []);
  const openPanel = async () => { const w = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: w.id! }); };
  const go = async () => {
    const t = text.trim(); if (!t) return;
    await openPanel();                      // user gesture: opens the side panel
    setTimeout(() => void chrome.runtime.sendMessage({ ff: 'command', command: { cmd: 'start_task', goal: t, mode: s.mode } }), 350);
    window.close();
  };
  return (
    <div className="ff-root" style={{ width: 340, padding: 14, display: 'grid', gap: 12 }}>
      <div className="ff-row"><ProceduralFly size={44} mood={running ? 'thinking' : 'greeting'} label="FruitFly" followCursor /><div style={{ flex: 1 }}><div className="ff-wordmark">FruitFly</div><span className="ff-route">{s.mode === 'demo' ? 'Demo mode' : isLiveConfigured(s) ? 'Ready' : 'No model yet'}</span></div><StatusChip status={running ? 'working' : 'idle'} /></div>
      <form onSubmit={(e) => { e.preventDefault(); void go(); }} className="ff-composer" style={{ padding: 10 }}>
        <textarea rows={2} autoFocus placeholder="What should I do?" aria-label="Tell FruitFly what to do" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void go(); } }} />
        <div className="ff-composer-row"><span className="ff-muted" style={{ fontSize: 11.5 }}>Opens in the side panel</span><span className="ff-spacer" /><Button type="submit" variant="primary" size="sm" disabled={!text.trim()}>Go</Button></div>
      </form>
      {s.savedTasks.length > 0 && <div className="ff-chips" aria-label="Saved tasks">{s.savedTasks.slice(0, 4).map((t) => <button key={t.id} className="ff-chip" onClick={() => setText(t.goal)}>{t.name}</button>)}</div>}
      <div className="ff-row"><Button size="sm" icon={<PanelRightOpen />} onClick={() => void openPanel().then(() => window.close())}>Open side panel</Button><span className="ff-spacer" /><Button size="sm" variant="ghost" icon={<Cog />} onClick={() => void chrome.runtime.openOptionsPage()}>Settings</Button></div>
    </div>
  );
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
