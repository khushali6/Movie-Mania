/** User-facing error copy: short, human, one clear next action (Build Plan v2 §10). */
export type FixAction = 'start-gateway' | 'use-demo' | 'other-route' | 'reconnect' | 'wait' | 'switch-route' | 'raise-cap' | 'continue-local' | 'compact' | 'take-over' | 'review' | 'continue' | 'setup-ollama' | 'skip-doc' | 'manage-storage' | 'retry' | 'allow-site';
export interface ErrorCopy { title: string; body?: string; actions: { label: string; fix: FixAction }[] }

export const ERROR_COPY: Record<string, ErrorCopy> = {
  gateway_down: { title: "I can't reach your gateway.", body: 'It might not be running.', actions: [{ label: 'Start it', fix: 'start-gateway' }, { label: 'Use demo', fix: 'use-demo' }, { label: 'Use another route', fix: 'other-route' }] },
  network: { title: "I can't reach your gateway.", body: 'The connection dropped.', actions: [{ label: 'Try again', fix: 'retry' }, { label: 'Use demo', fix: 'use-demo' }] },
  auth: { title: "That key didn't work.", actions: [{ label: 'Reconnect', fix: 'reconnect' }] },
  rate_limited: { title: 'Catching my breath.', body: 'The free pool is busy. I will carry on in a moment.', actions: [{ label: 'Wait', fix: 'wait' }, { label: 'Switch route', fix: 'switch-route' }] },
  budget_reached: { title: "That's my limit for today.", body: 'You can raise the cap, or I can carry on with a model on this device.', actions: [{ label: 'Raise cap', fix: 'raise-cap' }, { label: 'Continue locally', fix: 'continue-local' }] },
  context_length: { title: 'This got long. Tidying up.', actions: [{ label: 'Compact', fix: 'compact' }] },
  page_blocked: { title: 'That page fought back. Trying another way.', actions: [{ label: 'Take over', fix: 'take-over' }] },
  injection_suspected: { title: 'This page seems to be giving me instructions. I am ignoring them.', actions: [{ label: 'Review', fix: 'review' }, { label: 'Continue', fix: 'continue' }] },
  local_model_missing: { title: 'That one stays on this device, and I need a local model to read it.', actions: [{ label: 'Set up Ollama', fix: 'setup-ollama' }, { label: 'Skip doc', fix: 'skip-doc' }] },
  storage_full: { title: 'Pantry is nearly full.', actions: [{ label: 'Manage storage', fix: 'manage-storage' }] },
  permission_needed: { title: 'I need your permission for this site.', actions: [{ label: 'Allow this site', fix: 'allow-site' }] },
  loop_detected: { title: 'I kept repeating myself, so I stopped.', body: 'Want to take over from here?', actions: [{ label: 'Take over', fix: 'take-over' }] },
  egress_blocked: { title: "I didn't send that.", body: 'Personal info stays here unless you allow it for this route.', actions: [{ label: 'Review', fix: 'review' }] },
  vault_locked: { title: 'Your vault is locked.', actions: [{ label: 'Unlock', fix: 'review' }] },
  unknown: { title: 'Something went sideways.', actions: [{ label: 'Try again', fix: 'retry' }] },
};
export const errorCopy = (code: string): ErrorCopy => ERROR_COPY[code] ?? ERROR_COPY.unknown!;
