import type { Sensitivity } from './sensitivity';

export interface ModelInfo {
  id: string;
  label?: string;
  maxContext: number;
  maxOutput: number;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsStreaming: boolean;
}

export interface ToolCall { id: string; name: string; args: Record<string, unknown> }

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
  /** Sensitivity of the content — the egress guard reads this, never the text. */
  sensitivity?: Sensitivity;
  /** Provider-side cache breakpoint hint (Anthropic cache_control). */
  cacheBreakpoint?: boolean;
  segmentId?: string;
  segmentKind?: SegmentKind;
}

export interface JsonSchema { type?: string; description?: string; properties?: Record<string, JsonSchema>; required?: string[]; items?: JsonSchema; enum?: unknown[]; [k: string]: unknown }
export interface ToolSpec { name: string; description: string; parameters: JsonSchema; group?: string }

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type SegmentKind = 'system' | 'tools' | 'profile' | 'docs' | 'scratchpad' | 'history' | 'observation';

export interface ContextSegment {
  id: string;
  kind: SegmentKind;
  tokens: number;
  cacheable: boolean;
  sensitivity: Sensitivity;
  content: string;
}

export interface ToolResult<T> {
  data: T;
  tokens: number;
  truncated: boolean;
  nextCursor?: string;
  hint?: string;
  handle?: string;
}

export type RouteKind = 'local' | 'remote';
export type ProfileName = 'fast' | 'smart' | 'vision' | 'embed' | 'local';
export type CallPurpose = 'plan' | 'summarize' | 'intent' | 'critic' | 'subagent' | 'enrich';

export class FruitflyError extends Error {
  constructor(public code: ErrorCode, message: string, public detail?: Record<string, unknown>) {
    super(message);
    this.name = 'FruitflyError';
  }
}

export type ErrorCode =
  | 'rate_limited' | 'server_error' | 'timeout' | 'network' | 'context_length' | 'malformed_output'
  | 'auth' | 'content_filtered' | 'gateway_down' | 'aborted' | 'budget_reached' | 'egress_blocked'
  | 'no_route' | 'local_model_missing' | 'injection_suspected' | 'storage_full' | 'permission_needed'
  | 'page_blocked' | 'loop_detected' | 'vault_locked' | 'unknown';
