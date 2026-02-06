import {
  createReplyPrefixContext,
  createTypingCallbacks,
  logTypingFailure,
  type OpenClawConfig,
  type RuntimeEnv,
  type ReplyPayload,
} from "openclaw/plugin-sdk";
import { getFeishuRuntime } from "./runtime.js";
import { sendMessageFeishu, sendCardFeishu, updateCardFeishu, createSimpleTextCard, sendMarkdownCardFeishu, createCardEntity, updateCardContent, updateCardSettings, sendCardMessage } from "./send.js";
import type { FeishuConfig } from "./types.js";
import {
  addTypingIndicator,
  removeTypingIndicator,
  type TypingIndicatorState,
} from "./typing.js";
import { shouldUseCard } from "./markdown.js";

// Constants for error handling and retry logic
const MAX_RETRY_COUNT = 3;
const RATE_LIMIT_ERROR_CODE = "230020"; // Old rate limit error code
const STREAMING_RATE_LIMIT_ERROR_CODE = "99991400"; // Streaming rate limit error code
const BASE_RETRY_DELAY_MS = 1000;
// Minimum interval between updates to avoid rate limits (in milliseconds)
// Single card limit: 10 times/second => 100ms minimum
// We use 300ms (3.3 times/second) to stay well within limits
const MIN_UPDATE_INTERVAL_MS = 300; // Update at most every 300ms
// When rate limit is hit, increase the interval exponentially
const RATE_LIMIT_BACKOFF_MULTIPLIER = 2;

class FeishuStream {
  private cardId: string | null = null;
  private messageId: string | null = null;
  private lastContent = "";
  private lastUpdateTime = 0;
  private isFinalized = false;
  private initializationPromise: Promise<void> | null = null;
  private loggedInitialization = false;
  private hasInitializationError = false;
  private currentMinInterval: number;
  private maxUpdateInterval: number;
  private rateLimitBackoffMultiplier: number;
  private rateLimitHitCount = 0;
  private sequence = 0; // Card update sequence (must be strictly increasing)

  constructor(
    private ctx: {
      cfg: OpenClawConfig;
      chatId: string;
      replyToMessageId?: string;
      runtime: RuntimeEnv;
    },
    minUpdateIntervalMs: number = MIN_UPDATE_INTERVAL_MS,
    maxUpdateIntervalMs: number = 5000,
    rateLimitBackoffMult: number = 2,
  ) {
    this.currentMinInterval = minUpdateIntervalMs;
    this.maxUpdateInterval = maxUpdateIntervalMs;
    this.rateLimitBackoffMultiplier = rateLimitBackoffMult;
  }

  private getNextSequence(): number {
    return ++this.sequence;
  }

  async update(content: string, isFinal = false): Promise<void> {
    if (this.isFinalized) return;
    if (content === this.lastContent) return;

    // If we haven't created the card entity yet, create it now
    if (!this.cardId) {
      // If we are already creating the card entity, wait for it
      if (this.initializationPromise) {
        await this.initializationPromise;
        // After waiting, if we have a cardId, proceed to update with the current content
        if (this.cardId) {
          // Fall through to update logic below with the current content
        } else {
          // Initialization failed, return silently
          return;
        }
      } else {
        // Start initialization
        this.initializationPromise = (async () => {
          try {
            // Step 1: Create card entity
            const cardId = await createCardEntity({
              cfg: this.ctx.cfg,
              content,
              streaming: true,
            });
            this.cardId = cardId;

            // Step 2: Send message with card_id reference
            const result = await sendCardMessage({
              cfg: this.ctx.cfg,
              to: this.ctx.chatId,
              cardId,
              replyToMessageId: this.ctx.replyToMessageId,
            });
            this.messageId = result.messageId;
            this.lastContent = content;
            this.lastUpdateTime = Date.now();

            // Log initialization only once, showing first 50 chars
            if (!this.loggedInitialization) {
              const preview = content.length > 50 ? content.slice(0, 50) + "..." : content;
              this.ctx.runtime.log?.(`feishu: stream initialized card cardId=${cardId} messageId=${this.messageId} content="${preview}"`);
              this.loggedInitialization = true;
            }
          } catch (err) {
            this.hasInitializationError = true;
            this.ctx.runtime.error?.(`feishu stream card entity initialization failed: ${this.formatError(err, "initialization")}`);
          } finally {
            this.initializationPromise = null;
          }
        })();

        await this.initializationPromise;
        // Don't return - fall through to update logic to ensure the current content is displayed
      }
    }

    // Perform the update
    // No logging during updates to avoid spamming the logs
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdateTime;

    // Throttle updates to avoid rate limits
    // Skip updates that are too frequent, unless this is the final update
    if (!isFinal && timeSinceLastUpdate < this.currentMinInterval) {
      // Skip this update to avoid hitting rate limits
      return;
    }

    await this.performUpdate(content);
  }

  private async performUpdate(content: string, retryCount = 0): Promise<boolean> {
    if (!this.cardId || this.isFinalized) return false;
    try {
      // Update card entity content with streaming mode
      await updateCardContent({
        cfg: this.ctx.cfg,
        cardId: this.cardId,
        content,
        sequence: this.getNextSequence(),
        streaming: true,
      });
      this.lastContent = content;
      this.lastUpdateTime = Date.now();

      // Reset interval if update succeeds
      if (this.currentMinInterval > this.currentMinInterval - (this.currentMinInterval - MIN_UPDATE_INTERVAL_MS)) {
        // Reset to initial min interval
        this.currentMinInterval = MIN_UPDATE_INTERVAL_MS;
        this.rateLimitHitCount = 0;
      }

      return true;
    } catch (err) {
      const errStr = String(err);
      const isRateLimit =
        errStr.includes(RATE_LIMIT_ERROR_CODE) ||
        errStr.includes(STREAMING_RATE_LIMIT_ERROR_CODE);

      // Increase update interval when rate limit is hit
      if (isRateLimit) {
        this.rateLimitHitCount++;
        // Exponentially increase the minimum interval
        this.currentMinInterval = Math.min(
          this.currentMinInterval * this.rateLimitBackoffMultiplier,
          this.maxUpdateInterval
        );
      }

      // Retry on rate limit errors (max 3 retries with exponential backoff)
      if (isRateLimit && retryCount < MAX_RETRY_COUNT) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount); // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.performUpdate(content, retryCount + 1);
      }

      // Log only non-rate-limit errors or if all retries failed
      if (!isRateLimit || retryCount >= MAX_RETRY_COUNT) {
        this.ctx.runtime.error?.(`feishu stream update failed: ${this.formatError(err, "update", retryCount)}`);
      }
      return false;
    }
  }

  async finalize(content: string, retryCount = 0): Promise<boolean> {
    this.ctx.runtime.log?.(`[feishu] finalize called: cardId=${this.cardId} messageId=${this.messageId} contentLength=${content.length} isFinalized=${this.isFinalized} retryCount=${retryCount}`);

    if (this.isFinalized) {
      this.ctx.runtime.log?.(`[feishu] finalize returning early: already finalized`);
      return true;
    }
    if (!this.cardId) {
      this.ctx.runtime.log?.(`[feishu] finalize returning early: cardId is null`);
      return false;
    }

    try {
      // Step 1: Update card content with streaming mode off
      this.ctx.runtime.log?.(`[feishu] finalize step 1: updating card content`);
      await updateCardContent({
        cfg: this.ctx.cfg,
        cardId: this.cardId,
        content,
        sequence: this.getNextSequence(),
        streaming: false,
      });
      this.ctx.runtime.log?.(`[feishu] finalize step 1 completed: card content updated`);

      // Step 2: Update card settings to disable streaming mode
      this.ctx.runtime.log?.(`[feishu] finalize step 2: updating card settings`);
      await updateCardSettings({
        cfg: this.ctx.cfg,
        cardId: this.cardId,
        streamingMode: false,
      });
      this.ctx.runtime.log?.(`[feishu] finalize step 2 completed: card settings updated`);

      this.isFinalized = true;

      // Log finalization with complete content (first 100 chars)
      const preview = content.length > 100 ? content.slice(0, 100) + "..." : content;
      this.ctx.runtime.log?.(`feishu: stream finalized card cardId=${this.cardId} messageId=${this.messageId} totalLength=${content.length} content="${preview}"`);
      return true;
    } catch (err) {
      const errStr = String(err);
      const isRateLimit =
        errStr.includes(RATE_LIMIT_ERROR_CODE) ||
        errStr.includes(STREAMING_RATE_LIMIT_ERROR_CODE);

      // Retry on rate limit errors (max 3 retries with exponential backoff)
      if (isRateLimit && retryCount < MAX_RETRY_COUNT) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, retryCount); // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.finalize(content, retryCount + 1);
      }

      // Log only non-rate-limit errors or if all retries failed
      if (!isRateLimit || retryCount >= MAX_RETRY_COUNT) {
        this.ctx.runtime.error?.(`feishu stream finalize failed: ${this.formatError(err, "finalize", retryCount)}`);
      }
      return false;
    }
  }

  hasFailed(): boolean {
    return this.hasInitializationError;
  }

  getMessageId(): string | null {
    return this.messageId;
  }

  getCardId(): string | null {
    return this.cardId;
  }

  private formatError(err: unknown, operation: string, retryCount = 0): string {
    const errStr = String(err);
    const codeMatch = errStr.match(/code\s*[:=]\s*(\d+)/);
    const code = codeMatch ? codeMatch[1] : "unknown";
    const retryInfo = retryCount > 0 ? ` (retry ${retryCount}/${MAX_RETRY_COUNT})` : "";
    return `[${operation}${retryInfo}] code=${code} error=${errStr.slice(0, 200)}`;
  }
}

export type CreateFeishuReplyDispatcherParams = {
  cfg: OpenClawConfig;
  agentId: string;
  runtime: RuntimeEnv;
  chatId: string;
  replyToMessageId?: string;
};

export function createFeishuReplyDispatcher(params: CreateFeishuReplyDispatcherParams) {
  console.log(`[feishu] createFeishuReplyDispatcher called`);

  const core = getFeishuRuntime();
  const { cfg, agentId, chatId, replyToMessageId } = params;

  // Log streaming configuration for debugging
  const feishuCfg = cfg.channels?.["feishu-unofficial"] as FeishuConfig | undefined;
  const streamingEnabled = feishuCfg?.streaming ?? true;
  const renderMode = feishuCfg?.renderMode ?? "auto";

  // Read blockStreamingCoalesce config
  const streamingCoalesce = feishuCfg?.blockStreamingCoalesce;
  const minUpdateIntervalMs = streamingCoalesce?.minDelayMs ?? 300;
  const maxUpdateIntervalMs = streamingCoalesce?.maxDelayMs ?? 5000;
  // Calculate backoff multiplier based on min/max interval (e.g., 300ms -> 5000ms over ~4 hits = 2x multiplier)
  const rateLimitBackoffMultiplier = Math.pow(maxUpdateIntervalMs / minUpdateIntervalMs, 1 / 4);

  console.log(`[feishu] dispatcher initialized: streamingEnabled=${streamingEnabled}, renderMode=${renderMode}, minUpdateIntervalMs=${minUpdateIntervalMs}, maxUpdateIntervalMs=${maxUpdateIntervalMs}`);
  params.runtime.log?.(`[feishu] dispatcher initialized: streamingEnabled=${streamingEnabled}, renderMode=${renderMode}, minUpdateIntervalMs=${minUpdateIntervalMs}, maxUpdateIntervalMs=${maxUpdateIntervalMs}`);

  const prefixContext = createReplyPrefixContext({
    cfg,
    agentId,
  });

  // Feishu doesn't have a native typing indicator API.
  // We use message reactions as a typing indicator substitute.
  let typingState: TypingIndicatorState | null = null;

  // Track active stream for the current block
  let currentStream: FeishuStream | null = null;

  // Helper function to send fallback message when streaming fails
  const sendFallbackMessage = async (text: string): Promise<void> => {
    params.runtime.log?.(`[feishu] sendFallbackMessage called: textLength=${text.length} chatId=${chatId} replyToMessageId=${replyToMessageId}`);

    const feishuCfg = cfg.channels?.["feishu-unofficial"] as FeishuConfig | undefined;
    const renderMode = feishuCfg?.renderMode ?? "auto";

    // Determine if we should use card for this message
    const useCard =
      renderMode === "card" || (renderMode === "auto" && shouldUseCard(text));

    params.runtime.log?.(`[feishu] sendFallbackMessage: useCard=${useCard} renderMode=${renderMode}`);

    if (useCard) {
      // Card mode: send as interactive card with markdown rendering
      const chunks = core.channel.text.chunkTextWithMode(text, textChunkLimit, chunkMode);
      params.runtime.log?.(`[feishu] sendFallbackMessage: sending ${chunks.length} chunk(s) as card`);
      for (const chunk of chunks) {
        await sendMarkdownCardFeishu({
          cfg,
          to: chatId,
          text: chunk,
          replyToMessageId,
        });
      }
    } else {
      // Raw mode: send as plain text with table conversion
      const converted = core.channel.text.convertMarkdownTables(text, tableMode);
      const chunks = core.channel.text.chunkTextWithMode(converted, textChunkLimit, chunkMode);
      params.runtime.log?.(`[feishu] sendFallbackMessage: sending ${chunks.length} chunk(s) as text`);
      for (const chunk of chunks) {
        await sendMessageFeishu({
          cfg,
          to: chatId,
          text: chunk,
          replyToMessageId,
        });
      }
    }

    params.runtime.log?.(`[feishu] sendFallbackMessage completed`);
  };

  const typingCallbacks = createTypingCallbacks({
    start: async () => {
      // If we are streaming, we don't need typing indicator as text appears
      if (currentStream?.getMessageId()) return;

      if (!replyToMessageId) return;
      typingState = await addTypingIndicator({ cfg, messageId: replyToMessageId });
    },
    stop: async () => {
      if (!typingState) return;
      await removeTypingIndicator({ cfg, state: typingState });
      typingState = null;
    },
    onStartError: (err) => {
      // Squelch errors
    },
    onStopError: (err) => {
      // Squelch errors
    },
  });

  const textChunkLimit = core.channel.text.resolveTextChunkLimit({
    cfg,
    channel: "feishu",
    defaultLimit: 4000,
  });
  const chunkMode = core.channel.text.resolveChunkMode(cfg, "feishu");
  const tableMode = core.channel.text.resolveMarkdownTableMode({
    cfg,
    channel: "feishu",
  });

  const { dispatcher, replyOptions, markDispatchIdle } =
    core.channel.reply.createReplyDispatcherWithTyping({
      responsePrefix: prefixContext.responsePrefix,
      responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
      humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, agentId),
      onReplyStart: typingCallbacks.onReplyStart,
      deliver: async (payload: ReplyPayload) => {
        const text = payload.text ?? "";
        console.log(`[feishu] deliver called: text="${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" totalLength=${text.length} hasActiveStream=${!!currentStream} textLength=${text.length} textEmpty=${!text.trim()}`);
        params.runtime.log?.(`[feishu] deliver called: text="${text.slice(0, 50)}${text.length > 50 ? '...' : ''}" totalLength=${text.length} hasActiveStream=${!!currentStream} textLength=${text.length} textEmpty=${!text.trim()}`);

        if (!text.trim()) {
          console.log(`[feishu] deliver returning early: text is empty or whitespace only`);
          params.runtime.log?.(`[feishu] deliver returning early: text is empty or whitespace only`);
          return;
        }

        // If we have an active stream, finalize it with the raw content
        if (currentStream) {
          console.log(`[feishu] deliver: finalizing active stream`);
          const success = await currentStream.finalize(text);

          // If streaming failed, fallback to normal message sending
          if (!success) {
            console.log(`[feishu] streaming failed, falling back to normal message sending`);
            params.runtime.log?.(`feishu: streaming failed, falling back to normal message sending`);
            currentStream = null;
            await sendFallbackMessage(text);
          } else {
            currentStream = null;
          }
          return;
        }

        console.log(`[feishu] deliver: calling sendFallbackMessage`);
        await sendFallbackMessage(text);
      },
      onError: (err, info) => {
        params.runtime.error?.(`feishu ${info.kind} reply failed: ${String(err)}`);
        typingCallbacks.onIdle?.();
      },
      onIdle: typingCallbacks.onIdle,
    });

  return {
    dispatcher,
    replyOptions: {
      ...replyOptions,
      onModelSelected: prefixContext.onModelSelected,
      ...(streamingEnabled ? {
        onPartialReply: async (payload: ReplyPayload) => {
          const text = payload.text ?? "";
          console.log(`[feishu] onPartialReply called: textLength=${text.length} hasCurrentStream=${!!currentStream}`);
          params.runtime.log?.(`[feishu] onPartialReply called: textLength=${text.length} hasCurrentStream=${!!currentStream}`);

          if (!text) {
            console.log(`[feishu] onPartialReply returning early: text is empty`);
            params.runtime.log?.(`[feishu] onPartialReply returning early: text is empty`);
            return;
          }

          if (!currentStream) {
            console.log(`[feishu] onPartialReply creating new stream`);
            params.runtime.log?.(`[feishu] onPartialReply creating new stream`);
            currentStream = new FeishuStream({
              cfg,
              chatId,
              replyToMessageId,
              runtime: params.runtime,
              minUpdateIntervalMs,
              maxUpdateIntervalMs,
              rateLimitBackoffMult: rateLimitBackoffMultiplier,
            });
            // Stop specific typing indicator if we start streaming text
            // (though typingCallbacks.onIdle will be called eventually)
            if (typingState) {
              await typingCallbacks.onIdle?.();
            }
          }

          // Check if streaming initialization failed
          if (currentStream.hasFailed()) {
            console.log(`[feishu] streaming initialization failed, falling back to normal message sending`);
            params.runtime.log?.(`feishu: streaming initialization failed, falling back to normal message sending`);
            currentStream = null;
            return; // Let the final deliver handle the message
          }

          // Update the stream with new content
          // Feishu's streaming_config will handle the actual rate limiting
          await currentStream.update(text);
        }
      } : {}), // When streaming disabled, don't provide onPartialReply so Agent won't generate streaming output
    },
    markDispatchIdle,
  };
}