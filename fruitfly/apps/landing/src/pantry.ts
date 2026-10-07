import { Pantry } from '@fruitfly/pantry';
import { seedDemoPantry } from '@fruitfly/demo';

/** One in-memory Pantry shared by the hero demo and the "stays home" section. Fake documents; nothing persists. */
export const demoPantry = new Pantry({ vault: { iterations: 2000 } });
export const pantryReady: Promise<void> = seedDemoPantry(demoPantry);
