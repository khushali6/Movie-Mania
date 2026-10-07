export const FLY_MOODS = [
  'idle', 'greeting', 'curious', 'thinking', 'searching', 'reading', 'acting',
  'typing', 'waiting', 'asking', 'success', 'confused', 'error', 'sleeping',
] as const;
export type FlyMood = (typeof FLY_MOODS)[number];
export type FlyEnergy = 'calm' | 'normal' | 'lively';
export type FlyProp = 'none' | 'card' | 'report' | 'document';
