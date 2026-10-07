import { useState } from 'react';
import { FLY_MOODS, type FlyEnergy, type FlyMood } from '@fruitfly/core';
import { ProceduralFly } from '@fruitfly/ui';

const NOTES: Record<FlyMood, string> = {
  idle: 'Alive when nothing happens', greeting: 'Wave, hop, settle', curious: 'Leans toward the cursor', thinking: 'Slow orbit, pauses, turns',
  searching: 'Short darts, inspects', reading: 'Hovers, scans down', acting: 'Compress, dive, rebound', typing: 'Tiny rhythmic taps',
  waiting: 'Slow fan, looks around', asking: 'Foreleg up, "I need you"', success: 'Pop, loop, 5–12 sparks', confused: 'Tilt, look L/R, back off',
  error: 'Calm stop, recoil, drop', sleeping: 'Folds wings, slow breath',
};

export function Moods() {
  const [energy, setEnergy] = useState<FlyEnergy>('normal'); const [reduced, setReduced] = useState(false);
  return (
    <>
      <h2>Controls</h2>
      <div className="bar" style={{ position: 'static' }}>
        <div className="ff-seg-ctl" role="group" aria-label="Energy">{(['calm', 'normal', 'lively'] as const).map((e) => <button key={e} aria-pressed={energy === e} onClick={() => setEnergy(e)}>{e}</button>)}</div>
        <button className="ff-btn ff-btn--sm" aria-pressed={reduced} onClick={() => setReduced((r) => !r)} data-testid="toggle-reduced">Reduced motion: {reduced ? 'on' : 'off'}</button>
      </div>
      <h2>Moods</h2>
      <div className="grid" data-testid="mood-grid">
        {FLY_MOODS.map((m) => (
          <div className="card" key={m} data-mood={m}>
            <div className="stage"><ProceduralFly mood={m} size={96} energy={energy} reducedMotion={reduced} seed={m} label={`${m} fly`} /></div>
            <b>{m}</b><span>{NOTES[m]}</span>
          </div>))}
      </div>
    </>
  );
}
