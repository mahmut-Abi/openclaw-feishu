import { z } from "zod";
export { z };

const DmPolicySchema = z.enum(["open", "pairing", "allowlist"]);
const GroupPolicySchema = z.enum(["open", "allowlist", "disabled"]);
const FeishuDomainSchema = z.enum(["feishu", "lark"]);
const FeishuConnectionModeSchema = z.enum(["websocket", "webhook"]);

const ToolPolicySchema = z
  .object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  })
  .strict()
  .optional();

const DmConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    systemPrompt: z.string().optional(),
  })
  .strict()
  .optional();

const MarkdownConfigSchema = z
  .object({
    mode: z.enum(["native", "escape", "strip"]).optional(),
    tableMode: z.enum(["native", "ascii", "simple"]).optional(),
  })
  .strict()
  .optional();

// Message render mode: auto (default) = detect markdown, raw = plain text, card = always card
const RenderModeSchema = z.enum(["auto", "raw", "card"]).optional();

const BlockStreamingCoalesceSchema = z
  .object({
    enabled: z.boolean().optional(),
    minDelayMs: z.number().int().positive().optional(),
    maxDelayMs: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

const ChannelHeartbeatVisibilitySchema = z
  .object({
    visibility: z.enum(["visible", "hidden"]).optional(),
    intervalMs: z.number().int().positive().optional(),
  })
  .strict()
  .optional();

export const FeishuGroupSchema = z
  .object({
    requireMention: z.boolean().optional(),
    tools: ToolPolicySchema,
    skills: z.array(z.string()).optional(), // Reserved for future per-group skill configuration
    enabled: z.boolean().optional(), // Reserved for future per-group enable/disable
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    systemPrompt: z.string().optional(), // Reserved for future per-group system prompt override
  })
  .strict();

export const FeishuConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    encryptKey: z.string().optional(),
    verificationToken: z.string().optional(),
    domain: FeishuDomainSchema.optional().default("feishu"),
    connectionMode: FeishuConnectionModeSchema.optional().default("websocket"),
    webhookPath: z.string().optional().default("/feishu/events"), // Reserved for future webhook mode implementation
    webhookPort: z.number().int().positive().optional(),
    capabilities: z.array(z.string()).optional(), // Reserved for future capability negotiation
    markdown: MarkdownConfigSchema, // Reserved for future markdown processing options
    configWrites: z.boolean().optional(), // Reserved for future config modification support
    dmPolicy: DmPolicySchema.optional().default("pairing"),
    allowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    groupAllowFrom: z.array(z.union([z.string(), z.number()])).optional(),
    requireMention: z.boolean().optional().default(true),
    groups: z.record(z.string(), FeishuGroupSchema.optional()).optional(),
    historyLimit: z.number().int().min(0).optional(),
    dmHistoryLimit: z.number().int().min(0).optional(),
    dms: z.record(z.string(), DmConfigSchema).optional(),
    textChunkLimit: z.number().int().positive().optional(), // Reserved for future text chunking customization
    chunkMode: z.enum(["length", "newline"]).optional(), // Reserved for future chunk mode selection
    blockStreamingCoalesce: BlockStreamingCoalesceSchema,
    mediaMaxMb: z.number().positive().optional(),
    heartbeat: ChannelHeartbeatVisibilitySchema, // Reserved for future heartbeat visibility control
    renderMode: RenderModeSchema, // raw = plain text (default), card = interactive card with markdown
    streaming: z.boolean().optional().default(true), // Enable streaming updates for partial replies
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.dmPolicy === "open") {
      const allowFrom = value.allowFrom ?? [];
      const hasWildcard = allowFrom.some((entry) => String(entry).trim() === "*");
      if (!hasWildcard) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["allowFrom"],
          message: 'channels.feishu.dmPolicy="open" requires channels.feishu.allowFrom to include "*"',
        });
      }
    }
  });
