import type { AgentEvent, Sensitivity } from '@fruitfly/core';
import type { InspectorData } from '../components/agent';
import type { DocView, NoteView, PassageView, ProfileFieldView, VaultFieldView } from '../components/pantry';
import type { GatewayState } from '../components/models';
import type { SessionStore } from '../session';
import type { Store } from '../store';
import type { FixAction } from './copy';

export interface PanelEnv {
  mode: 'demo' | 'live';
  routeLabel: string;
  gateway: GatewayState;
  /** 0..1 fraction of today's nectar left */
  nectar: number;
  firstRun?: boolean;
  storageNearlyFull?: boolean;
  permission?: { host: string };
  localModel?: boolean;
  pantryOn: boolean;
  /** busy flag from the controller (task is running even if status lags) */
  running: boolean;
}

export interface PantryApi {
  subscribe(cb: () => void): () => void;
  docs(): Promise<DocView[]>;
  addFiles(files: File[]): Promise<void>;
  addText(title: string, text: string, s: Sensitivity): Promise<void>;
  remove(id: string): Promise<void>;
  setSensitivity(id: string, s: Sensitivity): Promise<void>;
  search(q: string): Promise<PassageView[]>;
  profile(): Promise<{ fields: ProfileFieldView[]; digestTokens: number; standing: { lines: number; tokens: number; overLimit: boolean } }>;
  setProfile(key: string, patch: Partial<ProfileFieldView>): Promise<void>;
  notes(): Promise<NoteView[]>;
  keepNote(id: string): Promise<void>; deleteNote(id: string): Promise<void>; editNote(id: string, text: string): Promise<void>;
  vault: { state(): Promise<'unset' | 'locked' | 'unlocked'>; fields(): Promise<VaultFieldView[]>; setup(p: string): Promise<void>; unlock(p: string): Promise<void>; lock(): Promise<void>; add(key: string, label: string, v: string): Promise<void>; remove(key: string): Promise<void> };
  usage(): Promise<{ bytes: number; quota?: number; nearlyFull: boolean }>;
}

export interface PanelController {
  session: SessionStore;
  env: Store<PanelEnv>;
  onEvent(fn: (e: AgentEvent) => void): () => void;
  start(goal: string): void;
  stop(): void; pause(): void; resume(): void;
  approve(id: string): void; cancelApproval(id: string): void; takeover(): void;
  compact(): void; newTask(): void;
  answer?(text: string): void;
  inspector(): Promise<InspectorData> | InspectorData;
  pantry?: PantryApi;
  suggestions(): string[];
  fix(action: FixAction): void;
  openSettings?(page?: 'models' | 'privacy' | 'general' | 'pantry'): void;
  saveTask?(): void; replay?(): void;
  /** the result card has landed and may unfold */
  revealResult(): void;
}
