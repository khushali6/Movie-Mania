import { z } from 'zod';
import { AgentEventSchema, CommandSchema, ResultSchema } from '@fruitfly/core';

/** Everything crossing an extension boundary is parsed with these. */
export const PanelMsgSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), event: AgentEventSchema }),
  z.object({ kind: z.literal('hello'), running: z.boolean(), taskId: z.string().optional(), backlog: z.array(AgentEventSchema), nectar: z.number(), route: z.string(), gateway: z.enum(['connected', 'asleep', 'auth', 'none']) }),
  z.object({ kind: z.literal('env'), nectar: z.number().optional(), route: z.string().optional(), gateway: z.enum(['connected', 'asleep', 'auth', 'none']).optional(), permission: z.object({ host: z.string() }).nullable().optional(), running: z.boolean().optional() }),
  z.object({ kind: z.literal('inspector'), data: z.unknown() }),
]);
export type PanelMsg = z.infer<typeof PanelMsgSchema>;

export const InternalMsgSchema = z.discriminatedUnion('ff', [
  z.object({ ff: z.literal('command'), command: CommandSchema }),
  z.object({ ff: z.literal('permission_granted'), host: z.string() }),
  z.object({ ff: z.literal('permission_denied'), host: z.string() }),
  z.object({ ff: z.literal('takeover_from_page') }),
  z.object({ ff: z.literal('stop_from_page') }),
  z.object({ ff: z.literal('pantry_changed') }),
  z.object({ ff: z.literal('settings_changed') }),
  z.object({ ff: z.literal('fly_path'), taskId: z.string().optional(), pts: z.array(z.tuple([z.number(), z.number(), z.number()])).max(200) }),
  z.object({ ff: z.literal('get_inspector') }),
  z.object({ ff: z.literal('run_saved'), id: z.string() }),
  z.object({ ff: z.literal('ledger_get') }),
  z.object({ ff: z.literal('diagnostics') }),
  z.object({ ff: z.literal('test_gateway'), url: z.string(), key: z.string().optional() }),
  z.object({ ff: z.literal('open_panel'), tabId: z.number().optional() }),
  z.object({ ff: z.literal('add_page_to_pantry'), tabId: z.number().optional() }),
  z.object({ ff: z.literal('forget_site'), host: z.string() }),
  z.object({ ff: z.literal('wipe_all') }),
]);
export type InternalMsg = z.infer<typeof InternalMsgSchema>;

export const OverlayMsgSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('show'), size: z.number().optional(), energy: z.enum(['calm', 'normal', 'lively']).optional(), reduced: z.boolean().optional() }),
  z.object({ op: z.literal('hide') }),
  z.object({ op: z.literal('mood'), mood: z.string() }),
  z.object({ op: z.literal('target'), ref: z.string().nullable(), label: z.string().optional(), kind: z.string().optional() }),
  z.object({ op: z.literal('click') }),
  z.object({ op: z.literal('needs_you'), text: z.string().optional() }),
]);
export type OverlayMsg = z.infer<typeof OverlayMsgSchema>;
export const OVERLAY_KEY = 'ff-overlay';
export { ResultSchema };
