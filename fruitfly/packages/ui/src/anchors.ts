import type { Vec } from './fly/math';

export type AnchorSide = 'right' | 'left' | 'top' | 'bottom' | 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'center';
export interface AnchorConfig { side?: AnchorSide; gap?: number; dx?: number; dy?: number }

export const ANCHOR_IDS = [
  'composer', 'timeline-active-step', 'page-preview', 'result-card', 'approval-card', 'pantry-shelf',
  'context-meter', 'gateway-status', 'nectar-meter', 'subagent-lane', 'perch-default',
] as const;
export type AnchorId = (typeof ANCHOR_IDS)[number] | (string & {});

interface Entry { el: Element; cfg: AnchorConfig; rect: DOMRect | null }

const INTERACTIVE = 'button, a[href], input, textarea, select, summary, [role="button"], [role="menuitem"], [data-fly-avoid]';

/**
 * Central anchor registry. Components register elements; rects are cached and refreshed in a single
 * rAF batch (ResizeObserver + scroll + resize) so the fly never causes layout thrash.
 */
export class AnchorRegistry {
  private entries = new Map<string, Entry>();
  private listeners = new Set<() => void>();
  private dirty = false;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private attached = false;

  private attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    this.ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.invalidate()) : null;
    window.addEventListener('scroll', this.invalidate, { capture: true, passive: true });
    window.addEventListener('resize', this.invalidate, { passive: true });
  }

  readonly invalidate = (): void => {
    if (this.dirty) return;
    this.dirty = true;
    this.raf = requestAnimationFrame(() => this.flush());
  };

  private flush(): void {
    this.dirty = false;
    // reads only, in one batch
    for (const e of this.entries.values()) e.rect = e.el.getBoundingClientRect();
    this.listeners.forEach((l) => l());
  }

  register(id: string, el: Element, cfg: AnchorConfig = {}): () => void {
    this.attach();
    const entry: Entry = { el, cfg, rect: null };
    this.entries.set(id, entry);
    this.ro?.observe(el);
    this.invalidate();
    return () => {
      if (this.entries.get(id)?.el === el) this.entries.delete(id);
      this.ro?.unobserve(el);
      this.invalidate();
    };
  }

  has(id: string): boolean { return this.entries.has(id); }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  rect(id: string): DOMRect | null {
    const e = this.entries.get(id);
    if (!e) return null;
    if (!e.rect) e.rect = e.el.getBoundingClientRect();
    return e.rect;
  }

  /** Point *beside* the target, nudged away from interactive elements. */
  point(id: string, radius = 26): Vec | null {
    const e = this.entries.get(id);
    const r = this.rect(id);
    if (!e || !r) return null;
    const { side = 'right', gap = 18, dx = 0, dy = 0 } = e.cfg;
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let p: Vec;
    switch (side) {
      case 'left': p = { x: r.left - gap - radius, y: cy }; break;
      case 'top': p = { x: cx, y: r.top - gap - radius }; break;
      case 'bottom': p = { x: cx, y: r.bottom + gap + radius }; break;
      case 'top-right': p = { x: r.right - radius * 0.2, y: r.top - gap * 0.6 }; break;
      case 'top-left': p = { x: r.left + radius * 0.2, y: r.top - gap * 0.6 }; break;
      case 'bottom-right': p = { x: r.right - radius * 0.2, y: r.bottom + gap * 0.6 }; break;
      case 'bottom-left': p = { x: r.left + radius * 0.2, y: r.bottom + gap * 0.6 }; break;
      case 'center': p = { x: cx, y: cy }; break;
      default: p = { x: r.right + gap + radius, y: cy };
    }
    p = { x: p.x + dx, y: p.y + dy };
    return side === 'center' ? p : this.avoid(p, radius, e.el);
  }

  /** Collision guard: the fly never covers inputs, buttons or approval controls. */
  avoid(p: Vec, radius: number, ignore?: Element): Vec {
    if (typeof document === 'undefined') return p;
    const rects: DOMRect[] = [];
    document.querySelectorAll(INTERACTIVE).forEach((n) => {
      if (n === ignore || ignore?.contains(n) && ignore.matches('[data-fly-anchor-interior-ok]')) return;
      const q = n.getBoundingClientRect();
      if (q.width === 0 || q.height === 0) return;
      if (Math.abs(q.left + q.width / 2 - p.x) < 320 && Math.abs(q.top + q.height / 2 - p.y) < 320) rects.push(q);
    });
    const hits = (c: Vec) => rects.some((q) => c.x > q.left - radius * 0.7 && c.x < q.right + radius * 0.7 && c.y > q.top - radius * 0.7 && c.y < q.bottom + radius * 0.7);
    if (!hits(p)) return clampToViewport(p, radius);
    for (let ring = 1; ring <= 8; ring++) {
      const d = ring * (radius * 0.9);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const c = { x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d };
        if (!hits(c)) return clampToViewport(c, radius);
      }
    }
    return clampToViewport(p, radius);
  }
}

function clampToViewport(p: Vec, r: number): Vec {
  if (typeof window === 'undefined') return p;
  return { x: Math.min(Math.max(p.x, r), Math.max(r, window.innerWidth - r)), y: Math.min(Math.max(p.y, r), Math.max(r, window.innerHeight - r)) };
}

export const anchors = new AnchorRegistry();
