export interface Vec { x: number; y: number }
export const v = (x = 0, y = 0): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const mul = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a: Vec): Vec => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l }; };
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerpV = (a: Vec, b: Vec, t: number): Vec => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
export const smoothstep = (t: number): number => { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); };
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInCubic = (t: number): number => Math.pow(clamp(t, 0, 1), 3);
export const easeInOutCubic = (t: number): number => { const x = clamp(t, 0, 1); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const easeOutBack = (t: number, s = 1.2): number => { const x = clamp(t, 0, 1) - 1; return x * x * ((s + 1) * x + s) + 1; };

/** Frame-rate independent exponential smoothing. `halfLife` in seconds. */
export function damp(current: number, target: number, halfLife: number, dt: number): number {
  if (halfLife <= 0) return target;
  return target + (current - target) * Math.pow(0.5, dt / halfLife);
}
export function dampV(c: Vec, t: Vec, halfLife: number, dt: number): Vec {
  return { x: damp(c.x, t.x, halfLife, dt), y: damp(c.y, t.y, halfLife, dt) };
}

export interface Spring { x: number; v: number }
/** Semi-implicit Euler spring step, substepped for stability at large dt. */
export function springStep(s: Spring, target: number, stiffness: number, damping: number, dt: number): void {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -stiffness * (s.x - target) - damping * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
}

/** Damping ratio ζ → damping coefficient for unit mass. */
export const dampingFor = (stiffness: number, zeta: number): number => 2 * zeta * Math.sqrt(stiffness);

export function quadBezier(p0: Vec, c: Vec, p1: Vec, t: number): Vec {
  const u = 1 - t;
  return { x: u * u * p0.x + 2 * u * t * c.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p1.y };
}
export function quadBezierTangent(p0: Vec, c: Vec, p1: Vec, t: number): Vec {
  return { x: 2 * (1 - t) * (c.x - p0.x) + 2 * t * (p1.x - c.x), y: 2 * (1 - t) * (c.y - p0.y) + 2 * t * (p1.y - c.y) };
}
export const deg = (rad: number): number => (rad * 180) / Math.PI;
