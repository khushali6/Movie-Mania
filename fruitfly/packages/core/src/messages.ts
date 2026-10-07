import { z } from 'zod';
import { AgentEventSchema, SensitivitySchema } from './events';

/** UI → service worker commands. Every message crossing a boundary is parsed with these. */
export const CommandSchema = z.discriminatedUnion('cmd', [
  z.object({ cmd: z.literal('start_task'), goal: z.string().min(1).max(4000), mode: z.enum(['demo', 'live']).optional(), profile: z.enum(['fast', 'smart', 'local']).optional() }),
  z.object({ cmd: z.literal('stop') }),
  z.object({ cmd: z.literal('pause') }),
  z.object({ cmd: z.literal('resume') }),
  z.object({ cmd: z.literal('approve'), approvalId: z.string() }),
  z.object({ cmd: z.literal('cancel_approval'), approvalId: z.string() }),
  z.object({ cmd: z.literal('takeover') }),
  z.object({ cmd: z.literal('compact') }),
  z.object({ cmd: z.literal('new_task') }),
  z.object({ cmd: z.literal('get_state') }),
  z.object({ cmd: z.literal('keep_note'), noteId: z.string(), keep: z.boolean() }),
  z.object({ cmd: z.literal('pantry_add_text'), title: z.string(), text: z.string(), sensitivity: SensitivitySchema }),
  z.object({ cmd: z.literal('pantry_remove'), docId: z.string() }),
  z.object({ cmd: z.literal('pantry_set_sensitivity'), docId: z.string(), sensitivity: SensitivitySchema }),
  z.object({ cmd: z.literal('pantry_search'), query: z.string() }),
  z.object({ cmd: z.literal('set_setting'), key: z.string(), value: z.unknown() }),
  z.object({ cmd: z.literal('ping_gateway'), baseUrl: z.string().optional() }),
]);
export type Command = z.infer<typeof CommandSchema>;

/** Service worker → UI. */
export const BroadcastSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), event: AgentEventSchema }),
  z.object({ kind: z.literal('state'), state: z.record(z.unknown()) }),
  z.object({ kind: z.literal('overlay'), op: z.enum(['show', 'hide', 'highlight', 'fly_to']), rect: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).optional(), label: z.string().optional() }),
]);
export type Broadcast = z.infer<typeof BroadcastSchema>;

export const Reply = z.object({ ok: z.boolean(), data: z.unknown().optional(), error: z.string().optional() });
export type ReplyMsg = z.infer<typeof Reply>;
