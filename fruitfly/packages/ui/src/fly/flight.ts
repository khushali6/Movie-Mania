import { type Vec, add, sub, mul, len, norm, quadBezier, quadBezierTangent, clamp, lerp, smoothstep, dist } from './math';

export type FlightStyle = 'glide' | 'dart' | 'hop' | 'carry';

export interface FlightPlan {
  p0: Vec;
  p1: Vec;
  c: Vec;
  style: FlightStyle;
  /** seconds of anticipation pull-back before liftoff */
  anticipation: number;
  /** seconds in the moving phase (accel + cruise + decel) */
  travel: number;
  /** unit vector of the pull-back direction (opposite to travel) */
  back: Vec;
  /** seconds elapsed in this plan */
  t: number;
  /** curve bend direction sign, for banking */
  bend: number;
  distance: number;
}

/** Duration scales with distance (300–1200 ms per the motion spec), darts are quicker. */
export function flightDuration(distance: number, style: FlightStyle, speed = 1): number {
  const base = style === 'dart' ? 0.22 + distance * 0.00055 : style === 'hop' ? 0.28 : 0.34 + distance * 0.00135;
  return clamp(base, style === 'dart' ? 0.18 : 0.28, style === 'dart' ? 0.55 : 1.25) / speed;
}

export function planFlight(p0: Vec, p1: Vec, style: FlightStyle, opts: { speed?: number; bendSign?: number; bendAmount?: number } = {}): FlightPlan {
  const d = dist(p0, p1);
  const dir = d < 0.001 ? { x: 1, y: 0 } : norm(sub(p1, p0));
  const sign = opts.bendSign ?? 1;
  // Long distances curve; the control point is offset perpendicular to the straight line.
  const bendAmt = (opts.bendAmount ?? clamp(d * (style === 'dart' ? 0.12 : 0.22), 0, 140)) * sign;
  const mid = add(p0, mul(sub(p1, p0), 0.5));
  const perp = { x: -dir.y, y: dir.x };
  const c = add(mid, mul(perp, bendAmt));
  const speed = opts.speed ?? 1;
  return {
    p0, p1, c, style,
    anticipation: (style === 'dart' ? 0.05 : style === 'hop' ? 0.06 : 0.09) / speed,
    travel: flightDuration(d, style, speed),
    back: mul(dir, -1),
    t: 0, bend: Math.sign(bendAmt) || 1, distance: d,
  };
}

/**
 * Speed profile: accelerate → cruise → decelerate, mapped to path progress s∈[0,1].
 * Acceleration phase is shorter than deceleration so the fly "brakes" into the target.
 */
export function progress(u: number): number {
  const x = clamp(u, 0, 1);
  const a = 0.28, d = 0.38; // fractions of time spent accelerating / decelerating
  const cruise = 1 - a - d;
  // speed (units of s per u) piecewise: ramp up, flat, ramp down; integrate analytically.
  const vmax = 1 / (a / 2 + cruise + d / 2);
  if (x < a) return (vmax * x * x) / (2 * a);
  if (x < a + cruise) return (vmax * a) / 2 + vmax * (x - a);
  const r = x - a - cruise;
  return (vmax * a) / 2 + vmax * cruise + vmax * (r - (r * r) / (2 * d));
}

export interface FlightSample {
  pos: Vec;
  vel: Vec;      // px/s
  phase: 'anticipate' | 'travel' | 'done';
  /** 0..1 how much throttle (wing effort) the fly is applying */
  thrust: number;
}

export function sampleFlight(plan: FlightPlan): FlightSample {
  const { t, anticipation, travel } = plan;
  if (t < anticipation) {
    const k = t / anticipation;
    // pull back opposite to travel, ease-out so it feels like a coil
    const pull = Math.sin(k * Math.PI * 0.5) * Math.min(7, 2 + plan.distance * 0.02);
    return { pos: add(plan.p0, mul(plan.back, pull)), vel: mul(plan.back, -pull * 2), phase: 'anticipate', thrust: 0.35 + 0.4 * k };
  }
  const u = (t - anticipation) / travel;
  if (u >= 1) return { pos: plan.p1, vel: { x: 0, y: 0 }, phase: 'done', thrust: 0.2 };
  const s = progress(u);
  const pos = quadBezier(plan.p0, plan.c, plan.p1, s);
  // numeric derivative of the progress for velocity
  const eps = 0.01;
  const s2 = progress(Math.min(1, u + eps));
  const tan = quadBezierTangent(plan.p0, plan.c, plan.p1, s);
  const ds = (s2 - s) / (eps * travel);
  const vel = mul(tan, ds);
  const speed = len(vel);
  const peak = Math.max(1, plan.distance / travel);
  return { pos, vel, phase: 'travel', thrust: clamp(0.5 + (speed / peak) * 0.5, 0, 1.2) };
}

export const lerpPlanTarget = (plan: FlightPlan, p1: Vec): FlightPlan => ({ ...plan, p1, distance: dist(plan.p0, p1) });
export { lerp, smoothstep };
