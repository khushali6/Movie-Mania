import { createRng, type FlyEnergy, type FlyMood, type FlyProp, type Rng } from '@fruitfly/core';
import {
  type Spring, type Vec, add, clamp, damp, dampingFor, dist, easeInOutCubic, easeOutBack, easeOutCubic,
  len, lerp, mul, norm, smoothstep, springStep, sub, v,
} from './math';
import { SmoothNoise } from './noise';
import { AFTERGLOW, ENERGY, MOOD_PARAMS, type MoodParams } from './params';
import { type FlightPlan, type FlightStyle, planFlight, sampleFlight } from './flight';

export interface Spark { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; tone: 0 | 1 | 2; alive: boolean }
export interface PropFrame { kind: FlyProp; dx: number; dy: number; rot: number; scale: number; opacity: number; falling: boolean }

/** Everything the renderer needs. Mutated in place each step to keep GC at zero. */
export interface FlyFrame {
  x: number; y: number;
  rot: number;           // body bank/pitch, deg
  facing: number;        // -1..1 (scaleX); passes through 0 on a turn
  sx: number; sy: number; // squash & stretch
  headRot: number;       // deg relative to body
  pupilX: number; pupilY: number; pupilScale: number;
  lid: number;
  wingHz: number; wingAmp: number; wingSpread: number;
  legRaise: number;
  glow: number;
  opacity: number;
  shadowOpacity: number; shadowScale: number;
  trail: number;
  trailPts: Vec[];
  sparks: Spark[];
  prop: PropFrame;
  mood: FlyMood;
  speed: number;         // px/s, for debug overlay
}

export interface FlyEngineOptions {
  seed?: number | string;
  reducedMotion?: boolean;
  energy?: FlyEnergy;
  /** seconds of calm idling before the fly falls asleep. 0 disables sleeping. */
  sleepAfter?: number;
  /** area the fly must stay inside */
  bounds?: () => { w: number; h: number };
  /** scale of the fly in px (affects spacing only; the renderer owns the actual size) */
  size?: number;
  start?: Vec;
  startMood?: FlyMood;
}

type EventName = 'impact' | 'arrived' | 'landed' | 'moodchange' | 'wake' | 'blink';
type Timer = { at: number; fn: () => void };

const FLIGHT_MOODS = new Set<FlyMood>(['searching']);

export class FlyEngine {
  readonly frame: FlyFrame;
  private rng: Rng;
  private noiseX: SmoothNoise;
  private noiseY: SmoothNoise;
  private noiseR: SmoothNoise;
  private now = 0;
  private energy: FlyEnergy;
  private reduced: boolean;
  private sleepAfter: number;
  private opts: FlyEngineOptions;

  // kinematics
  private base: Vec;                  // spring-followed logical position
  private baseVel: Vec = v();
  private home: Vec;
  private plan: FlightPlan | null = null;
  private planDone: (() => void) | null = null;
  private planThen: FlyMood | null = null;
  private pos: Vec;
  private prevPos: Vec;
  private vel: Vec = v();
  private lag = { x: { x: 0, v: 0 } as Spring, y: { x: 0, v: 0 } as Spring };
  private residual: Vec = v();
  private fadeHop: { t: number; to: Vec; done: (() => void) | null } | null = null;

  // mood machine
  private _mood: FlyMood;
  private moodSince = 0;
  private pending: { mood: FlyMood; auto: boolean } | null = null;
  private history: { mood: FlyMood; at: number }[] = [];
  private mp: MoodParams;
  private blendedLegRaise = 0;
  private afterglowUntil = 0;
  private autoCurious = false;

  // attention
  private gazeTarget: Vec | null = null;
  private cursor: Vec | null = null;
  private cursorPrev: Vec | null = null;
  private cursorSpeed = 0;
  private cursorNearFor = 0;
  private cursorFarFor = 0;
  private userPoint: Vec | null = null;
  private wanderGaze: Vec = v();
  private nextGazeAt = 0;
  private pupil = { x: { x: 0, v: 0 } as Spring, y: { x: 0, v: 0 } as Spring };
  private head: Spring = { x: 0, v: 0 };
  private face: Spring = { x: 1, v: 0 };
  private faceDir: 1 | -1 = 1;
  private glanceUntil = 0;
  private glanceTo: Vec | null = null;

  // idle life
  private wander: Vec = v();
  private wanderTarget: Vec = v();
  private nextWanderAt = 0;
  private nextMicroAt = 2;
  private lastMicro = '';
  private blinkUntil = 0;
  private nextBlinkAt = 2.4;
  private lastActivity = 0;
  private nudge: Vec = v();
  private nudgeUntil = 0;
  private nextNudgeAt = 4;

  // behaviours
  private bt = 0;                    // time in current mood
  private orbit = { a: 0, w: 2.1, hold: 0, nextFlip: 2.4, center: v() };
  private scanT = 0;
  private searchArea: { x: number; y: number; w: number; h: number } | null = null;
  private searchAnchor: Vec = v();
  private searchWaitUntil = 0;
  private keyAt = 0;
  private keyKick = 0;
  private clickT = -1;
  private offset: Vec = v();         // behaviour offset (px)
  private squash = 1;
  private squashV: Spring = { x: 1, v: 0 };
  private legSpr: Spring = { x: 0, v: 0 };
  private tiltExtra = 0;
  private pupilBias = v();
  private glowPulse = 0;
  private wingBurst = 0;
  private lidMicro = 0;

  private timers: Timer[] = [];
  private listeners: Partial<Record<EventName, Set<() => void>>> = {};
  private sparks: Spark[] = [];
  private propKind: FlyProp = 'none';
  private propT = 0;
  private propDrop: { from: Vec; to: Vec; t: number; cb: (() => void) | null } | null = null;
  private propSwing: Spring = { x: 0, v: 0 };
  private trailBuf: Vec[] = [];
  private trailAcc = 0;

  constructor(opts: FlyEngineOptions = {}) {
    this.opts = opts;
    this.rng = createRng(opts.seed ?? 7);
    this.noiseX = new SmoothNoise(this.rng.fork('nx'));
    this.noiseY = new SmoothNoise(this.rng.fork('ny'));
    this.noiseR = new SmoothNoise(this.rng.fork('nr'));
    this.energy = opts.energy ?? 'normal';
    this.reduced = opts.reducedMotion ?? false;
    this.sleepAfter = opts.sleepAfter ?? 45;
    const start = opts.start ?? v(120, 120);
    this.base = { ...start };
    this.home = { ...start };
    this.pos = { ...start };
    this.prevPos = { ...start };
    this._mood = opts.startMood ?? 'idle';
    this.mp = MOOD_PARAMS[this._mood];
    this.history.push({ mood: this._mood, at: 0 });
    this.orbit.a = this.rng.range(0, Math.PI * 2);
    for (let i = 0; i < 16; i++) this.sparks.push({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 2, tone: 0, alive: false });
    for (let i = 0; i < 10; i++) this.trailBuf.push({ ...start });
    this.frame = {
      x: start.x, y: start.y, rot: 0, facing: 1, sx: 1, sy: 1, headRot: 0, pupilX: 0, pupilY: 0, pupilScale: 1, lid: 0,
      wingHz: 9, wingAmp: 0.3, wingSpread: 1, legRaise: 0, glow: 0, opacity: 1, shadowOpacity: 0.3, shadowScale: 1,
      trail: 0, trailPts: this.trailBuf, sparks: this.sparks,
      prop: { kind: 'none', dx: 0, dy: 0, rot: 0, scale: 0, opacity: 0, falling: false },
      mood: this._mood, speed: 0,
    };
    this.nextWanderAt = this.rng.range(...this.mp.wanderEvery);
  }

  // ───────────────────────────── public API ─────────────────────────────

  get mood(): FlyMood { return this._mood; }
  get time(): number { return this.now; }
  get position(): Vec { return { ...this.pos }; }
  get isFlying(): boolean { return this.plan !== null || this.fadeHop !== null; }
  get recentMoods(): readonly { mood: FlyMood; at: number }[] { return this.history; }
  get isReduced(): boolean { return this.reduced; }

  on(ev: EventName, fn: () => void): () => void {
    (this.listeners[ev] ??= new Set()).add(fn);
    return () => this.listeners[ev]?.delete(fn);
  }
  private emit(ev: EventName): void { this.listeners[ev]?.forEach((f) => f()); }

  setEnergy(e: FlyEnergy): void { this.energy = e; }
  setReducedMotion(r: boolean): void { this.reduced = r; if (r) { this.sparks.forEach((s) => (s.alive = false)); } }
  setSleepAfter(sec: number): void { this.sleepAfter = sec; }
  setSearchArea(r: { x: number; y: number; w: number; h: number } | null): void { this.searchArea = r; }
  setUserPoint(p: Vec | null): void { this.userPoint = p; }
  lookAt(p: Vec | null): void { this.gazeTarget = p ? { ...p } : null; }

  teleport(p: Vec): void {
    this.base = { ...p }; this.home = { ...p }; this.pos = { ...p }; this.prevPos = { ...p };
    this.plan = null; this.vel = v(); this.baseVel = v(); this.residual = v();
    for (const t of this.trailBuf) { t.x = p.x; t.y = p.y; }
  }

  /** Move the perch without a flight; the base spring follows softly (anchor shifted a little). */
  perch(p: Vec): void { this.home = { ...p }; }

  setCursor(p: Vec | null): void {
    if (p) {
      if (this.cursorPrev) {
        const d = dist(p, this.cursorPrev);
        this.cursorSpeed = damp(this.cursorSpeed, d * 60, 0.05, 1 / 60);
      }
      this.cursorPrev = { ...p };
      if (this.mood === 'sleeping' && this.cursorSpeed > 40) this.wake();
      this.lastActivity = this.now;
    } else this.cursorPrev = null;
    this.cursor = p ? { ...p } : null;
  }

  noteActivity(): void {
    this.lastActivity = this.now;
    if (this._mood === 'sleeping') this.wake();
  }

  setMood(next: FlyMood, o: { force?: boolean; auto?: boolean } = {}): void {
    if (!o.auto) { this.autoCurious = false; this.lastActivity = this.now; }
    if (next === this._mood) { this.pending = null; return; }
    const heldFor = (this.now - this.moodSince) * 1000;
    const urgent = next === 'error' || next === 'asking' || next === 'sleeping' && false;
    if (!o.force && !urgent && heldFor < this.mp.minDwell) {
      this.pending = { mood: next, auto: !!o.auto };
      return;
    }
    this.enterMood(next, !!o.auto);
  }

  flyTo(p: Vec, o: { style?: FlightStyle; look?: Vec | null; onArrive?: () => void; then?: FlyMood; speed?: number } = {}): void {
    this.lastActivity = this.now;
    if (this._mood === 'sleeping') this.wake();
    const target = this.clampToBounds(p);
    const style = o.style ?? (dist(this.pos, target) > 220 ? 'glide' : 'dart');
    this.planDone = o.onArrive ?? null;
    this.planThen = o.then ?? null;
    // eyes lead: look at the destination before anything moves
    this.gazeTarget = o.look === undefined ? { ...target } : o.look;
    if (this.reduced) {
      this.plan = null;
      this.fadeHop = { t: 0, to: target, done: o.onArrive ?? null };
      this.home = { ...target };
      return;
    }
    // carry current velocity forward so interruptions never snap
    this.residual = add(this.residual, mul(this.vel, 0.3));
    const speed = (o.speed ?? 1) * ENERGY[this.energy].speed;
    const bendSign = this.rng.sign();
    this.plan = planFlight({ ...this.pos }, target, style, { speed, bendSign });
    this.home = { ...target };
    this.nudge = v();
  }

  /** Stop where we are, decelerating naturally, look at the cursor, go idle. */
  halt(): void {
    this.plan = null; this.planDone = null; this.fadeHop = null; this.planThen = null;
    this.base = { ...this.pos };
    this.baseVel = mul(this.vel, 0.6);
    this.home = add(this.pos, mul(this.vel, 0.12));
    this.gazeTarget = this.cursor ? { ...this.cursor } : null;
    this.setMood('idle', { force: true });
  }

  click(): void { this.clickT = 0; this.lastActivity = this.now; }
  keystroke(): void { this.keyKick = 1; this.lastActivity = this.now; }
  burst(n?: number): void { if (!this.reduced) this.spawnSparks(n ?? this.rng.int(6, 11)); }

  carry(kind: FlyProp): void { this.propKind = kind; this.propT = 0; this.propDrop = null; }
  dropProp(at: Vec, cb?: () => void): void {
    if (this.propKind === 'none') { cb?.(); return; }
    this.propDrop = { from: add(this.pos, v(0, 30)), to: { ...at }, t: 0, cb: cb ?? null };
  }
  clearProp(): void { this.propKind = 'none'; this.propDrop = null; }

  after(ms: number, fn: () => void): void { this.timers.push({ at: this.now + ms / 1000, fn }); }

  // ───────────────────────────── mood machine ─────────────────────────────

  private enterMood(next: FlyMood, auto: boolean): void {
    const prev = this._mood;
    if (prev === 'sleeping' && next !== 'sleeping') this.wake(true);
    if (AFTERGLOW[prev]) this.afterglowUntil = this.now + (AFTERGLOW[prev] as number) / 1000;
    this._mood = next;
    this.mp = MOOD_PARAMS[next];
    this.moodSince = this.now;
    this.bt = 0;
    this.pending = null;
    this.autoCurious = auto && next === 'curious';
    this.history.push({ mood: next, at: this.now });
    if (this.history.length > 8) this.history.shift();
    this.frame.mood = next;
    this.timers = this.timers.filter((t) => t.at < 0); // drop leftover beats from the old mood
    this.nextWanderAt = this.now + this.rng.range(...this.mp.wanderEvery);
    this.onEnter(next, prev);
    this.emit('moodchange');
  }

  private onEnter(mood: FlyMood, prev: FlyMood): void {
    const r = this.rng;
    const sc = ENERGY[this.energy];
    switch (mood) {
      case 'greeting':
        this.after(180, () => this.hop(7));
        this.after(2 * 450, () => this.burst(0));
        break;
      case 'thinking':
        this.orbit.center = v(); this.orbit.hold = 0; this.orbit.nextFlip = r.range(2.2, 4);
        this.orbit.w = r.sign() * 2 * Math.PI / 3.4;
        break;
      case 'searching':
        this.searchAnchor = { ...this.home };
        this.searchWaitUntil = this.now + 0.15;
        break;
      case 'reading': this.scanT = 0; break;
      case 'acting': this.after(140, () => this.click()); break;
      case 'typing': this.keyAt = this.now + 0.2; break;
      case 'asking': this.gazeTarget = null; break;
      case 'success':
        if (!this.reduced) {
          this.after(280, () => this.hop(-16));
          this.after(520, () => this.burst(r.int(6, 11)));
          this.sparksTone = 0;
        } else this.after(200, () => this.legSpr.v += 0);
        break;
      case 'confused':
        this.baseVel = v(); this.vel = v(); this.residual = v();
        this.lag.x.v -= this.faceDir * 120;
        break;
      case 'error':
        this.baseVel = mul(this.baseVel, 0.1); this.residual = v();
        this.lag.x.v -= this.faceDir * 260;
        this.lag.y.v += 40;
        break;
      case 'sleeping':
        this.plan = null;
        this.after(0, () => { this.wingBurst = 1; this.legSpr.v += 3; });
        void sc;
        break;
      default: break;
    }
    void prev;
  }
  private sparksTone: 0 | 1 | 2 = 0;

  private wake(silent = false): void {
    if (this._mood !== 'sleeping') return;
    this.lastActivity = this.now;
    this.wingBurst = 1;
    this.hop(-10);
    this.lag.y.v -= 60;
    if (!silent) { this.enterMood('idle', true); this.glanceAtCursor(0.9); }
    this.emit('wake');
  }

  private hop(dy: number): void {
    if (this.reduced) return;
    this.lag.y.v += dy * 22;
  }

  // ───────────────────────────── step ─────────────────────────────

  step(dtRaw: number): FlyFrame {
    const dt = clamp(dtRaw, 0.0001, 1 / 20);
    this.now += dt;
    this.bt += dt;
    const f = this.frame;
    const sc = ENERGY[this.energy];
    const amp = this.reduced ? 0 : sc.amp;

    this.runTimers();
    if (this.pending && (this.now - this.moodSince) * 1000 >= this.mp.minDwell) {
      const p = this.pending; this.pending = null; this.enterMood(p.mood, p.auto);
    }
    this.autoMoods(dt);

    // ── base position: flight or soft spring toward home ──
    let thrust = 0;
    let flightVel = v();
    if (this.fadeHop) {
      const h = this.fadeHop; h.t += dt;
      f.opacity = h.t < 0.09 ? 1 - h.t / 0.09 : clamp((h.t - 0.09) / 0.12, 0, 1);
      if (h.t >= 0.09 && h.t - dt < 0.09) { this.base = { ...h.to }; this.pos = { ...h.to }; this.prevPos = { ...h.to }; }
      if (h.t >= 0.21) { f.opacity = 1; const d = h.done; this.fadeHop = null; d?.(); this.emit('arrived'); }
    } else if (this.plan) {
      this.plan.t += dt;
      const s = sampleFlight(this.plan);
      this.base = s.pos;
      this.baseVel = s.vel;
      flightVel = s.vel;
      thrust = s.thrust;
      if (s.phase === 'done') {
        const done = this.planDone; const then = this.planThen;
        this.plan = null; this.planDone = null; this.planThen = null;
        this.baseVel = v();
        if (then) this.setMood(then, { force: true });
        done?.();
        this.emit('arrived');
      }
    } else {
      // hover: base follows home with a soft, slightly under-damped spring
      const k = 55, c = dampingFor(k, 0.66);
      const target = add(this.home, this.nudge);
      const sx: Spring = { x: this.base.x, v: this.baseVel.x };
      const sy: Spring = { x: this.base.y, v: this.baseVel.y };
      springStep(sx, target.x, k, c, dt); springStep(sy, target.y, k, c, dt);
      this.base = v(sx.x, sy.x); this.baseVel = v(sx.v, sy.v);
    }
    // decay carried-over velocity from an interrupted flight
    this.residual = mul(this.residual, Math.pow(0.5, dt / 0.22));
    this.base = add(this.base, mul(this.residual, dt));

    // ── hover wander + bob (suppressed in flight, scaled by energy) ──
    const flightK = this.plan ? 0.15 : 1;
    this.updateWander(dt, amp);
    const t = this.now;
    const bobHz = this.mp.bobHz * sc.freq;
    const bobY = (Math.sin(t * bobHz * 2 * Math.PI + 0.7) * 0.7 + this.noiseY.fbm(t * 0.45) * 0.5) * this.mp.bob * amp * flightK;
    const driftX = this.noiseX.fbm(t * 0.31) * this.mp.wander * 0.3 * amp * flightK;
    const driftY = this.noiseY.fbm(t * 0.27 + 9) * this.mp.wander * 0.22 * amp * flightK;

    // ── per-mood behaviour (fills this.offset, squash, etc.) ──
    this.offset = v(); this.tiltExtra = 0; this.pupilBias = v();
    this.glowPulse = 0; this.lidMicro = 0;
    let legTarget = this.mp.legRaise;
    let wingHz = this.mp.wingHz * sc.freq;
    let wingAmp = this.mp.wingAmp;
    this.squashV.x = 1;
    this.behave(dt, amp, (x) => (legTarget = x), (hz, a) => { wingHz = hz; wingAmp = a; });
    if (this._mood === 'idle' || this._mood === 'waiting') this.idleLife(dt, amp);

    // ── trailing-mass lag spring (follow-through & overshoot on landing) ──
    const lagK = 170, lagC = dampingFor(lagK, 0.42);
    const vSrc = this.plan ? flightVel : this.baseVel;
    springStep(this.lag.x, -vSrc.x * 0.016 * amp, lagK, lagC, dt);
    springStep(this.lag.y, -vSrc.y * 0.016 * amp, lagK, lagC, dt);

    const target = v(
      this.base.x + this.wander.x * flightK + driftX + this.offset.x + this.lag.x.x,
      this.base.y + this.wander.y * flightK + driftY + bobY + this.offset.y + this.lag.y.x,
    );
    this.prevPos = this.pos;
    this.pos = this.clampToBounds(target);
    const instVel = v((this.pos.x - this.prevPos.x) / dt, (this.pos.y - this.prevPos.y) / dt);
    this.vel = v(damp(this.vel.x, instVel.x, 0.05, dt), damp(this.vel.y, instVel.y, 0.05, dt));
    const speed = len(this.vel);

    // ── facing (turns with the flight direction or what it looks at) ──
    let wantFace = this.faceDir;
    const dx = this.plan ? this.plan.p1.x - this.plan.p0.x : this.gazeTarget ? this.gazeTarget.x - this.pos.x : 0;
    if (Math.abs(dx) > (this.plan ? 14 : 70)) wantFace = dx > 0 ? 1 : -1;
    if (wantFace !== this.faceDir) { this.faceDir = wantFace; }
    springStep(this.face, this.faceDir, 420, dampingFor(420, 0.95), dt);

    // ── attention: eyes → head → body ──
    this.updateGaze(dt);

    // ── wings ──
    const thrustK = clamp(Math.max(thrust, speed / 700), 0, 1.2);
    this.wingBurst = damp(this.wingBurst, 0, 0.25, dt);
    const effHz = lerp(wingHz, 36, clamp(thrustK * 0.9, 0, 1)) + this.wingBurst * 14;
    const effAmp = clamp(wingAmp + thrustK * 0.4 + this.wingBurst * 0.4, 0, 1);
    f.wingHz = this.reduced ? 0 : damp(f.wingHz, effHz, 0.06, dt);
    f.wingAmp = this.reduced ? 0.05 : damp(f.wingAmp, effAmp, 0.08, dt);
    f.wingSpread = damp(f.wingSpread, this.mp.wingSpread + this.wingBurst * (1 - this.mp.wingSpread), 0.2, dt);

    // ── body rotation: bank with lateral velocity, pitch lean per mood ──
    const bank = clamp((this.vel.x * this.faceDir) * 0.014, -16, 16) * (this.reduced ? 0 : 1);
    const microRot = this.noiseR.fbm(t * 0.5) * 2.2 * amp;
    const rotT = bank + this.mp.pitch * 0.5 + microRot + this.tiltExtra;
    f.rot = damp(f.rot, rotT, 0.09, dt);

    // ── squash & stretch ──
    springStep(this.squashV, this.squash, 520, dampingFor(520, 0.55), dt);
    const stretch = clamp(speed / 2600, 0, 0.07) * amp;
    f.sy = clamp(this.squashV.x - stretch * 0.5, 0.88, 1.12);
    f.sx = clamp(1 / this.squashV.x + stretch, 0.9, 1.15);
    this.squash = 1;

    // ── limbs, glow, lids ──
    springStep(this.legSpr, legTarget, 260, dampingFor(260, 0.7), dt);
    f.legRaise = clamp(this.legSpr.x, 0, 1.2);
    const glowT = this.mp.glow + this.glowPulse + (this.now < this.afterglowUntil ? 0.12 : 0);
    f.glow = damp(f.glow, glowT, 0.2, dt);
    const lidT = Math.max(this.mp.lid, this.now < this.blinkUntil ? 1 : 0, this.lidMicro);
    f.lid = damp(f.lid, lidT, lidT > f.lid ? 0.025 : 0.05, dt);

    // ── composition into frame ──
    f.x = this.pos.x; f.y = this.pos.y;
    f.facing = this.face.x;
    f.speed = speed;
    f.shadowOpacity = this.reduced ? 0.22 : clamp(0.3 - speed / 4000, 0.12, 0.3);
    f.shadowScale = 1 - clamp(speed / 3000, 0, 0.15);
    if (!this.fadeHop) f.opacity = damp(f.opacity, 1, 0.1, dt);

    this.updateTrail(dt, speed);
    this.updateSparks(dt);
    this.updateProp(dt);
    return f;
  }

  // ───────────────────────────── behaviours ─────────────────────────────

  private behave(dt: number, amp: number, setLeg: (x: number) => void, setWing: (hz: number, a: number) => void): void {
    const r = this.rng;
    const t = this.bt;
    const sc = ENERGY[this.energy];
    const dir = this.faceDir;
    switch (this._mood) {
      case 'greeting': {
        setLeg(0.55 + 0.45 * Math.sin(t * 11));
        this.tiltExtra = Math.sin(t * 5) * 4;
        break;
      }
      case 'curious': {
        const g = this.cursor ?? this.gazeTarget;
        if (g) {
          const d = norm(sub(g, this.pos));
          this.offset = mul(d, 7 * amp);
          this.tiltExtra = d.x * dir * -4;
        }
        break;
      }
      case 'thinking': {
        const o = this.orbit;
        o.nextFlip -= dt;
        if (o.hold > 0) { o.hold -= dt; o.w = damp(o.w, 0, 0.12, dt); if (o.hold <= 0) { o.w = r.sign() * (2 * Math.PI) / r.range(2.8, 4.2); o.nextFlip = r.range(2.5, 5); o.center = v(r.range(-5, 5), r.range(-4, 4)); } }
        else if (o.nextFlip <= 0) { o.hold = r.range(0.5, 0.95); }
        o.a += o.w * dt * sc.speed;
        const R = 9 * amp;
        this.offset = v(o.center.x + Math.cos(o.a) * R, o.center.y + Math.sin(o.a) * R * 0.6);
        this.tiltExtra = Math.cos(o.a) * 4 + (o.hold > 0 ? 3 : 0);
        this.pupilBias = v(Math.cos(o.a + 1) * 0.35, -0.3 + Math.sin(o.a) * 0.15);
        break;
      }
      case 'searching': {
        if (!this.plan && !this.fadeHop && this.now >= this.searchWaitUntil) {
          const a = this.searchArea;
          const target = a
            ? v(a.x + r.range(0.1, 0.9) * a.w, a.y + r.range(0.1, 0.9) * a.h)
            : add(this.searchAnchor, v(r.range(-60, 60), r.range(-34, 34)));
          this.flyTo(target, { style: 'dart', speed: 1.1, look: target });
          this.searchWaitUntil = this.now + 99; // re-armed on arrival
          this.planDone = () => { this.searchWaitUntil = this.now + r.range(0.35, 0.95) / sc.behavior; };
        }
        if (!this.plan && this.now < this.searchWaitUntil) {
          this.tiltExtra = Math.sin(t * 6) * 5; // inspecting: quick head-bob
          this.lidMicro = 0;
        }
        setWing(15 * sc.freq, 0.5);
        break;
      }
      case 'reading': {
        this.scanT += dt;
        const period = 3.6 / sc.speed;
        const u = (this.scanT % period) / period;
        const y = u < 0.88 ? lerp(-12, 14, easeInOutCubic(u / 0.88)) : lerp(14, -12, easeOutCubic((u - 0.88) / 0.12));
        this.offset = v(0, y * amp);
        this.pupilBias = v(0.15, clamp(y / 26, -0.5, 0.6));
        break;
      }
      case 'acting': break;
      case 'typing': {
        if (this.now >= this.keyAt) {
          this.keystroke();
          const burstPause = r.chance(0.12);
          this.keyAt = this.now + (burstPause ? r.range(0.3, 0.6) : r.range(0.075, 0.2)) / sc.behavior;
        }
        break;
      }
      case 'waiting': {
        const k = Math.floor(t / 2.6);
        const look = Math.sin(t * 1.2 + k) * 0.8;
        this.pupilBias = v(look, Math.sin(t * 0.7) * 0.15);
        this.tiltExtra = look * 3;
        break;
      }
      case 'asking': {
        this.glowPulse = Math.sin(t * (2 * Math.PI / 1.6)) * 0.15;
        setLeg(1 + Math.sin(t * 3) * 0.06);
        break;
      }
      case 'success': {
        // pop → little loop → relaxed hover
        if (t > 0.5 && t < 1.45 && !this.reduced) {
          const u = (t - 0.5) / 0.95;
          const th = easeInOutCubic(u) * Math.PI * 2;
          this.offset = v(Math.sin(th) * 15 * amp * dir, -(1 - Math.cos(th)) * 8 * amp);
          this.tiltExtra = Math.sin(th) * 10;
        }
        this.glowPulse = clamp(1 - t / 2, 0, 1) * 0.3;
        break;
      }
      case 'confused': {
        // stop → tilt → look left → look right → small retreat
        const look = t < 0.25 ? 0 : t < 0.6 ? -1 : t < 0.95 ? 1 : t < 1.2 ? -0.4 : 0;
        this.pupilBias = v(look * 0.9 * dir, -0.05);
        this.tiltExtra = 14 + look * 4;
        const back = t > 0.9 ? easeOutCubic(clamp((t - 0.9) / 0.35, 0, 1)) * 10 : 0;
        const ret = t > 1.5 ? clamp((t - 1.5) / 0.6, 0, 1) : 0;
        this.offset = v(-dir * back * (1 - ret), 0);
        break;
      }
      case 'error': {
        const drop = easeOutCubic(clamp((t - 0.12) / 0.6, 0, 1)) * 9;
        this.offset = v(0, drop * amp);
        this.tiltExtra = -9 * easeOutCubic(clamp(t / 0.5, 0, 1));
        break;
      }
      case 'sleeping': {
        this.offset = v(0, 8 * easeOutCubic(clamp(this.bt / 1.4, 0, 1)));
        const breathe = Math.sin(this.bt * 1.3) * 0.012;
        this.squash = 1 + breathe + 0.0;
        if (!this.reduced && Math.floor(this.bt / 3.1) !== Math.floor((this.bt - dt) / 3.1) && this.bt > 1.5) this.spawnZ();
        break;
      }
      default: break;
    }
    // click beat
    if (this.clickT >= 0) {
      this.clickT += dt;
      const c = this.clickT;
      if (c < 0.07) { this.offset = add(this.offset, v(0, -4 * easeOutCubic(c / 0.07) * amp)); this.squash = 1.04; }
      else if (c < 0.13) { const u = (c - 0.07) / 0.06; this.offset = add(this.offset, v(0, lerp(-4, 8, easeOutCubic(u)) * amp)); this.squash = lerp(1.04, 0.94, u); }
      else if (c < 0.24) { const u = (c - 0.13) / 0.11; this.offset = add(this.offset, v(0, lerp(8, -1.5, easeOutCubic(u)) * amp)); this.squash = lerp(0.94, 1.03, u); if (c - dt < 0.13) this.emit('impact'); }
      else if (c < 0.46) { const u = (c - 0.24) / 0.22; this.offset = add(this.offset, v(0, lerp(-1.5, 0, easeOutCubic(u)) * amp)); this.squash = lerp(1.03, 1, u); }
      else this.clickT = -1;
    }
    if (this.keyKick > 0) {
      this.keyKick = Math.max(0, this.keyKick - dt * 9);
      this.offset = add(this.offset, v((this.rng.next() - 0.5) * 1.4 * this.keyKick * amp, 1.1 * this.keyKick * amp));
      this.squash *= 1 - 0.012 * this.keyKick;
      this.wingBurst = Math.max(this.wingBurst, this.keyKick * 0.25);
    }
  }

  private updateWander(dt: number, amp: number): void {
    if (this.now >= this.nextWanderAt) {
      const R = this.mp.wander * amp;
      const sc = ENERGY[this.energy];
      this.wanderTarget = v(this.rng.range(-R, R), this.rng.range(-R * 0.6, R * 0.6));
      this.nextWanderAt = this.now + this.rng.range(...this.mp.wanderEvery) / sc.behavior;
    }
    this.wander = dampV2(this.wander, this.wanderTarget, 0.55, dt);
  }

  /** Idle micro-behaviours; never the same one twice in a row, to avoid loop fatigue. */
  private idleLife(dt: number, amp: number): void {
    void dt;
    const sc = ENERGY[this.energy];
    if (this.now >= this.nextBlinkAt) {
      this.blinkUntil = this.now + 0.11;
      this.nextBlinkAt = this.now + this.rng.range(2.2, 5.5);
      this.emit('blink');
    }
    if (this.now >= this.nextMicroAt && this._mood === 'idle' && !this.plan) {
      const choices = ['glance', 'groom', 'turn', 'drift', 'stretch', 'hop', 'blink2'].filter((c) => c !== this.lastMicro);
      const pick = this.rng.pick(choices);
      this.lastMicro = pick;
      switch (pick) {
        case 'glance': { const a = this.rng.range(0, Math.PI * 2); this.glanceTo = add(this.pos, v(Math.cos(a) * 160, Math.sin(a) * 90)); this.glanceUntil = this.now + this.rng.range(0.4, 0.9); break; }
        case 'groom': this.legSpr.v += 5; this.after(260, () => (this.legSpr.v += 5)); this.after(520, () => (this.legSpr.v += 4)); break;
        case 'turn': this.faceDir = (this.faceDir * -1) as 1 | -1; break;
        case 'drift': { const R = 26 * amp; this.wanderTarget = v(this.rng.range(-R, R), this.rng.range(-R * 0.5, R * 0.5)); break; }
        case 'stretch': this.wingBurst = 0.8; break;
        case 'hop': this.hop(this.rng.range(5, 9)); break;
        case 'blink2': this.blinkUntil = this.now + 0.1; this.after(220, () => (this.blinkUntil = this.now + 0.1)); break;
      }
      const base = this.afterglowUntil > this.now ? 4.2 : 2.6;
      this.nextMicroAt = this.now + this.rng.range(base, base + 3.8) / sc.behavior;
    }
  }

  private autoMoods(dt: number): void {
    const near = this.cursor ? dist(this.cursor, this.pos) : Infinity;
    // delayed attention: only notice the cursor after it has lingered nearby
    if (near < 170) { this.cursorNearFor += dt; this.cursorFarFor = 0; } else { this.cursorFarFor += dt; this.cursorNearFor = 0; }

    if (this._mood === 'idle' && this.cursorNearFor > 0.55 && !this.plan) this.setMood('curious', { auto: true });
    if (this.autoCurious && this._mood === 'curious' && this.cursorFarFor > 1.4) this.setMood('idle', { auto: true });

    // occasional approach/avoidance, only when nothing critical is happening
    if (!this.mp.critical && this.cursor && !this.plan && this.now >= this.nextNudgeAt) {
      this.nextNudgeAt = this.now + this.rng.range(5, 9);
      if (near < 200 && near > 40) {
        const away = this.cursorSpeed > 1400 && near < 130;
        const d = norm(sub(this.cursor, this.pos));
        this.nudge = mul(d, away ? -16 : 14 * this.mp.cursorWeight);
        this.nudgeUntil = this.now + (away ? 0.9 : 2.2);
        if (away) { this.lag.x.v += -d.x * 220; this.legSpr.v += 4; }
      }
    }
    if (this.nudgeUntil < this.now && (this.nudge.x !== 0 || this.nudge.y !== 0)) this.nudge = v();

    // fall asleep after a long calm
    if (this.sleepAfter > 0 && this._mood === 'idle' && !this.plan && this.now - this.lastActivity > this.sleepAfter) this.setMood('sleeping', { force: true });
  }

  private glanceAtCursor(sec: number): void {
    if (this.cursor) { this.glanceTo = { ...this.cursor }; this.glanceUntil = this.now + sec; }
  }

  private updateGaze(dt: number): void {
    const f = this.frame;
    const mp = this.mp;
    // choose what to look at
    let g: Vec | null = null;
    switch (mp.gaze) {
      case 'cursor': g = this.cursor ?? this.gazeTarget; break;
      case 'target': g = this.gazeTarget ?? this.cursor; break;
      case 'user': g = this.cursor ?? this.userPoint ?? this.gazeTarget; break;
      case 'down': g = add(this.pos, v(this.faceDir * 30, 120)); break;
      default: {
        if (this.now >= this.nextGazeAt) {
          const a = this.rng.range(0, Math.PI * 2);
          this.wanderGaze = add(this.pos, v(Math.cos(a) * 140, Math.sin(a) * 80));
          this.nextGazeAt = this.now + this.rng.range(0.9, 2.8);
        }
        // weight toward the cursor when it has been noticed; otherwise let it mind its own business
        g = this.cursor && this.cursorNearFor > 0.5 && mp.cursorWeight > 0.3 ? this.cursor : this.gazeTarget && this._mood !== 'idle' ? this.gazeTarget : this.wanderGaze;
      }
    }
    if (this.flightLook()) g = this.gazeTarget;
    if (this.glanceTo && this.now < this.glanceUntil) g = this.glanceTo;
    // peripheral glimpses at the cursor even in critical moods (rare, short)
    if (!g) g = add(this.pos, v(this.faceDir * 100, 0));

    const rel = sub(g, this.pos);
    const dist2 = Math.max(1, len(rel));
    const px = clamp((rel.x * this.faceDir) / 120, -1, 1) * Math.min(1, dist2 / 40) + this.pupilBias.x;
    const py = clamp(rel.y / 90, -1, 1) * Math.min(1, dist2 / 40) + this.pupilBias.y;
    const k = 900 / Math.max(0.02, mp.attention / 0.05);
    springStep(this.pupil.x, clamp(px, -1, 1), k, dampingFor(k, 0.8), dt);
    springStep(this.pupil.y, clamp(py, -1, 1), k, dampingFor(k, 0.8), dt);
    f.pupilX = this.pupil.x.x; f.pupilY = this.pupil.y.x;
    f.pupilScale = damp(f.pupilScale, mp.pupil, 0.1, dt);

    // head lags eyes, body lags head
    const headT = clamp(Math.atan2(rel.y, Math.abs(rel.x) + 40) * (180 / Math.PI) * 0.28, -14, 14) + mp.headTilt * this.faceDir * 0 + mp.headTilt + this.tiltExtra * 0.5;
    springStep(this.head, headT, 150, dampingFor(150, 0.75), dt);
    f.headRot = this.head.x;
  }
  private flightLook(): boolean { return this.plan !== null && this.gazeTarget !== null; }

  // ───────────────────────────── effects ─────────────────────────────

  private spawnSparks(n: number): void {
    let made = 0;
    for (const s of this.sparks) {
      if (made >= n) break;
      if (s.alive) continue;
      const a = this.rng.range(0, Math.PI * 2);
      const sp = this.rng.range(40, 120);
      s.alive = true; s.age = 0; s.life = this.rng.range(0.55, 0.95);
      s.x = this.pos.x; s.y = this.pos.y;
      s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp - 26;
      s.size = this.rng.range(1.6, 3.2); s.tone = this.rng.pick([0, 1, 2] as const);
      made++;
    }
  }
  private spawnZ(): void {
    const s = this.sparks.find((q) => !q.alive); if (!s) return;
    s.alive = true; s.age = 0; s.life = 2.2; s.x = this.pos.x + this.faceDir * 18; s.y = this.pos.y - 14;
    s.vx = this.faceDir * 6; s.vy = -12; s.size = 2.2; s.tone = 2;
  }
  private updateSparks(dt: number): void {
    for (const s of this.sparks) {
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.life) { s.alive = false; continue; }
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.vx *= Math.pow(0.12, dt); s.vy = s.vy * Math.pow(0.12, dt) + 8 * dt;
    }
  }
  private updateTrail(dt: number, speed: number): void {
    this.trailAcc += dt;
    if (this.trailAcc >= 1 / 90) {
      this.trailAcc = 0;
      const last = this.trailBuf.shift() as Vec;
      last.x = this.pos.x; last.y = this.pos.y;
      this.trailBuf.push(last);
    }
    const dart = this.plan?.style === 'dart';
    const target = dart ? clamp((speed - 380) / 700, 0, 0.6) : clamp((speed - 900) / 1200, 0, 0.3);
    this.frame.trail = this.reduced ? 0 : damp(this.frame.trail, target, 0.05, dt);
  }
  private updateProp(dt: number): void {
    const p = this.frame.prop;
    p.kind = this.propKind;
    if (this.propKind === 'none') { p.opacity = damp(p.opacity, 0, 0.05, dt); p.scale = damp(p.scale, 0, 0.05, dt); return; }
    this.propT += dt;
    springStep(this.propSwing, clamp(-this.vel.x * 0.035, -28, 28), 90, dampingFor(90, 0.3), dt);
    if (this.propDrop) {
      const d = this.propDrop; d.t += dt;
      const u = clamp(d.t / 0.46, 0, 1);
      const e = easeOutBack(u, 0.8);
      p.dx = lerp(d.from.x, d.to.x, e) - this.pos.x; p.dy = lerp(d.from.y, d.to.y, easeInOutCubic(u)) - this.pos.y;
      p.rot = lerp(this.propSwing.x, 0, u); p.scale = lerp(1, 1.06, u); p.opacity = 1; p.falling = true;
      if (u >= 1) { const cb = d.cb; this.propDrop = null; this.propKind = 'none'; p.falling = false; cb?.(); this.emit('landed'); }
      return;
    }
    p.falling = false;
    p.scale = easeOutBack(clamp(this.propT / 0.28, 0, 1));
    p.opacity = clamp(this.propT / 0.12, 0, 1);
    p.dx = -this.faceDir * 2; p.dy = 30 + Math.sin(this.now * 3.2) * 0.8;
    p.rot = this.propSwing.x;
  }

  private runTimers(): void {
    if (!this.timers.length) return;
    const due = this.timers.filter((t) => t.at <= this.now);
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.at > this.now);
    for (const t of due) t.fn();
  }

  private clampToBounds(p: Vec): Vec {
    const b = this.opts.bounds?.();
    if (!b) return p;
    const m = (this.opts.size ?? 64) * 0.5;
    return { x: clamp(p.x, m, Math.max(m, b.w - m)), y: clamp(p.y, m, Math.max(m, b.h - m)) };
  }
}

function dampV2(c: Vec, t: Vec, half: number, dt: number): Vec { return { x: damp(c.x, t.x, half, dt), y: damp(c.y, t.y, half, dt) }; }

export { FLIGHT_MOODS, smoothstep };
