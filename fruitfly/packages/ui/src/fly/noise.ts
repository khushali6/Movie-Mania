import type { Rng } from '@fruitfly/core';

/** Smooth 1D value noise with seeded lattice. Output in [-1, 1]. Never loops audibly. */
export class SmoothNoise {
  private readonly lattice: Float32Array;
  constructor(rng: Rng, size = 256) {
    this.lattice = new Float32Array(size);
    for (let i = 0; i < size; i++) this.lattice[i] = rng.next() * 2 - 1;
  }
  at(t: number): number {
    const n = this.lattice.length;
    const i = Math.floor(t);
    const f = t - i;
    const a = this.lattice[((i % n) + n) % n] as number;
    const b = this.lattice[(((i + 1) % n) + n) % n] as number;
    const s = f * f * (3 - 2 * f);
    return a + (b - a) * s;
  }
  /** Two octaves for a more organic feel. */
  fbm(t: number): number { return this.at(t) * 0.7 + this.at(t * 2.13 + 17.3) * 0.3; }
}
