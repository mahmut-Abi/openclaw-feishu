import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { FeishuConfig, FeishuSendResult } from "./types.js";
import { createFeishuClient } from "./client.js";
import { resolveReceiveIdType, normalizeFeishuTarget } from "./targets.js";
import { getFeishuRuntime } from "./runtime.js";
import { normalizeMarkdownForFeishu, convertTablesToAscii, shouldUseCard } from "./markdown.js";

export type FeishuMessageInfo = {
  messageId: string;
  chatId: string;
  senderId?: string;
  senderOpenId?: string;
  content: string;
  contentType: string;
  createTime?: number;
};

/**
 * Get a message by its ID.
 * Useful for fetching quoted/replied message content.
 */
export async function getMessageFeishu(params: {
  cfg: OpenClawConfig;
  messageId: string;
}): Promise<FeishuMessageInfo | null> {
  const { cfg, messageId } = params;
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);

  try {
    const response = (await client.im.message.get({
      path: { message_id: messageId },
    })) as {
      code?: number;
      msg?: string;
      data?: {
        items?: Array<{
          message_id?: string;
          chat_id?: string;
          msg_type?: string;
          body?: { content?: string };
          sender?: {
            id?: string;
            id_type?: string;
            sender_type?: string;
          };
          create_time?: string;
        }>;
      };
    };

    if (response.code !== 0) {
      return null;
    }

    const item = response.data?.items?.[0];
    if (!item) {
      return null;
    }

    // Parse content based on message type
    let content = item.body?.content ?? "";
    try {
      const parsed = JSON.parse(content);
      if (item.msg_type === "text" && parsed.text) {
        content = parsed.text;
      }
    } catch {
      // Keep raw content if parsing fails
    }

    return {
      messageId: item.message_id ?? messageId,
      chatId: item.chat_id ?? "",
      senderId: item.sender?.id,
      senderOpenId: item.sender?.id_type === "open_id" ? item.sender?.id : undefined,
      content,
      contentType: item.msg_type ?? "text",
      createTime: item.create_time ? parseInt(item.create_time, 10) : undefined,
    };
  } catch {
    return null;
  }
}

export type SendFeishuMessageParams = {
  cfg: OpenClawConfig;
  to: string;
  text: string;
  replyToMessageId?: string;
};

export async function sendMessageFeishu(params: SendFeishuMessageParams): Promise<FeishuSendResult> {
  const { cfg, to, text, replyToMessageId } = params;
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);
  const tableMode = getFeishuRuntime().channel.text.resolveMarkdownTableMode({
    cfg,
    channel: "feishu",
  });
  const messageText = getFeishuRuntime().channel.text.convertMarkdownTables(text ?? "", tableMode);

  const content = JSON.stringify({ text: messageText });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: "text",
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu reply failed: ${response.msg || `code ${response.code}`}`);
    }

    return {
      messageId: response.data?.message_id ?? "unknown",
      chatId: receiveId,
    };
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      content,
      msg_type: "text",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}

export type SendFeishuCardParams = {
  cfg: OpenClawConfig;
  to: string;
  card: Record<string, unknown>;
  replyToMessageId?: string;
};

export async function sendCardFeishu(params: SendFeishuCardParams): Promise<FeishuSendResult> {
  const { cfg, to, card, replyToMessageId } = params;
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);
  const content = JSON.stringify(card);

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: "interactive",
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu card reply failed: ${response.msg || `code ${response.code}`}`);
    }

    return {
      messageId: response.data?.message_id ?? "unknown",
      chatId: receiveId,
    };
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      content,
      msg_type: "interactive",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu card send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}

export async function updateCardFeishu(params: {
  cfg: OpenClawConfig;
  messageId: string;
  card: Record<string, unknown>;
}): Promise<void> {
  const { cfg, messageId, card } = params;
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);
  const content = JSON.stringify(card);

  const response = await client.im.message.patch({
    path: { message_id: messageId },
    data: { content },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu card update failed: ${response.msg || `code ${response.code}`}`);
  }
}

/**
 * Build a Feishu interactive card with markdown content.
 * Cards render markdown properly (code blocks, tables, links, etc.)
 * This function normalizes the markdown to ensure compatibility with Feishu.
 */
export function buildMarkdownCard(text: string): Record<string, unknown> {
  return {
    config: {
      wide_screen_mode: true,
    },
    elements: [
      {
        tag: "markdown",
        content: normalizeMarkdownForFeishu(text),
      },
    ],
  };
}

/**
 * Send a message as a markdown card (interactive message).
 * This renders markdown properly in Feishu (code blocks, tables, bold/italic, etc.)
 */
export async function sendMarkdownCardFeishu(params: {
  cfg: OpenClawConfig;
  to: string;
  text: string;
  replyToMessageId?: string;
}): Promise<FeishuSendResult> {
  const { cfg, to, text, replyToMessageId } = params;
  const card = buildMarkdownCard(text);
  return sendCardFeishu({ cfg, to, card, replyToMessageId });
}

/**
 * Build a Feishu interactive card with title, content and buttons.
 * Supports markdown content and interactive buttons with actions.
 */
export function buildInteractiveCard(params: {
  title: string;
  template?: string;
  content: string;
  buttons?: Array<{
    text: string;
    type?: "primary" | "default";
    url?: string;
    value?: Record<string, unknown>;
  }>;
}): Record<string, unknown> {
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: normalizeMarkdownForFeishu(params.content),
    },
  ];

  if (params.buttons && params.buttons.length > 0) {
    const actions = params.buttons.map(button => ({
      tag: "button",
      text: { tag: "plain_text", content: button.text },
      type: button.type || "default",
      ...(button.url ? { url: button.url } : {}),
      ...(button.value ? { value: button.value } : {}),
    }));

    elements.push({
      tag: "action",
      actions,
    });
  }

  return {
    schema_version: "2.0",
    header: {
      title: { tag: "plain_text", content: params.title },
      template: params.template || "blue",
    },
    elements,
  };
}

/**
 * Create a simple text card for streaming updates with proper streaming configuration.
 * Uses Feishu's streaming_config to control update frequency and avoid rate limits.
 *
 * @see https://open.feishu.cn/document/cardkit-v1/streaming-updates-openapi-overview
 */
export function createSimpleTextCard(content: string, streaming = false): Record<string, unknown> {
  const card: Record<string, unknown> = {
    schema: "2.0",
    config: {
      streaming_mode: streaming,
    },
    body: {
      direction: "horizontal",
      elements: [
        {
          tag: "markdown",
          content: normalizeMarkdownForFeishu(content || "..."), // Fallback for empty initially
          element_id: "markdown_content", // Required for streaming updates - unique identifier for the element
        }
      ],
    },
  };

  // Add streaming_config when streaming is enabled
  // This tells Feishu how to display progressive updates on the client side
  // and helps control update frequency to avoid rate limits
  if (streaming) {
    (card.config as Record<string, unknown>).summary = {
      content: "[生成中]",
    };
    (card.config as Record<string, unknown>).streaming_config = {
      // Update frequency in milliseconds (object format with platform-specific values)
      print_frequency_ms: {
        default: 30,
        android: 25,
        ios: 40,
        pc: 50,
      },
      // Number of characters to display per update (object format with platform-specific values)
      print_step: {
        default: 2,
        android: 3,
        ios: 4,
        pc: 5,
      },
      // Update strategy: "fast" for immediate display, "delay" for buffered display
      print_strategy: "fast",
    };
  } else {
    // When streaming is complete, only keep streaming_mode: false
    // Do NOT include summary or streaming_config - this ensures Feishu client
    // completely removes the streaming state
  }

  return card;
}

/**
 * Edit an existing text message.
 * Note: Feishu only allows editing messages within 24 hours.
 */
export async function editMessageFeishu(params: {
  cfg: OpenClawConfig;
  messageId: string;
  text: string;
}): Promise<void> {
  const { cfg, messageId, text } = params;
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);
  const tableMode = getFeishuRuntime().channel.text.resolveMarkdownTableMode({
    cfg,
    channel: "feishu",
  });
  const messageText = getFeishuRuntime().channel.text.convertMarkdownTables(text ?? "", tableMode);
  const content = JSON.stringify({ text: messageText });

  const response = await client.im.message.update({
    path: { message_id: messageId },
    data: {
      msg_type: "text",
      content,
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu message edit failed: ${response.msg || `code ${response.code}`}`);
  }
}

// ============================================================================
// Card Entity API (流式更新使用卡片实体)
// ============================================================================

/**
 * Create a card entity for streaming updates.
 * Returns the card_id which can be used to send and update the card.
 *
 * @see https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/create
 */
export async function createCardEntity(params: {
  cfg: OpenClawConfig;
  content: string;
  streaming?: boolean;
}): Promise<string> {
  const { cfg, content, streaming = false } = params;
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);

  // Build card JSON
  const card: Record<string, unknown> = {
    schema: "2.0",
    config: {
      update_multi: true, // Allow multiple updates
      streaming_mode: streaming,
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: normalizeMarkdownForFeishu(content || "..."),
          element_id: "markdown_content",
        }
      ],
    },
  };

  // Add streaming config if streaming is enabled
  if (streaming) {
    (card.config as Record<string, unknown>).summary = {
      content: "[生成中]",
    };
    (card.config as Record<string, unknown>).streaming_config = {
      print_frequency_ms: {
        default: 30,
        android: 25,
        ios: 40,
        pc: 50,
      },
      print_step: {
        default: 2,
        android: 3,
        ios: 4,
        pc: 5,
      },
      print_strategy: "fast",
    };
  }

  // Create card entity
  const response = await client.cardkit.v1.card.create({
    data: {
      type: "card_json",
      data: JSON.stringify(card),
    },
  });

  if (response.code !== 0 || !response.data?.card_id) {
    throw new Error(`Feishu card entity creation failed: ${response.msg || `code ${response.code}`}`);
  }

  return response.data.card_id;
}

/**
 * Update card entity content.
 * Requires card_id and sequence number.
 *
 * @see https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/update
 */
export async function updateCardContent(params: {
  cfg: OpenClawConfig;
  cardId: string;
  content: string;
  sequence: number;
  streaming?: boolean;
}): Promise<void> {
  const { cfg, cardId, content, sequence, streaming = false } = params;
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);

  // Build card JSON
  const card: Record<string, unknown> = {
    schema: "2.0",
    config: {
      update_multi: true,
      streaming_mode: streaming,
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: normalizeMarkdownForFeishu(content || "..."),
          element_id: "markdown_content",
        }
      ],
    },
  };

  // Add streaming config if streaming is enabled
  if (streaming) {
    (card.config as Record<string, unknown>).summary = {
      content: "[生成中]",
    };
    (card.config as Record<string, unknown>).streaming_config = {
      print_frequency_ms: {
        default: 30,
        android: 25,
        ios: 40,
        pc: 50,
      },
      print_step: {
        default: 2,
        android: 3,
        ios: 4,
        pc: 5,
      },
      print_strategy: "fast",
    };
  }

  // Create Card object (required by SDK)
  const cardObj = {
    type: "card_json" as const,
    data: JSON.stringify(card),
  };

  // Update card entity
  const response = await client.cardkit.v1.card.update({
    path: { card_id: cardId },
    data: {
      card: cardObj,
      sequence,
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu card content update failed: ${response.msg || `code ${response.code}`}`);
  }
}

/**
 * Update card entity configuration (e.g., streaming_mode).
 * Used to end streaming mode by setting streaming_mode to false.
 *
 * @see https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/cardkit-v1/card/settings
 */
export async function updateCardSettings(params: {
  cfg: OpenClawConfig;
  cardId: string;
  streamingMode: boolean;
}): Promise<void> {
  const { cfg, cardId, streamingMode } = params;
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);

  // Build settings
  const settings: Record<string, unknown> = {
    streaming_mode: streamingMode,
  };

  // Remove summary when streaming ends
  if (!streamingMode) {
    // No summary in settings when streaming is complete
  }

  // Update card settings
  const response = await client.cardkit.v1.card.settings({
    path: { card_id: cardId },
    data: {
      settings: JSON.stringify(settings),
      sequence: 1, // Settings update sequence
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu card settings update failed: ${response.msg || `code ${response.code}`}`);
  }
}

/**
 * Send a card message.
 * Note: Card entity approach requires a different flow.
 * For now, we use the standard card message approach.
 *
 * @see https://open.feishu.cn/document/server-docs/im/message/create
 */
export async function sendCardMessage(params: {
  cfg: OpenClawConfig;
  to: string;
  cardId: string;
  replyToMessageId?: string;
}): Promise<FeishuSendResult> {
  const { cfg, to, cardId, replyToMessageId } = params;
  const feishuCfg = cfg.channels?.feishu as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);

  // Build card message - for card entity approach, we send a simple card
  // The actual content will be updated via cardkit API
  const card: Record<string, unknown> = {
    schema: "2.0",
    config: {
      wide_screen_mode: true,
    },
    body: {
      elements: [
        {
          tag: "markdown",
          content: "Loading...",
          element_id: "markdown_content",
        },
      ],
    },
  };

  const content = JSON.stringify(card);

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: "interactive",
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu card reply failed: ${response.msg || `code ${response.code}`}`);
    }

    return {
      messageId: response.data?.message_id ?? "unknown",
      chatId: receiveId,
    };
  }

  const response = await client.im.message.create({
    params: { receive_id_type: receiveIdType },
    data: {
      receive_id: receiveId,
      content,
      msg_type: "interactive",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu card send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}