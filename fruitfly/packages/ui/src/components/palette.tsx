import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { dur, spring } from '../motion';
import { usePrefersReducedMotion } from '../fly/hooks';
import { useFocusTrap } from './primitives';

export interface PaletteItem { id: string; label: string; hint?: string; icon?: ReactNode; run: () => void }
export function CommandPalette({ open, onClose, items }: { open: boolean; onClose: () => void; items: PaletteItem[] }) {
  const [q, setQ] = useState(''); const [sel, setSel] = useState(0); const ref = useRef<HTMLDivElement>(null); const reduced = usePrefersReducedMotion();
  useFocusTrap(ref, open);
  const list = useMemo(() => { const t = q.toLowerCase().trim(); return t ? items.filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(t)) : items; }, [q, items]);
  useEffect(() => { setSel(0); }, [q]); useEffect(() => { if (open) setQ(''); }, [open]);
  if (typeof document === 'undefined') return null;
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => (s + 1) % Math.max(1, list.length)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => (s - 1 + list.length) % Math.max(1, list.length)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = list[sel]; if (it) { onClose(); it.run(); } }
  };
  return createPortal(<AnimatePresence>{open && (<>
    <motion.div className="ff-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.fast }} />
    <motion.div ref={ref} role="dialog" aria-modal="true" aria-label="Command palette" className="ff-palette" style={{ x: '-50%' }} onKeyDown={key} initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={reduced ? { duration: dur.instant } : spring.ui}>
      <input data-autofocus placeholder="Type a command" aria-label="Command" value={q} onChange={(e) => setQ(e.target.value)} role="combobox" aria-expanded aria-controls="ff-pal-list" aria-activedescendant={list[sel] ? `pal-${list[sel]!.id}` : undefined} />
      <ul id="ff-pal-list" role="listbox">{list.map((i, n) => <li key={i.id} role="presentation"><button id={`pal-${i.id}`} role="option" aria-selected={n === sel} type="button" onMouseEnter={() => setSel(n)} onClick={() => { onClose(); i.run(); }}>{i.icon}<span style={{ flex: 1 }}>{i.label}</span>{i.hint && <span className="ff-muted" style={{ fontSize: 12 }}>{i.hint}</span>}</button></li>)}{list.length === 0 && <li className="ff-muted" style={{ padding: 14, fontSize: 13 }}>Nothing matches.</li>}</ul>
    </motion.div></>)}</AnimatePresence>, document.body);
}
