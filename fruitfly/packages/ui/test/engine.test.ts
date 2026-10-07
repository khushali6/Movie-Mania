import { describe, expect, it } from 'vitest';
import { FLY_MOODS } from '@fruitfly/core';
import { FlyEngine } from '../src/fly/engine';
import { dist } from '../src/fly/math';

const DT = 1 / 60;
function run(e: FlyEngine, seconds: number, each?: (e: FlyEngine) => void) {
  const n = Math.round(seconds / DT);
  let maxStep = 0; let last = e.position;
  for (let i = 0; i < n; i++) {
    e.step(DT); each?.(e);
    const p = e.position; maxStep = Math.max(maxStep, dist(p, last)); last = p;
  }
  return { maxStep };
}

describe('FlyEngine', () => {
  it('flies to a target without teleporting and settles on it', () => {
    const e = new FlyEngine({ seed: 1, start: { x: 40, y: 40 } });
    let arrived = false;
    e.on('arrived', () => (arrived = true));
    e.flyTo({ x: 520, y: 300 });
    const { maxStep } = run(e, 3);
    expect(arrived).toBe(true);
    expect(maxStep).toBeLessThan(30); // 1800px/s at 60fps would be 30px: never a teleport
    // hover wander is bounded, so the fly should be near the perch
    expect(dist(e.position, { x: 520, y: 300 })).toBeLessThan(30);
  });

  it('overshoots slightly then settles (follow-through, not a linear stop)', () => {
    const e = new FlyEngine({ seed: 3, start: { x: 0, y: 200 } });
    // zero wander so we only see the landing dynamics
    e.setEnergy('calm'); e.setSleepAfter(0);
    e.flyTo({ x: 600, y: 200 }, { style: 'glide', look: null });
    let maxX = 0;
    run(e, 3, (en) => (maxX = Math.max(maxX, en.position.x)));
    expect(maxX).toBeGreaterThan(600 - 2);
    expect(maxX).toBeLessThan(600 + 600 * 0.15);
  });

  it('is deterministic for the same seed and differs between seeds', () => {
    const a = new FlyEngine({ seed: 9 }), b = new FlyEngine({ seed: 9 }), c = new FlyEngine({ seed: 10 });
    run(a, 5); run(b, 5); run(c, 5);
    expect(a.position).toEqual(b.position);
    expect(a.position).not.toEqual(c.position);
  });

  it('every mood can be entered, stays finite and bounded', () => {
    for (const mood of FLY_MOODS) {
      const e = new FlyEngine({ seed: 2, start: { x: 200, y: 200 }, bounds: () => ({ w: 800, h: 600 }), sleepAfter: 0 });
      e.setCursor({ x: 260, y: 240 });
      e.setMood(mood, { force: true });
      run(e, 6);
      const f = e.frame;
      for (const k of ['x', 'y', 'rot', 'facing', 'sx', 'sy', 'headRot', 'pupilX', 'pupilY', 'wingHz', 'wingAmp', 'legRaise', 'glow', 'lid'] as const) {
        expect(Number.isFinite(f[k]), `${mood}.${k}`).toBe(true);
      }
      expect(f.x).toBeGreaterThan(0); expect(f.x).toBeLessThan(800);
      expect(f.y).toBeGreaterThan(0); expect(f.y).toBeLessThan(600);
      expect(Math.abs(f.pupilX)).toBeLessThanOrEqual(1.5);
    }
  });

  it('respects mood dwell time and flushes the pending mood afterwards', () => {
    const e = new FlyEngine({ seed: 4, sleepAfter: 0 });
    e.setMood('success', { force: true });
    e.setMood('idle');
    run(e, 0.5);
    expect(e.mood).toBe('success');
    run(e, 2);
    expect(e.mood).toBe('idle');
  });

  it('error and asking pre-empt a held mood immediately', () => {
    const e = new FlyEngine({ seed: 4, sleepAfter: 0 });
    e.setMood('success', { force: true });
    run(e, 0.1);
    e.setMood('asking');
    expect(e.mood).toBe('asking');
  });

  it('halt() decelerates smoothly without snapping', () => {
    const e = new FlyEngine({ seed: 5, start: { x: 0, y: 100 } });
    e.flyTo({ x: 900, y: 100 }, { style: 'glide' });
    run(e, 0.45);
    const before = e.position;
    e.halt();
    const { maxStep } = run(e, 1.5);
    expect(maxStep).toBeLessThan(25);
    expect(e.mood).toBe('idle');
    expect(dist(e.position, before)).toBeLessThan(260);
  });

  it('reduced motion fades instead of flying, with no wing blur or sparks', () => {
    const e = new FlyEngine({ seed: 6, reducedMotion: true, start: { x: 10, y: 10 } });
    e.flyTo({ x: 400, y: 300 });
    let minOpacity = 1; let maxStep = 0; let last = e.position;
    for (let i = 0; i < 60; i++) { e.step(DT); minOpacity = Math.min(minOpacity, e.frame.opacity); maxStep = Math.max(maxStep, dist(e.position, last)); last = e.position; }
    expect(minOpacity).toBeLessThan(0.3);
    expect(e.frame.wingHz).toBe(0);
    e.burst(10);
    expect(e.frame.sparks.some((s) => s.alive)).toBe(false);
    expect(dist(e.position, { x: 400, y: 300 })).toBeLessThan(2);
  });

  it('falls asleep after a long calm and wakes when the cursor moves', () => {
    const e = new FlyEngine({ seed: 7, sleepAfter: 5 });
    run(e, 6);
    expect(e.mood).toBe('sleeping');
    expect(e.frame.lid).toBeGreaterThan(0.8);
    e.setCursor({ x: 100, y: 100 }); e.step(DT); e.setCursor({ x: 180, y: 160 });
    run(e, 0.2);
    expect(e.mood).not.toBe('sleeping');
  });

  it('critical moods ignore cursor chasing', () => {
    const e = new FlyEngine({ seed: 8, start: { x: 300, y: 300 }, sleepAfter: 0 });
    e.setMood('reading', { force: true });
    const start = e.position;
    for (let i = 0; i < 600; i++) { e.setCursor({ x: 330, y: 330 }); e.step(DT); }
    expect(e.mood).toBe('reading');
    expect(dist(e.position, start)).toBeLessThan(40);
  });

  it('click beat fires an impact event synchronised with the dive', () => {
    const e = new FlyEngine({ seed: 11 });
    let impactAt = -1;
    e.on('impact', () => (impactAt = e.time));
    const t0 = e.time; e.click();
    run(e, 0.6);
    expect(impactAt - t0).toBeGreaterThan(0.1);
    expect(impactAt - t0).toBeLessThan(0.2);
  });

  it('success bursts 5–12 sparks, never a firework', () => {
    const e = new FlyEngine({ seed: 12, sleepAfter: 0 });
    e.setMood('success', { force: true });
    let peak = 0;
    run(e, 2, (en) => (peak = Math.max(peak, en.frame.sparks.filter((s) => s.alive).length)));
    expect(peak).toBeGreaterThanOrEqual(5);
    expect(peak).toBeLessThanOrEqual(12);
  });

  it('wings speed up with thrust and slow when sleeping', () => {
    const e = new FlyEngine({ seed: 13, start: { x: 0, y: 100 }, sleepAfter: 0 });
    run(e, 1);
    const hover = e.frame.wingHz;
    e.flyTo({ x: 800, y: 100 }, { style: 'glide' });
    let peak = 0; run(e, 0.8, (en) => (peak = Math.max(peak, en.frame.wingHz)));
    expect(peak).toBeGreaterThan(hover + 8);
    e.setMood('sleeping', { force: true });
    run(e, 3);
    expect(e.frame.wingHz).toBeLessThan(4);
  });
});
