import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fruitfly/ui/styles/components.css';
import { OnboardingFlow, type OnboardingResult } from '@fruitfly/demo';
import { updateSettings } from '../shared/settings';
import { useSettings } from './useSettings';

function App() {
  useSettings();
  const finish = async (r: OnboardingResult | null) => {
    await updateSettings((s) => ({ ...s, onboarded: true, mode: 'demo' }));
    const to = r?.brain === 'gateway' || r?.brain === 'key' ? 'models' : r?.pantry === 'documents' || r?.pantry === 'about' ? 'pantry' : null;
    if (to) await chrome.tabs.create({ url: chrome.runtime.getURL(`options.html#/${to}`) });
    try { const w = await chrome.windows.getCurrent(); await chrome.sidePanel.open({ windowId: w.id! }); } catch { /* needs a gesture; the toolbar button works */ }
    window.close();
  };
  return <OnboardingFlow onFinish={(r) => void finish(r)} onSkip={() => void finish(null)} />;
}
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
