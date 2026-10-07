import type { FlyMood, FlyEnergy } from '@fruitfly/core';

export interface MoodParams {
  /** minimum time the mood is held before another may replace it (ms) */
  minDwell: number;
  /** hover wander radius (px) and how often it picks a new drift target (sec) */
  wander: number;
  wanderEvery: [number, number];
  bob: number;            // vertical bob amplitude px
  bobHz: number;
  wingHz: number;         // stylised wing frequency (Hz)
  wingAmp: number;        // 0..1
  wingSpread: number;     // 0 folded .. 1 open
  headTilt: number;       // deg
  gaze: 'wander' | 'cursor' | 'target' | 'down' | 'user';
  /** how strongly the cursor can steer gaze/approach in this mood (0 = ignore) */
  cursorWeight: number;
  /** critical moods are never disturbed by cursor chasing */
  critical: boolean;
  glow: number;
  lid: number;            // resting eyelid closure 0..1
  legRaise: number;
  /** pupil dilation: <1 small / >1 big */
  pupil: number;
  /** body pitch bias deg (leans) */
  pitch: number;
  /** how fast the fly turns attention (half-life s for pupils) */
  attention: number;
}

const base: MoodParams = {
  minDwell: 400, wander: 14, wanderEvery: [1.4, 3.6], bob: 2.2, bobHz: 0.55,
  wingHz: 9, wingAmp: 0.34, wingSpread: 1, headTilt: 0, gaze: 'wander', cursorWeight: 0.7,
  critical: false, glow: 0, lid: 0, legRaise: 0, pupil: 1, pitch: 0, attention: 0.05,
};

const m = (p: Partial<MoodParams>): MoodParams => ({ ...base, ...p });

export const MOOD_PARAMS: Record<FlyMood, MoodParams> = {
  idle:      m({ minDwell: 300 }),
  greeting:  m({ minDwell: 900, wander: 5, bob: 3, wingHz: 13, wingAmp: 0.5, headTilt: 8, gaze: 'cursor', cursorWeight: 1, legRaise: 1, glow: 0.2 }),
  curious:   m({ minDwell: 600, wander: 7, wingHz: 11, wingAmp: 0.42, headTilt: 12, gaze: 'cursor', cursorWeight: 1, pupil: 1.12, pitch: -4 }),
  thinking:  m({ minDwell: 700, wander: 4, wanderEvery: [2.5, 5], bob: 1.6, bobHz: 0.35, wingHz: 7, wingAmp: 0.26, headTilt: 9, gaze: 'wander', cursorWeight: 0.15, critical: true, pupil: 0.95 }),
  searching: m({ minDwell: 700, wander: 3, wingHz: 15, wingAmp: 0.5, gaze: 'target', cursorWeight: 0.1, critical: true, pitch: -3 }),
  reading:   m({ minDwell: 800, wander: 3, bob: 1.2, wingHz: 8, wingAmp: 0.28, headTilt: 3, gaze: 'target', cursorWeight: 0.1, critical: true, pitch: 2 }),
  acting:    m({ minDwell: 650, wander: 2, wingHz: 18, wingAmp: 0.6, gaze: 'target', cursorWeight: 0.05, critical: true, pupil: 1.05, pitch: -2 }),
  typing:    m({ minDwell: 800, wander: 1.5, bob: 1, wingHz: 14, wingAmp: 0.46, headTilt: 2, gaze: 'target', cursorWeight: 0.05, critical: true, pitch: 4 }),
  waiting:   m({ minDwell: 800, wander: 8, wanderEvery: [2, 4.5], bob: 1.8, bobHz: 0.42, wingHz: 5.5, wingAmp: 0.62, gaze: 'wander', cursorWeight: 0.35, headTilt: 3 }),
  asking:    m({ minDwell: 600, wander: 1.5, bob: 1.2, wingHz: 9, wingAmp: 0.3, headTilt: 7, gaze: 'user', cursorWeight: 1, critical: true, legRaise: 1, glow: 0.45, pupil: 1.1 }),
  success:   m({ minDwell: 2100, wander: 6, bob: 2.6, wingHz: 16, wingAmp: 0.55, headTilt: 6, gaze: 'cursor', cursorWeight: 0.6, glow: 0.6, pupil: 1.18 }),
  confused:  m({ minDwell: 1700, wander: 3, wingHz: 8, wingAmp: 0.3, headTilt: 15, gaze: 'wander', cursorWeight: 0.2, critical: true, legRaise: 0.35, pupil: 0.9 }),
  error:     m({ minDwell: 1500, wander: 2, bob: 1, wingHz: 5, wingAmp: 0.22, headTilt: -9, gaze: 'down', cursorWeight: 0, critical: true, pupil: 0.8, pitch: 8, glow: 0 }),
  sleeping:  m({ minDwell: 1200, wander: 0, bob: 0.9, bobHz: 0.22, wingHz: 1.1, wingAmp: 0.04, wingSpread: 0.0, headTilt: 10, gaze: 'down', cursorWeight: 0, lid: 1, pupil: 0.7, pitch: 6, attention: 0.3 }),
};

export const ENERGY: Record<FlyEnergy, { amp: number; speed: number; freq: number; behavior: number }> = {
  calm:   { amp: 0.6, speed: 0.8, freq: 0.8, behavior: 0.7 },
  normal: { amp: 1, speed: 1, freq: 1, behavior: 1 },
  lively: { amp: 1.35, speed: 1.2, freq: 1.2, behavior: 1.4 },
};

/** Moods a mood may flow into without the caller asking twice (reduces flicker). */
export const MOOD_COOLDOWN_AFTER: Partial<Record<FlyMood, FlyMood>> = {
  success: 'idle',
  greeting: 'idle',
  confused: 'thinking',
  error: 'idle',
};

/** After these moods the next idle gets a lighter "afterglow" for a while. */
export const AFTERGLOW: Partial<Record<FlyMood, number>> = { success: 5000, error: 2500, confused: 1500 };
