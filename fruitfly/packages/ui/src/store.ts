import { useSyncExternalStore } from 'react';

/** Minimal observable value store (panel environment, settings). */
export class Store<T> {
  private v: T; private ls = new Set<() => void>();
  constructor(initial: T) { this.v = initial; }
  get = (): T => this.v;
  set = (next: T | ((p: T) => T)): void => { this.v = typeof next === 'function' ? (next as (p: T) => T)(this.v) : next; this.ls.forEach((l) => l()); };
  patch = (p: Partial<T>): void => this.set({ ...this.v, ...p });
  subscribe = (l: () => void): (() => void) => { this.ls.add(l); return () => this.ls.delete(l); };
}
export function useStore<T>(s: Store<T>): T { return useSyncExternalStore(s.subscribe, s.get, s.get); }
