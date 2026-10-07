import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { AlertTriangle, Check, ChevronRight, Info, X } from 'lucide-react';
import { createContext, forwardRef, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { dur, ease, spring } from '../motion';
import { usePrefersReducedMotion } from '../fly/hooks';

export const cx = (...a: (string | false | null | undefined)[]): string => a.filter(Boolean).join(' ');

/* ───────── Button ───────── */
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode; arrow?: boolean }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = 'secondary', size = 'md', loading, icon, arrow, className, children, onPointerMove, ...rest }, ref) {
  const move = (e: React.PointerEvent<HTMLButtonElement>) => { const r = e.currentTarget.getBoundingClientRect(); e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`); e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`); onPointerMove?.(e); };
  return (
    <button ref={ref} type="button" className={cx('ff-btn', `ff-btn--${variant}`, size !== 'md' && `ff-btn--${size}`, className)} data-loading={loading || undefined} aria-busy={loading || undefined} onPointerMove={variant === 'primary' ? move : onPointerMove} {...rest} disabled={rest.disabled || loading}>
      {variant === 'primary' && <span className="ff-glow" aria-hidden />}
      {loading ? <span className="ff-spin" aria-hidden /> : icon}
      {children}
      {arrow && <ChevronRight className="ff-btn-arrow" aria-hidden />}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string }>(function IconButton({ label, className, children, ...rest }, ref) {
  return <Tooltip label={label}><button ref={ref} type="button" className={cx('ff-iconbtn', className)} aria-label={label} {...rest}>{children}</button></Tooltip>;
});

export const Kbd = ({ children }: { children: ReactNode }) => <kbd className="ff-kbd">{children}</kbd>;
export const Badge = ({ tone, icon, children }: { tone?: 'honey' | 'lime' | 'plum' | 'danger'; icon?: ReactNode; children: ReactNode }) => <span className={cx('ff-badge', tone && `ff-badge--${tone}`)}>{icon}{children}</span>;
export const Card = ({ raised, className, children, ...r }: { raised?: boolean; className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) => <div className={cx('ff-card', raised && 'ff-card--raised', className)} {...r}>{children}</div>;
export const Skeleton = ({ w = '100%', h = 14, r }: { w?: number | string; h?: number; r?: number }) => <div className="ff-skel" style={{ width: w, height: h, borderRadius: r }} aria-hidden />;

/* ───────── Inputs ───────── */
export function Field({ label, hint, error, children }: { label?: string; hint?: string; error?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="ff-field">{label && <label className="ff-label" htmlFor={id}>{label}</label>}{children(id)}{error ? <span className="ff-error-text" role="alert">{error}</span> : hint ? <span className="ff-hint">{hint}</span> : null}</div>;
}
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...r }, ref) { return <input ref={ref} className={cx('ff-input', className)} {...r} />; });
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...r }, ref) { return <textarea ref={ref} className={cx('ff-textarea', className)} {...r} />; });
export function Select({ value, onChange, options, label, ...r }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string } & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'>) {
  return <select className="ff-select" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} {...r}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}
export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="ff-toggle" disabled={disabled} onClick={() => onChange(!checked)}>
      <motion.span className="ff-toggle-thumb" layout transition={spring.ui} />
    </button>
  );
}
export function Slider({ value, min, max, step = 1, onChange, label }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string }) {
  return <input className="ff-slider" type="range" aria-label={label} value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} />;
}
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return <div className="ff-seg-ctl" role="group" aria-label={label}>{options.map((o) => <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>)}</div>;
}

/* ───────── Progress ───────── */
export function Progress({ value, label }: { value: number; label: string }) {
  return <div className="ff-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}><motion.i animate={{ scaleX: Math.max(0.02, Math.min(1, value)) }} initial={false} transition={spring.ui} style={{ width: '100%' }} /></div>;
}
export function ProgressRing({ value, size = 22, stroke = 3, label }: { value: number; size?: number; stroke?: number; label: string }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  return (
    <svg className="ff-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="progressbar" aria-label={label} aria-valuenow={Math.round(value * 100)} aria-valuemin={0} aria-valuemax={100}>
      <circle className="ff-ring-bg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} /><circle className="ff-ring-fg" cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, value)))} />
    </svg>
  );
}

/* ───────── Tooltip ───────── */
export function Tooltip({ label, children }: { label: string; children: React.ReactElement }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const id = useId(); const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (el: Element) => { if (t.current) clearTimeout(t.current); t.current = setTimeout(() => { const r = el.getBoundingClientRect(); setPos({ x: r.left + r.width / 2, y: r.bottom + 8 }); }, 350); };
  const hide = () => { if (t.current) clearTimeout(t.current); setPos(null); };
  const child = children as React.ReactElement<Record<string, unknown>>;
  return (
    <>
      {React.cloneElement(child, { 'aria-describedby': pos ? id : undefined, onMouseEnter: (e: React.MouseEvent) => { show(e.currentTarget); (child.props.onMouseEnter as ((e: React.MouseEvent) => void) | undefined)?.(e); }, onMouseLeave: hide, onFocus: (e: React.FocusEvent) => show(e.currentTarget), onBlur: hide })}
      {typeof document !== 'undefined' && createPortal(<AnimatePresence>{pos && <motion.div id={id} role="tooltip" className="ff-tip" style={{ left: pos.x, top: pos.y, translateX: '-50%' }} initial={{ opacity: 0, y: -3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: dur.fast, ease: ease.standard }}>{label}</motion.div>}</AnimatePresence>, document.body)}
    </>
  );
}
import React from 'react';

/* ───────── Popover / Menu ───────── */
export function Popover({ trigger, children, align = 'right', label }: { trigger: (p: { open: boolean; toggle: () => void; ref: React.RefObject<HTMLButtonElement | null> }) => ReactNode; children: (close: () => void) => ReactNode; align?: 'left' | 'right'; label?: string }) {
  const [open, setOpen] = useState(false); const wrap = useRef<HTMLDivElement>(null); const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus(); } };
    document.addEventListener('pointerdown', down); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const reduced = usePrefersReducedMotion();
  return (
    <div ref={wrap} style={{ position: 'relative', display: 'inline-flex' }}>
      {trigger({ open, toggle: () => setOpen((o) => !o), ref: btn })}
      <AnimatePresence>
        {open && <motion.div role="dialog" aria-label={label} className="ff-pop" style={{ top: 'calc(100% + 6px)', [align]: 0, transformOrigin: align === 'right' ? 'top right' : 'top left' }} initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }} transition={{ duration: dur.fast, ease: ease.standard }}>{children(() => setOpen(false))}</motion.div>}
      </AnimatePresence>
    </div>
  );
}
export const MenuItem = ({ icon, children, ...r }: { icon?: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" className="ff-menu-item" role="menuitem" {...r}>{icon}{children}</button>;
export const MenuSep = () => <div className="ff-menu-sep" role="separator" />;

/* ───────── focus trap + Dialog + Sheet ───────── */
export function useFocusTrap(ref: React.RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active || !ref.current) return;
    const el = ref.current; const prev = document.activeElement as HTMLElement | null;
    const focusables = () => [...el.querySelectorAll<HTMLElement>('button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])')].filter((n) => n.offsetParent !== null || n === document.activeElement);
    (el.querySelector<HTMLElement>('[data-autofocus]') ?? focusables()[0] ?? el).focus();
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = focusables(); if (!f.length) { e.preventDefault(); return; }
      const first = f[0]!, last = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    el.addEventListener('keydown', key);
    return () => { el.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [ref, active]);
}

export function Dialog({ open, onClose, title, children, description, wide }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null); const reduced = usePrefersReducedMotion(); const tid = useId();
  useFocusTrap(ref, open);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [open, onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>{open && (<>
      <motion.div key="scrim" className="ff-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: dur.base }} />
      <motion.div key="dlg" ref={ref} role="dialog" aria-modal="true" aria-labelledby={tid} className="ff-dialog" style={{ x: '-50%', y: '-50%', width: wide ? 'min(620px, calc(100vw - 32px))' : undefined }} tabIndex={-1} initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }} transition={reduced ? { duration: dur.instant } : spring.ui}>
        <h2 id={tid}>{title}</h2>{description && <p className="ff-muted" style={{ margin: '0 0 14px', fontSize: 13.5 }}>{description}</p>}{children}
      </motion.div></>)}</AnimatePresence>, document.body);
}
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null); const reduced = usePrefersReducedMotion(); useFocusTrap(ref, open);
  useEffect(() => { if (!open) return; const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k); }, [open, onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(<AnimatePresence>{open && (<>
    <motion.div key="s" className="ff-scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
    <motion.div key="sh" ref={ref} role="dialog" aria-modal="true" aria-label={title} className="ff-sheet" tabIndex={-1} initial={reduced ? { opacity: 0 } : { y: '100%' }} animate={reduced ? { opacity: 1 } : { y: 0 }} exit={reduced ? { opacity: 0 } : { y: '100%' }} transition={reduced ? { duration: dur.instant } : spring.panel}>{children}</motion.div></>)}</AnimatePresence>, document.body);
}

/* ───────── Toasts ───────── */
interface ToastItem { id: number; text: string; action?: { label: string; run: () => void } }
const ToastCtx = createContext<{ push: (t: Omit<ToastItem, 'id'>) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]); const seq = useRef(0);
  const push = useCallback((t: Omit<ToastItem, 'id'>) => { const id = ++seq.current; setItems((l) => [...l, { ...t, id }].slice(-3)); setTimeout(() => setItems((l) => l.filter((x) => x.id !== id)), 4200); }, []);
  const v = useMemo(() => ({ push }), [push]);
  return (
    <ToastCtx.Provider value={v}>{children}
      <div className="ff-toasts" role="status" aria-live="polite"><AnimatePresence initial={false}>{items.map((t) => (
        <motion.div key={t.id} layout className="ff-toast" initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 6 }} transition={spring.ui}>
          <span>{t.text}</span>{t.action && <button onClick={t.action.run}>{t.action.label}</button>}
        </motion.div>))}</AnimatePresence></div>
    </ToastCtx.Provider>
  );
}

/* ───────── Tabs ───────── */
export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; icon?: ReactNode }[]; label: string }) {
  const gid = useId(); const reduced = usePrefersReducedMotion();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const onKey = (e: React.KeyboardEvent) => { const i = tabs.findIndex((t) => t.value === value); if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]!; onChange(n.value); refs.current[n.value]?.focus(); } };
  return (
    <LayoutGroup id={gid}>
      <div className="ff-tabs" role="tablist" aria-label={label} onKeyDown={onKey}>
        {tabs.map((t) => (
          <button key={t.value} ref={(el) => { refs.current[t.value] = el; }} role="tab" type="button" className="ff-tab" aria-selected={t.value === value} tabIndex={t.value === value ? 0 : -1} onClick={() => onChange(t.value)}>
            {t.value === value && <motion.span layoutId="pill" className="ff-tab-pill" transition={reduced ? { duration: 0 } : spring.ui} />}{t.icon}{t.label}
          </button>))}
      </div>
    </LayoutGroup>
  );
}

/* ───────── Empty / Error / Callout ───────── */
export function EmptyState({ art, title, body, action }: { art?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return <div className="ff-empty">{art}<h3>{title}</h3>{body && <p>{body}</p>}{action}</div>;
}
export function Callout({ tone = 'info', title, children, action }: { tone?: 'info' | 'warn' | 'danger'; title?: string; children?: ReactNode; action?: ReactNode }) {
  const Icon = tone === 'danger' || tone === 'warn' ? AlertTriangle : Info;
  return <div className={`ff-callout ff-callout--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}><Icon aria-hidden /><div>{title && <b>{title}</b>}{children}{action}</div></div>;
}
export function ErrorState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) { return <Callout tone="danger" title={title} action={action}>{body}</Callout>; }
export const CheckRow = ({ state, children }: { state: 'idle' | 'ok' | 'fail'; children: ReactNode }) => (
  <div className="ff-check" data-s={state}><i>{state === 'ok' ? <Check aria-hidden /> : state === 'fail' ? <X aria-hidden /> : null}</i><span>{children}</span></div>
);
export { useLayoutEffect };
