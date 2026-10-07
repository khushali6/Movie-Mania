/* On-page overlay: a small fly in a closed shadow root. Click-through except its own controls, so it can never block the page. */
import { FlyEngine } from '@ff/fly/engine';
import { FlyRenderer } from '@ff/fly/render';
import type { FlyMood } from '@fruitfly/core';
import { OVERLAY_KEY, OverlayMsgSchema } from '../shared/messages';

type W = Window & { [OVERLAY_KEY]?: { handle: (m: unknown) => void } };
const win = window as W;

(() => {
  if (win[OVERLAY_KEY] || window.top !== window) return;
  const host = document.createElement('div'); host.id = 'ff-overlay-host';
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;contain:layout style';
  const root = host.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    .ring{position:fixed;left:0;top:0;border-radius:8px;outline:2px solid #E0A04A;outline-offset:3px;box-shadow:0 0 0 7px rgba(224,160,74,.2);opacity:0;transition:opacity .16s;pointer-events:none;will-change:transform,opacity}
    .tag{position:fixed;left:0;top:0;font:600 11px/1 ui-sans-serif,system-ui,sans-serif;background:#17140F;color:#F5EFE2;padding:5px 8px;border-radius:7px;opacity:0;transition:opacity .16s;white-space:nowrap;pointer-events:none;max-width:260px;overflow:hidden;text-overflow:ellipsis}
    .pill{position:fixed;right:14px;bottom:14px;display:flex;align-items:center;gap:8px;padding:6px 6px 6px 10px;background:#17140F;color:#F5EFE2;border-radius:999px;font:500 12px/1 ui-sans-serif,system-ui,sans-serif;box-shadow:0 8px 24px rgba(23,20,15,.35);opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:auto;user-select:none}
    .pill.on{opacity:1;transform:none}
    .dot{width:8px;height:8px;border-radius:50%;background:#E0A04A;animation:b 1.6s ease-in-out infinite}
    .pill.need .dot{background:#C2342B}
    @keyframes b{50%{transform:scale(1.35);opacity:.6}}
    button{all:unset;cursor:pointer;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.12);font:600 12px/1 ui-sans-serif,system-ui,sans-serif}
    button:hover{background:rgba(255,255,255,.22)} button:focus-visible{outline:2px solid #E0A04A}
    @media (prefers-reduced-motion:reduce){.dot{animation:none}.ring,.tag,.pill{transition:none}}`;
  const ring = document.createElement('div'); ring.className = 'ring';
  const tag = document.createElement('div'); tag.className = 'tag';
  const pill = document.createElement('div'); pill.className = 'pill'; pill.setAttribute('role', 'region'); pill.setAttribute('aria-label', 'FruitFly controls');
  pill.innerHTML = '<i class="dot"></i><span class="txt">FruitFly is working</span>';
  const takeover = document.createElement('button'); takeover.textContent = 'Take over'; takeover.setAttribute('aria-label', 'Take over from FruitFly');
  const stop = document.createElement('button'); stop.textContent = 'Stop'; stop.setAttribute('aria-label', 'Stop FruitFly');
  pill.append(takeover, stop);
  root.append(style, ring, tag, pill);

  let renderer: FlyRenderer | null = null; let engine: FlyEngine | null = null; let raf = 0; let last = 0;
  let targetRef: string | null = null; let visible = false; const txt = pill.querySelector('.txt') as HTMLElement;
  const path: [number, number, number][] = []; let lastSample = 0; let lastFlush = 0; const t0 = Date.now();

  const send = (m: unknown) => { try { void chrome.runtime.sendMessage(m); } catch { /* extension reloaded: nothing to do */ } };
  takeover.addEventListener('click', () => send({ ff: 'takeover_from_page' }));
  stop.addEventListener('click', () => send({ ff: 'stop_from_page' }));

  const rectOfRef = (ref: string) => { const el = document.querySelector<HTMLElement>(`[data-ff-ref="${CSS.escape(ref)}"]`); return el ? el.getBoundingClientRect() : null; };

  function placeRing(r: DOMRect | null) {
    if (!r || r.width === 0) { ring.style.opacity = '0'; tag.style.opacity = '0'; return; }
    ring.style.width = `${r.width}px`; ring.style.height = `${r.height}px`; ring.style.transform = `translate(${r.left}px,${r.top}px)`; ring.style.opacity = '1';
    tag.style.transform = `translate(${Math.max(4, r.left)}px,${Math.max(4, r.top - 26)}px)`; tag.style.opacity = tag.textContent ? '1' : '0';
  }

  function loop(now: number) {
    raf = requestAnimationFrame(loop);
    if (!engine || !renderer || document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    engine.step(dt); renderer.render(engine.frame, dt);
    if (targetRef) placeRing(rectOfRef(targetRef));
    if (now - lastSample > 150) { lastSample = now; path.push([Date.now() - t0, Math.round((engine.frame.x / innerWidth) * 1000), Math.round((engine.frame.y / innerHeight) * 1000)]); }
    if (now - lastFlush > 1800 && path.length) { lastFlush = now; send({ ff: 'fly_path', pts: path.splice(0, path.length).slice(-200) }); }
  }

  function show(o: { size?: number; energy?: 'calm' | 'normal' | 'lively'; reduced?: boolean }) {
    if (!document.documentElement.contains(host)) document.documentElement.appendChild(host);
    if (!renderer) {
      const size = o.size ?? 38; renderer = new FlyRenderer({ size, floating: true }); renderer.el.style.zIndex = '1';
      root.appendChild(renderer.el);
      const reduced = o.reduced ?? matchMedia('(prefers-reduced-motion: reduce)').matches;
      engine = new FlyEngine({ seed: 'overlay', size, energy: o.energy ?? 'normal', reducedMotion: reduced, sleepAfter: 0, start: { x: innerWidth - 60, y: -30 }, startMood: 'thinking', bounds: () => ({ w: innerWidth, h: innerHeight }) });
      engine.flyTo({ x: innerWidth - 80, y: innerHeight - 90 }, { style: 'glide' });
      addEventListener('resize', () => { /* bounds read lazily */ }, { passive: true });
    }
    visible = true; pill.classList.add('on'); pill.classList.remove('need'); txt.textContent = 'FruitFly is working';
    if (!raf) raf = requestAnimationFrame(loop);
  }
  function hide() { visible = false; pill.classList.remove('on'); placeRing(null); targetRef = null; engine?.flyTo({ x: innerWidth + 60, y: -40 }, { style: 'glide' }); setTimeout(() => { if (!visible) { cancelAnimationFrame(raf); raf = 0; renderer?.destroy(); renderer = null; engine = null; host.remove(); } }, 1400); }

  function handle(raw: unknown) {
    const p = OverlayMsgSchema.safeParse(raw); if (!p.success) return; const m = p.data;
    switch (m.op) {
      case 'show': show(m); break;
      case 'hide': hide(); break;
      case 'mood': engine?.setMood(m.mood as FlyMood, { force: true }); break;
      case 'click': engine?.click(); break;
      case 'needs_you': pill.classList.add('need'); txt.textContent = m.text ?? 'Waiting for your OK in the side panel'; engine?.setMood('asking', { force: true }); break;
      case 'target': {
        targetRef = m.ref; tag.textContent = m.label ?? '';
        if (!m.ref || !engine) { placeRing(null); break; }
        const r = rectOfRef(m.ref); if (!r) break;
        const to = r.width > 200 ? { x: r.right - 34, y: Math.max(24, r.top - 24) } : { x: Math.min(innerWidth - 24, r.right + 28), y: r.top + r.height / 2 - 6 };
        engine.flyTo(to, { style: 'dart', look: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
        if (m.kind) engine.setMood(m.kind === 'type' ? 'typing' : m.kind === 'click' ? 'acting' : m.kind === 'read' ? 'reading' : 'searching', { force: true });
        break;
      }
    }
  }
  win[OVERLAY_KEY] = { handle };
  chrome.runtime.onMessage.addListener((msg) => { if (msg && typeof msg === 'object' && 'op' in msg) { handle(msg); } return false; });
})();
