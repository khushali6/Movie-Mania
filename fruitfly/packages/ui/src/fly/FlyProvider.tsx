import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { moodForEvent, type AgentEvent, type FlyEnergy, type FlyMood } from '@fruitfly/core';
import { FlyEngine } from './engine';
import { FlyRenderer } from './render';
import { ticker } from './ticker';
import { anchors, type AnchorConfig } from '../anchors';
import { usePrefersReducedMotion } from './hooks';
import type { Vec } from './math';
import type { FlightStyle } from './flight';

export interface FlyApi {
  engine: FlyEngine;
  setMood(m: FlyMood, o?: { force?: boolean }): void;
  /** fly to the point beside an anchor. Resolves on arrival (or immediately when the anchor is missing). */
  flyToAnchor(id: string, o?: { mood?: FlyMood; style?: FlightStyle; look?: string | null; perch?: boolean }): Promise<void>;
  /** hover beside an anchor and keep following it if it moves */
  perchAt(id: string): void;
  lookAtAnchor(id: string | null): void;
  click(): void;
  burst(n?: number): void;
  halt(): void;
  /** Carry the result card in, drop it at `result-card`, resolve when it lands. */
  deliverResult(): Promise<void>;
  handleEvent(e: AgentEvent): void;
  setEnergy(e: FlyEnergy): void;
}

const Ctx = createContext<FlyApi | null>(null);

export interface FlyProviderProps {
  children?: ReactNode;
  size?: number;
  energy?: FlyEnergy;
  seed?: number | string;
  /** restrict the layer to a container (landing hero, demo window). Default: whole viewport. */
  container?: HTMLElement | null;
  reducedMotion?: boolean;
  disabled?: boolean;
  sleepAfter?: number;
  /** anchor to settle on at start */
  startAnchor?: string;
  /** let the fly make its entrance from a corner */
  entrance?: boolean;
}

export function FlyProvider({ children, size = 60, energy = 'normal', seed = 11, container = null, reducedMotion, disabled, sleepAfter = 45, startAnchor = 'perch-default', entrance = true }: FlyProviderProps) {
  const prefers = usePrefersReducedMotion();
  const reduced = reducedMotion ?? prefers;
  const [api, setApi] = useState<FlyApi | null>(null);
  const stateRef = useRef<{ engine: FlyEngine; renderer: FlyRenderer; layer: HTMLDivElement } | null>(null);
  const homeRef = useRef<string | null>(null);

  useEffect(() => {
    if (disabled || typeof document === 'undefined') return;
    const layer = document.createElement('div');
    layer.className = 'ff-fly-layer';
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, { position: container ? 'absolute' : 'fixed', inset: '0', pointerEvents: 'none', zIndex: '60', overflow: 'hidden', contain: 'layout paint' });
    (container ?? document.body).appendChild(layer);

    const bounds = () => { const r = layer.getBoundingClientRect(); return { w: r.width, h: r.height }; };
    const origin = (): Vec => { const r = layer.getBoundingClientRect(); return { x: r.left, y: r.top }; };
    const toLocal = (p: Vec): Vec => { const o = origin(); return { x: p.x - o.x, y: p.y - o.y }; };

    const renderer = new FlyRenderer({ size, floating: true });
    renderer.mount(layer);
    const b = bounds();
    const engine = new FlyEngine({ seed, energy, reducedMotion: reduced, sleepAfter, size, bounds, start: entrance && !reduced ? { x: b.w + 40, y: -30 } : { x: b.w - 60, y: b.h - 60 }, startMood: 'greeting' });
    stateRef.current = { engine, renderer, layer };

    // pointer → engine (rAF-coalesced: we just remember the last position)
    let cursor: Vec | null = null; let cursorDirty = false;
    const onMove = (e: PointerEvent) => { if (e.pointerType === 'touch') return; cursor = toLocal({ x: e.clientX, y: e.clientY }); cursorDirty = true; };
    const onLeave = () => { cursor = null; cursorDirty = true; };
    const onKey = () => engine.noteActivity();
    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    window.addEventListener('keydown', onKey, { passive: true });

    const off = ticker.subscribe((dt) => {
      if (cursorDirty) { engine.setCursor(cursor); cursorDirty = false; }
      engine.step(dt);
      renderer.render(engine.frame, dt);
    });

    const resolvePoint = (id: string): Vec | null => { const p = anchors.point(id, size * 0.45); return p ? toLocal(p) : null; };

    // follow anchors when the layout shifts under us
    const offAnch = anchors.subscribe(() => {
      const home = homeRef.current;
      if (home && !engine.isFlying) { const p = resolvePoint(home); if (p) engine.perch(p); }
      const prev = anchors.rect('page-preview');
      if (prev) { const o = origin(); engine.setSearchArea({ x: prev.left - o.x + prev.width * 0.1, y: prev.top - o.y + prev.height * 0.1, w: prev.width * 0.8, h: prev.height * 0.7 }); }
      const composer = anchors.rect('composer');
      if (composer) { const o = origin(); engine.setUserPoint({ x: composer.left - o.x + composer.width * 0.5, y: composer.top - o.y + composer.height * 0.5 }); }
    });

    const flyToAnchor: FlyApi['flyToAnchor'] = (id, o = {}) => new Promise<void>((resolve) => {
      const p = resolvePoint(id);
      if (o.mood) engine.setMood(o.mood, { force: true });
      if (!p) { resolve(); return; }
      if (o.perch !== false) homeRef.current = id;
      let lookPt: Vec | null | undefined;
      if (o.look === null) lookPt = null;
      else if (typeof o.look === 'string') { const r = anchors.rect(o.look); lookPt = r ? toLocal({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : undefined; }
      else { const r = anchors.rect(id); lookPt = r ? toLocal({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) : undefined; }
      if (engine.position && Math.hypot(engine.position.x - p.x, engine.position.y - p.y) < 14 && !engine.isFlying) { resolve(); return; }
      engine.flyTo(p, { style: o.style, look: lookPt, onArrive: resolve });
    });

    const api: FlyApi = {
      engine,
      setMood: (m, o) => engine.setMood(m, o),
      flyToAnchor,
      perchAt: (id) => { homeRef.current = id; const p = resolvePoint(id); if (p) engine.flyTo(p); },
      lookAtAnchor: (id) => { if (!id) { engine.lookAt(null); return; } const r = anchors.rect(id); if (r) engine.lookAt(toLocal({ x: r.left + r.width / 2, y: r.top + r.height / 2 })); },
      click: () => engine.click(),
      burst: (n) => engine.burst(n),
      halt: () => engine.halt(),
      deliverResult: async () => {
        engine.carry('card');
        await flyToAnchor('result-card', { mood: 'acting', style: 'carry', look: null, perch: false });
        const r = anchors.rect('result-card');
        await new Promise<void>((res) => {
          if (!r) { engine.clearProp(); res(); return; }
          const to = toLocal({ x: r.left + Math.min(r.width / 2, 120), y: r.top + 26 });
          engine.dropProp(to, res);
        });
        engine.setMood('success', { force: true });
        const corner = resolvePoint('result-card');
        if (corner) { homeRef.current = 'result-card'; engine.perch(corner); }
      },
      handleEvent: (e) => {
        if (e.type === 'result') { if (e.result.status === 'failed') { engine.setMood('error', { force: true }); } else void api.deliverResult(); return; }
        const m = moodForEvent(e);
        if (!m) return;
        if (m.anchor && anchors.has(m.anchor)) void flyToAnchor(m.anchor, { mood: m.mood, look: m.anchor === 'approval-card' ? 'composer' : undefined, style: e.type === 'step_started' ? 'dart' : undefined });
        else engine.setMood(m.mood, { force: m.mood === 'error' });
      },
      setEnergy: (en) => engine.setEnergy(en),
    };
    setApi(api);

    // entrance: greet on the default perch
    queueMicrotask(() => { void flyToAnchor(startAnchor, { mood: 'greeting' }).then(() => engine.setMood('idle')); });
    // first-paint hook for e2e & lab tooling
    (window as unknown as { __fly?: FlyApi }).__fly = api;

    return () => {
      off(); offAnch();
      window.removeEventListener('pointermove', onMove); document.documentElement.removeEventListener('pointerleave', onLeave); window.removeEventListener('keydown', onKey);
      renderer.destroy(); layer.remove(); stateRef.current = null; setApi(null);
    };
    // The engine is created once per mount; props that change at runtime are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, container, size, seed]);

  useEffect(() => { stateRef.current?.engine.setEnergy(energy); }, [energy]);
  useEffect(() => { stateRef.current?.engine.setReducedMotion(reduced); }, [reduced]);
  useEffect(() => { stateRef.current?.engine.setSleepAfter(sleepAfter); }, [sleepAfter]);

  const value = useMemo(() => api, [api]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Null until the layer is mounted (and always null when disabled), so callers use optional chaining. */
export function useFly(): FlyApi | null { return useContext(Ctx); }

export function useFlyMood(): FlyMood {
  const fly = useFly();
  const subscribe = useCallback((cb: () => void) => fly?.engine.on('moodchange', cb) ?? (() => {}), [fly]);
  return useSyncExternalStore(subscribe, () => fly?.engine.mood ?? 'idle', () => 'idle');
}

/** Register an element as a fly anchor: `<div ref={useFlyAnchor('composer', {side:'right'})} />` */
export function useFlyAnchor<T extends Element = HTMLElement>(id: string, cfg: AnchorConfig = {}): (el: T | null) => void {
  const off = useRef<(() => void) | null>(null);
  const key = JSON.stringify(cfg);
  return useCallback((el: T | null) => {
    off.current?.(); off.current = null;
    if (el) off.current = anchors.register(id, el, cfg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);
}
