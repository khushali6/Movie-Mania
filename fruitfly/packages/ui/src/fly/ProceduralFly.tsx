import { useEffect, useRef } from 'react';
import type { FlyEnergy, FlyMood } from '@fruitfly/core';
import { FlyEngine } from './engine';
import { FlyRenderer } from './render';
import { ticker } from './ticker';
import { usePrefersReducedMotion } from './hooks';

export interface ProceduralFlyProps {
  mood?: FlyMood;
  size?: number;
  energy?: FlyEnergy;
  seed?: number | string;
  /** eyes and head follow the pointer (gentle, never required) */
  followCursor?: boolean;
  /** disable sleeping for static previews */
  neverSleep?: boolean;
  className?: string;
  reducedMotion?: boolean;
  /** called once with the engine so labs/demos can drive it */
  onEngine?: (e: FlyEngine) => void;
  label?: string;
}

/**
 * A self-contained fly in normal flow (avatar, empty state, lab card). It owns its own engine,
 * shares the single rAF ticker, and stops stepping while scrolled out of view.
 */
export function ProceduralFly({ mood = 'idle', size = 64, energy = 'normal', seed = 7, followCursor = true, neverSleep = true, className, reducedMotion, onEngine, label }: ProceduralFlyProps) {
  const host = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FlyEngine | null>(null);
  const prefers = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefers;

  useEffect(() => {
    const el = host.current; if (!el) return;
    const renderer = new FlyRenderer({ size, floating: false });
    renderer.el.style.position = 'absolute'; renderer.el.style.left = '0'; renderer.el.style.top = '0';
    el.appendChild(renderer.el);
    const engine = new FlyEngine({ seed, energy, reducedMotion: reduced, sleepAfter: neverSleep ? 0 : 45, start: { x: size / 2, y: size / 2 }, startMood: mood });
    engine.setUserPoint({ x: size * 1.4, y: size * 0.9 });
    engine.setSearchArea({ x: size * 0.25, y: size * 0.3, w: size * 0.5, h: size * 0.4 });
    engineRef.current = engine;
    onEngine?.(engine);
    // the fly floats in place: frame.x/y are in host-local coordinates, applied via a wrapper transform
    let visible = true;
    const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; }) : null;
    io?.observe(el);
    const move = (ev: PointerEvent) => {
      if (!followCursor) return;
      const r = el.getBoundingClientRect();
      engine.setCursor({ x: ev.clientX - r.left, y: ev.clientY - r.top });
    };
    window.addEventListener('pointermove', move, { passive: true });
    const off = ticker.subscribe((dt) => {
      if (!visible) return;
      const f = engine.step(dt);
      renderer.el.style.transform = `translate3d(${(f.x - size / 2).toFixed(2)}px,${(f.y - size / 2).toFixed(2)}px,0)`;
      renderer.render(f, dt);
      renderer.el.style.transform = `translate3d(${(f.x - size / 2).toFixed(2)}px,${(f.y - size / 2).toFixed(2)}px,0)`;
    });
    return () => { off(); io?.disconnect(); window.removeEventListener('pointermove', move); renderer.destroy(); engineRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, seed]);

  useEffect(() => { engineRef.current?.setMood(mood, { force: true }); }, [mood]);
  useEffect(() => { engineRef.current?.setEnergy(energy); }, [energy]);
  useEffect(() => { engineRef.current?.setReducedMotion(reduced); }, [reduced]);

  return (
    <div ref={host} className={className} style={{ position: 'relative', width: size, height: size, flex: 'none' }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
  );
}
