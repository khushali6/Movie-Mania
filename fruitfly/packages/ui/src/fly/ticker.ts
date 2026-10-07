/** One shared rAF loop for every fly on the page. Pauses when the tab is hidden or nobody listens. */
type Tick = (dt: number, now: number) => void;

export interface FrameStats { fps: number; worstMs: number; avgMs: number; longFrames: number; frames: number }

class Ticker {
  private subs = new Set<Tick>();
  private raf = 0;
  private last = 0;
  private running = false;
  private stats: FrameStats = { fps: 60, worstMs: 0, avgMs: 16.7, longFrames: 0, frames: 0 };
  private window: number[] = [];

  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.maybeStart()));
  }

  subscribe(fn: Tick): () => void {
    this.subs.add(fn);
    this.maybeStart();
    return () => { this.subs.delete(fn); if (!this.subs.size) this.stop(); };
  }

  getStats(): FrameStats { return this.stats; }
  resetStats(): void { this.stats = { fps: 60, worstMs: 0, avgMs: 16.7, longFrames: 0, frames: 0 }; this.window = []; }

  private maybeStart(): void {
    if (this.running || !this.subs.size || typeof requestAnimationFrame === 'undefined') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.running = true; this.last = 0;
    this.raf = requestAnimationFrame(this.loop);
  }
  private stop(): void { this.running = false; cancelAnimationFrame(this.raf); }

  private loop = (t: number): void => {
    if (!this.running) return;
    if (this.last) {
      const ms = t - this.last;
      const dt = Math.min(ms, 100) / 1000;
      const s = this.stats;
      s.frames++;
      s.worstMs = Math.max(s.worstMs * 0.995, ms);
      if (ms > 50) s.longFrames++;
      this.window.push(ms); if (this.window.length > 60) this.window.shift();
      s.avgMs = this.window.reduce((a, b) => a + b, 0) / this.window.length;
      s.fps = 1000 / s.avgMs;
      for (const fn of this.subs) fn(dt, t);
    }
    this.last = t;
    this.raf = requestAnimationFrame(this.loop);
  };
}

export const ticker = new Ticker();
