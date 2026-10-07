import type { CallPurpose, ChatMessage, FruitflyError, ProfileName, RouteKind, ToolCall, ToolSpec, Usage } from '@fruitfly/core';
import type { EgressGuard, PreparedRequest } from '@fruitfly/egress';

export type ProviderId = 'freellmapi' | 'openai-compat' | 'anthropic' | 'gemini' | 'ollama' | 'scripted';

export interface Caps { tools: boolean; vision: boolean; streaming: boolean; json: boolean; maxContext: number; maxOutput: number }
export interface Limits { rpm: number; tpm: number }

export interface Route {
  id: string;
  label: string;
  provider: ProviderId;
  model: string;
  kind: RouteKind;
  allowsPersonal: boolean;
  baseUrl: string;
  caps: Caps;
  limits: Limits;
  /** Name of the secret in the key store (never the key itself). */
  keyRef?: string;
}

export interface RouteProfile { name: ProfileName; chain: Route[] }

export interface CompletionRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  purpose: CallPurpose;
  maxOutputTokens?: number;
  temperature?: number;
  json?: boolean;
  /** owner key for fair-share among subagents */
  owner?: string;
  /** foreground user turn > planner > subagent > background */
  priority?: Priority;
  /** minimum context window the caller needs, tokens */
  needsContext?: number;
  needsVision?: boolean;
  onDelta?: (text: string) => void;
}

export type Priority = 'foreground' | 'planner' | 'subagent' | 'background';
export const PRIORITY_RANK: Record<Priority, number> = { foreground: 0, planner: 1, subagent: 2, background: 3 };

export interface CompletionResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
  routeId: string;
  model: string;
  finish: 'stop' | 'tool_calls' | 'length' | 'filtered';
  /** gateway-reported upstream, e.g. X-Routed-Via */
  routedVia?: string;
  cached?: boolean;
}

export interface ProviderContext {
  route: Route;
  guard: EgressGuard;
  prepared: PreparedRequest;
  signal: AbortSignal;
  key: string | undefined;
}

export interface Provider {
  id: ProviderId;
  complete(req: CompletionRequest, ctx: ProviderContext): Promise<CompletionResponse>;
  embed?(texts: string[], ctx: Omit<ProviderContext, 'prepared'>): Promise<number[][]>;
}

export type ProviderError = FruitflyError & { status?: number; retryAfterMs?: number };

export type RouterEvent =
  | { type: 'route_switch'; from?: string; to: string; reason: string }
  | { type: 'retry'; route: string; reason: string; waitMs: number }
  | { type: 'throttled'; route: string; untilMs: number; queuePosition: number }
  | { type: 'unthrottled'; route: string }
  | { type: 'breaker'; route: string; state: string }
  | { type: 'usage'; route: string; usage: Usage };
