import type { FlyProp } from '@fruitfly/core';
import type { FlyFrame } from './engine';
import { FLY_VIEWBOX, PROP_ART, flySvg } from './svg';

let uid = 0;

export interface RendererOptions {
  /** CSS px size of the 120-unit viewbox */
  size?: number;
  /** if true, the root element is positioned fixed and translated each frame (global layer). If false it is static and the frame x/y are ignored. */
  floating?: boolean;
}

type Q<T extends Element = SVGElement> = T;

/** Applies FlyFrames to a procedurally drawn SVG fly. Pure DOM, no framework, so it also runs inside the closed-shadow overlay. */
export class FlyRenderer {
  readonly el: HTMLDivElement;
  private size: number;
  private floating: boolean;
  private parts!: Record<string, Q>;
  private sparkEls: SVGCircleElement[] = [];
  private wingPhase = 0;
  private propKind: FlyProp = 'none';

  constructor(opts: RendererOptions = {}) {
    this.size = opts.size ?? 64;
    this.floating = opts.floating ?? true;
    const id = `ff${++uid}`;
    this.el = document.createElement('div');
    this.el.className = 'ff-fly';
    this.el.setAttribute('aria-hidden', 'true');
    const s = this.el.style;
    s.width = `${this.size}px`; s.height = `${this.size}px`;
    s.pointerEvents = 'none';
    s.willChange = 'transform';
    s.contain = 'layout style';
    if (this.floating) { s.position = 'absolute'; s.left = '0'; s.top = '0'; } else { s.position = 'relative'; }
    this.el.innerHTML = flySvg(id);
    const parts: Record<string, Q> = {};
    this.el.querySelectorAll<SVGElement>('[data-part]').forEach((n) => { parts[n.dataset.part as string] = n; });
    this.parts = parts;
    const sparks = parts.sparks as SVGGElement;
    for (let i = 0; i < 16; i++) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('r', '0'); c.setAttribute('opacity', '0');
      sparks.appendChild(c); this.sparkEls.push(c);
    }
  }

  setSize(px: number): void {
    this.size = px;
    this.el.style.width = `${px}px`; this.el.style.height = `${px}px`;
  }
  get px(): number { return this.size; }

  mount(parent: Element | ShadowRoot): void { parent.appendChild(this.el); }
  destroy(): void { this.el.remove(); }

  /** `phaseSec` lets a caller advance wings by wall time when the engine is not stepping. */
  render(f: FlyFrame, dt: number): void {
    const k = this.size / FLY_VIEWBOX;
    const P = this.parts;
    if (this.floating) this.el.style.transform = `translate3d(${(f.x - this.size / 2).toFixed(2)}px,${(f.y - this.size / 2).toFixed(2)}px,0)`;
    this.el.style.opacity = f.opacity.toFixed(3);

    // body: bank, squash, facing flip around the body centre
    const body = P.body as SVGGElement;
    body.setAttribute('transform', `translate(60 62) rotate(${f.rot.toFixed(2)}) scale(${(f.facing * f.sx).toFixed(3)} ${f.sy.toFixed(3)}) translate(-60 -62)`);

    // head swivels independently around the neck
    (P.head as SVGGElement).setAttribute('transform', `rotate(${f.headRot.toFixed(2)} 82 60)`);

    // pupil in the eye, eyes lead the head
    const px = 91 + f.pupilX * 3.3, py = 56 + f.pupilY * 3.6;
    const pupil = P.pupil as SVGEllipseElement;
    pupil.setAttribute('cx', px.toFixed(2)); pupil.setAttribute('cy', py.toFixed(2));
    pupil.setAttribute('rx', (4.1 * f.pupilScale).toFixed(2)); pupil.setAttribute('ry', (4.6 * f.pupilScale).toFixed(2));
    // eyelid scales down from the top of the eye
    (P.lid as SVGEllipseElement).setAttribute('transform', `translate(0 44.2) scale(1 ${Math.max(0, f.lid).toFixed(3)}) translate(0 -44.2)`);

    // wings: phase integrates frequency so speed changes never jump
    this.wingPhase += f.wingHz * dt * Math.PI * 2;
    const flapA = Math.sin(this.wingPhase);
    const flapB = Math.sin(this.wingPhase + 0.9);
    const spread = f.wingSpread;
    const rest = lerpN(14, -6, spread);
    const swing = f.wingAmp * 38;
    const near = rest - (0.5 + 0.5 * flapA) * swing;
    const far = rest + 4 - (0.5 + 0.5 * flapB) * swing * 0.9;
    const scaleY = (a: number) => (0.5 + 0.5 * Math.abs(Math.cos(a * 0.9 + 0.4))) * lerpN(0.55, 1, spread);
    (P.wingNear as SVGGElement).setAttribute('transform', `translate(62 50) rotate(${near.toFixed(2)}) scale(1 ${scaleY(this.wingPhase).toFixed(3)})`);
    (P.wingFar as SVGGElement).setAttribute('transform', `translate(62 50) rotate(${far.toFixed(2)}) scale(1 ${scaleY(this.wingPhase + 0.9).toFixed(3)})`);
    const ghost = P.wingGhost as SVGGElement;
    const blur = Math.min(0.42, (f.wingHz / 36) * f.wingAmp * 1.3);
    ghost.setAttribute('transform', `translate(62 50) rotate(${(rest - (0.5 - 0.5 * flapA) * swing).toFixed(2)}) scale(1 ${scaleY(this.wingPhase + 1.7).toFixed(3)})`);
    ghost.setAttribute('opacity', blur.toFixed(3));

    // foreleg raise (asking / grooming / waving)
    (P.foreleg as SVGGElement).setAttribute('transform', `rotate(${(-62 * f.legRaise).toFixed(2)} 72 69)`);

    // glow + shadow
    P.glow!.setAttribute('opacity', Math.min(1, f.glow).toFixed(3));
    const sh = P.shadow as SVGEllipseElement;
    sh.setAttribute('opacity', f.shadowOpacity.toFixed(3));
    sh.setAttribute('transform', `translate(${(4 + f.rot * 0.1).toFixed(1)} ${(Math.max(0, f.sy - 1) * 40).toFixed(1)}) scale(${f.shadowScale.toFixed(3)} 1)`);
    sh.setAttribute('transform-origin', '62 106');

    // dart trail drawn in body-relative coords (container is translated, so relative to current pos)
    const trail = P.trail as SVGPathElement;
    if (f.trail > 0.02) {
      let d = '';
      for (let i = 0; i < f.trailPts.length; i++) {
        const p = f.trailPts[i]!;
        const x = 60 + (p.x - f.x) / k, y = 62 + (p.y - f.y) / k;
        d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      trail.setAttribute('d', d); trail.setAttribute('opacity', f.trail.toFixed(3));
    } else if (trail.getAttribute('opacity') !== '0') trail.setAttribute('opacity', '0');

    // sparks
    for (let i = 0; i < this.sparkEls.length; i++) {
      const el = this.sparkEls[i]!; const s = f.sparks[i];
      if (!s || !s.alive) { if (el.getAttribute('opacity') !== '0') el.setAttribute('opacity', '0'); continue; }
      const u = s.age / s.life;
      el.setAttribute('cx', (60 + (s.x - f.x) / k).toFixed(1)); el.setAttribute('cy', (62 + (s.y - f.y) / k).toFixed(1));
      el.setAttribute('r', (s.size * (1 - u * 0.6) / k * 0.9).toFixed(2));
      el.setAttribute('opacity', (1 - u * u).toFixed(2));
      el.setAttribute('fill', s.tone === 0 ? '#E0A04A' : s.tone === 1 ? '#A9C84A' : '#F2A07B');
    }

    // prop carried beneath
    const prop = P.prop as SVGGElement;
    if (f.prop.kind !== this.propKind) {
      this.propKind = f.prop.kind;
      prop.innerHTML = f.prop.kind === 'none' ? '' : (PROP_ART[f.prop.kind] ?? '');
    }
    if (f.prop.kind === 'none' || f.prop.opacity < 0.01) prop.setAttribute('opacity', '0');
    else {
      prop.setAttribute('opacity', f.prop.opacity.toFixed(2));
      prop.setAttribute('transform', `translate(${(60 + f.prop.dx / k).toFixed(1)} ${(62 + f.prop.dy / k + 14).toFixed(1)}) rotate(${f.prop.rot.toFixed(1)}) scale(${(f.prop.scale * (f.prop.falling ? 1.15 : 0.9)).toFixed(3)})`);
    }
  }
}

function lerpN(a: number, b: number, t: number): number { return a + (b - a) * t; }
