import { useEffect, useState } from 'react';
import { defaultSettings, loadSettings, onSettings, type Settings } from '../shared/settings';

/** Settings + theme applied to the document. */
export function useSettings(): Settings {
  const [s, setS] = useState<Settings>(defaultSettings());
  useEffect(() => { void loadSettings().then(setS); return onSettings(setS); }, []);
  useEffect(() => { const r = document.documentElement; if (s.ui.theme === 'auto') r.removeAttribute('data-theme'); else r.setAttribute('data-theme', s.ui.theme); }, [s.ui.theme]);
  return s;
}
export const reducedFrom = (s: Settings): boolean | undefined => (s.ui.reducedMotion === 'on' ? true : s.ui.reducedMotion === 'off' ? false : undefined);
