import type { ReactNode } from 'react';
import { updateSettings, type Settings } from '../../shared/settings';

export const set = (fn: (s: Settings) => Settings) => void updateSettings(fn);
export const send = <T = unknown,>(m: unknown): Promise<T> => chrome.runtime.sendMessage(m) as Promise<T>;
export function Section({ title, hint, children, id }: { title: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return <section id={id} className="ff-card" style={{ padding: 18, display: 'grid', gap: 14 }}><div><h2 style={{ margin: 0, font: '600 16px var(--font-ui)', letterSpacing: '-.01em' }}>{title}</h2>{hint && <div className="ff-hint" style={{ marginTop: 3, maxWidth: '68ch' }}>{hint}</div>}</div>{children}</section>;
}
export function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return <div className="ff-row" style={{ gap: 16, justifyContent: 'space-between', alignItems: 'center' }}><div style={{ minWidth: 0, maxWidth: '58ch' }}><div style={{ fontWeight: 500, fontSize: 13.5 }}>{label}</div>{hint && <div className="ff-hint">{hint}</div>}</div><div className="ff-row" style={{ flex: 'none' }}>{children}</div></div>;
}
export const download = (name: string, data: BlobPart, mime = 'application/json') => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: mime })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
export const fmtBytes = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);
