import type { OpenClawConfig } from "openclaw/plugin-sdk";
import type { FeishuConfig } from "./types.js";
import { createFeishuClient } from "./client.js";
import { resolveReceiveIdType, normalizeFeishuTarget } from "./targets.js";
import fs from "fs";
import path from "path";
import os from "os";
import { Readable } from "stream";

export type DownloadImageResult = {
  buffer: Buffer;
  contentType?: string;
};

/**
 * Detect the duration of an audio/video file in milliseconds.
 * Returns undefined if the duration cannot be detected or is not applicable.
 * Note: For now, returns a default duration for audio/video files to allow upload.
 * TODO: Implement proper duration detection using music-metadata or ffprobe.
 */
async function detectMediaDuration(buffer: Buffer, fileName: string): Promise<number | undefined> {
  const ext = path.extname(fileName).toLowerCase();
  const audioExtensions = [".mp3", ".wav", ".ogg", ".opus", ".flac", ".aac", ".m4a"];
  const videoExtensions = [".mp4", ".mov", ".avi", ".mkv", ".webm"];

  if (!audioExtensions.includes(ext) && !videoExtensions.includes(ext)) {
    return undefined;
  }

  // For now, provide a default duration to allow file upload
  // Audio files: default to 1 second
  // Video files: default to 1 second
  return 1000;
}

export type DownloadMessageResourceResult = {
  buffer: Buffer;
  contentType?: string;
  fileName?: string;
};

/**
 * Download an image from Feishu using image_key.
 * Used for downloading images sent in messages.
 */
export async function downloadImageFeishu(params: {
  cfg: OpenClawConfig;
  imageKey: string;
}): Promise<DownloadImageResult> {
  const { cfg, imageKey } = params;
  const feishuCfg = cfg.channels?.["feishu-unofficial"] as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);

  const response = await client.im.image.get({
    path: { image_key: imageKey },
  });

  const responseAny = response as any;
  if (responseAny.code !== undefined && responseAny.code !== 0) {
    throw new Error(`Feishu image download failed: ${responseAny.msg || `code ${responseAny.code}`}`);
  }

  // Handle various response formats from Feishu SDK
  let buffer: Buffer;

  if (Buffer.isBuffer(response)) {
    buffer = response;
  } else if (response instanceof ArrayBuffer) {
    buffer = Buffer.from(response);
  } else if (responseAny.data && Buffer.isBuffer(responseAny.data)) {
    buffer = responseAny.data;
  } else if (responseAny.data instanceof ArrayBuffer) {
    buffer = Buffer.from(responseAny.data);
  } else if (typeof responseAny.getReadableStream === "function") {
    // SDK provides getReadableStream method
    const stream = responseAny.getReadableStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  } else if (typeof responseAny.writeFile === "function") {
    // SDK provides writeFile method - use a temp file
    const tmpPath = path.join(os.tmpdir(), `feishu_img_${Date.now()}_${imageKey}`);
    await responseAny.writeFile(tmpPath);
    buffer = await fs.promises.readFile(tmpPath);
    await fs.promises.unlink(tmpPath).catch(() => {}); // cleanup
  } else if (typeof responseAny[Symbol.asyncIterator] === "function") {
    // Response is an async iterable
    const chunks: Buffer[] = [];
    for await (const chunk of responseAny) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  } else if (typeof responseAny.read === "function") {
    // Response is a Readable stream
    const chunks: Buffer[] = [];
    for await (const chunk of responseAny as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  } else {
    // Debug: log what we actually received
    const keys = Object.keys(responseAny);
    const types = keys.map(k => `${k}: ${typeof responseAny[k]}`).join(", ");
    throw new Error(
      `Feishu image download failed: unexpected response format. Keys: [${types}]`,
    );
  }

  return { buffer };
}

/**
 * Download a message resource (file/image/audio/video) from Feishu.
 * Used for downloading files, audio, and video from messages.
 */
export async function downloadMessageResourceFeishu(params: {
  cfg: OpenClawConfig;
  messageId: string;
  fileKey: string;
  type: "image" | "file";
}): Promise<DownloadMessageResourceResult> {
  const { cfg, messageId, fileKey, type } = params;
  const feishuCfg = cfg.channels?.["feishu-unofficial"] as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);

  const response = await client.im.messageResource.get({
    path: { message_id: messageId, file_key: fileKey },
    params: { type },
  });

  const responseAny = response as any;
  if (responseAny.code !== undefined && responseAny.code !== 0) {
    throw new Error(
      `Feishu message resource download failed: ${responseAny.msg || `code ${responseAny.code}`}`,
    );
  }

  // Handle various response formats from Feishu SDK
  let buffer: Buffer;

  if (Buffer.isBuffer(response)) {
    buffer = response;
  } else if (response instanceof ArrayBuffer) {
    buffer = Buffer.from(response);
  } else if (responseAny.data && Buffer.isBuffer(responseAny.data)) {
    buffer = responseAny.data;
  } else if (responseAny.data instanceof ArrayBuffer) {
    buffer = Buffer.from(responseAny.data);
  } else if (typeof responseAny.getReadableStream === "function") {
    // SDK provides getReadableStream method
    const stream = responseAny.getReadableStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  } else if (typeof responseAny.writeFile === "function") {
    // SDK provides writeFile method - use a temp file
    const tmpPath = path.join(os.tmpdir(), `feishu_${Date.now()}_${fileKey}`);
    await responseAny.writeFile(tmpPath);
    buffer = await fs.promises.readFile(tmpPath);
    await fs.promises.unlink(tmpPath).catch(() => {}); // cleanup
  } else if (typeof responseAny[Symbol.asyncIterator] === "function") {
    // Response is an async iterable
    const chunks: Buffer[] = [];
    for await (const chunk of responseAny) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  } else if (typeof responseAny.read === "function") {
    // Response is a Readable stream
    const chunks: Buffer[] = [];
    for await (const chunk of responseAny as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    buffer = Buffer.concat(chunks);
  } else {
    // Debug: log what we actually received
    const keys = Object.keys(responseAny);
    const types = keys.map(k => `${k}: ${typeof responseAny[k]}`).join(", ");
    throw new Error(
      `Feishu message resource download failed: unexpected response format. Keys: [${types}]`,
    );
  }

  return { buffer };
}

export type UploadImageResult = {
  imageKey: string;
};

export type UploadFileResult = {
  fileKey: string;
};

export type SendMediaResult = {
  messageId: string;
  chatId: string;
};

/**
 * Upload an image to Feishu and get an image_key for sending.
 * Supports: JPEG, PNG, WEBP, GIF, TIFF, BMP, ICO
 */
export async function uploadImageFeishu(params: {
  cfg: OpenClawConfig;
  image: Buffer | string; // Buffer or file path
  imageType?: "message" | "avatar";
}): Promise<UploadImageResult> {
  const { cfg, image, imageType = "message" } = params;
  const feishuCfg = cfg.channels?.["feishu-unofficial"] as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);

  let fileInput: string | Buffer;
  let fileName: string;
  let tempFile: string | undefined;

  if (typeof image === "string") {
    // File path - use directly
    fileInput = image;
    fileName = path.basename(image);
  } else {
    // Buffer - create a temporary file
    // This is required because the SDK uses FormData which needs a file path or ReadableStream,
    // not a raw Buffer (would cause "TypeError: source.on is not a function")
    const tempDir = os.tmpdir();
    fileName = `upload_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
    const tempFilePath = path.join(tempDir, fileName);
    fs.writeFileSync(tempFilePath, image);
    fileInput = tempFilePath;
    tempFile = tempFilePath;
  }

  const logFn = (feishuCfg as any).runtime?.log ?? console.log;
  const fileSize = typeof fileInput === "string" ? (fs.existsSync(fileInput) ? fs.statSync(fileInput).size : 0) : (fileInput as Buffer).length;
  logFn?.(`[feishu] uploading image: fileName=${fileName}, imageType=${imageType}, fileSize=${fileSize}`);

  try {
    const response = await client.im.image.create({
      data: {
        image_type: imageType,
        image: fileInput as any,
      },
    });

    // SDK v1.30+ returns data directly without code wrapper on success
    // On error, it throws or returns { code, msg }
    const responseAny = response as any;
    if (responseAny.code !== undefined && responseAny.code !== 0) {
      throw new Error(`Feishu image upload failed: ${responseAny.msg || `code ${responseAny.code}`}`);
    }

    const imageKey = responseAny.image_key ?? responseAny.data?.image_key;
    if (!imageKey) {
      throw new Error("Feishu image upload failed: no image_key returned");
    }

    // Clean up temp file if it was created
    if (tempFile) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return { imageKey };
  } catch (error) {
    logFn?.(`[feishu] image upload error: ${String(error)}`);
    // Clean up temp file on error
    if (tempFile) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Upload a file to Feishu and get a file_key for sending.
 * Max file size: 30MB
 */
export async function uploadFileFeishu(params: {
  cfg: OpenClawConfig;
  file: Buffer | string; // Buffer or file path
  fileName: string;
  fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream";
  duration?: number; // Required for audio/video files, in milliseconds
}): Promise<UploadFileResult> {
  const { cfg, file, fileName, fileType, duration } = params;
  const feishuCfg = cfg.channels?.["feishu-unofficial"] as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);

  let fileInput: string | Buffer;
  let actualFileName: string;
  let tempFile: string | undefined;

  if (typeof file === "string") {
    // File path - use directly
    fileInput = file;
    actualFileName = fileName;
  } else {
    // Buffer - create a temporary file
    // This is required because the SDK uses FormData which needs a file path or ReadableStream,
    // not a raw Buffer (would cause "TypeError: source.on is not a function")
    const tempDir = os.tmpdir();
    actualFileName = fileName;
    const tempFilePath = path.join(tempDir, `upload_${Date.now()}_${Math.random().toString(36).substring(7)}.${actualFileName.split('.').pop() || 'bin'}`);
    fs.writeFileSync(tempFilePath, file);
    fileInput = tempFilePath;
    tempFile = tempFilePath;
  }

  // Log upload details for debugging
  const fileSize = typeof fileInput === "string" ? (fs.existsSync(fileInput) ? fs.statSync(fileInput).size : 0) : (fileInput as Buffer).length;
  const logFn = (feishuCfg as any).runtime?.log ?? console.log;
  logFn?.(`[feishu] uploading file: fileName=${actualFileName}, fileType=${fileType}, fileSize=${fileSize}${duration !== undefined ? `, duration=${duration}` : ''}`);

  try {
    const response = await client.im.file.create({
      data: {
        file_type: fileType,
        file_name: actualFileName,
        file: fileInput as any,
        ...(duration !== undefined && { duration }),
      },
    });

    // SDK v1.30+ returns data directly without code wrapper on success
    const responseAny = response as any;
    if (responseAny.code !== undefined && responseAny.code !== 0) {
      throw new Error(`Feishu file upload failed: ${responseAny.msg || `code ${responseAny.code}`}`);
    }

    const fileKey = responseAny.file_key ?? responseAny.data?.file_key;
    if (!fileKey) {
      throw new Error("Feishu file upload failed: no file_key returned");
    }

    // Clean up temp file if it was created
    if (tempFile) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    return { fileKey };
  } catch (error) {
    logFn?.(`[feishu] file upload error: ${String(error)}`);
    // Clean up temp file on error
    if (tempFile) {
      try {
        fs.unlinkSync(tempFile);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

/**
 * Send an image message using an image_key
 */
export async function sendImageFeishu(params: {
  cfg: OpenClawConfig;
  to: string;
  imageKey: string;
  replyToMessageId?: string;
}): Promise<SendMediaResult> {
  const { cfg, to, imageKey, replyToMessageId } = params;
  const feishuCfg = cfg.channels?.["feishu-unofficial"] as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);
  const content = JSON.stringify({ image_key: imageKey });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: "image",
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu image reply failed: ${response.msg || `code ${response.code}`}`);
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
      msg_type: "image",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu image send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}

/**
 * Send a video message using a file_key
 * Uses msg_type: "media" for proper video playback support
 */
export async function sendVideoFeishu(params: {
  cfg: OpenClawConfig;
  to: string;
  fileKey: string;
  replyToMessageId?: string;
}): Promise<SendMediaResult> {
  const { cfg, to, fileKey, replyToMessageId } = params;
  const feishuCfg = cfg.channels?.["feishu-unofficial"] as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);
  const content = JSON.stringify({ file_key: fileKey });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: "media",
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu video reply failed: ${response.msg || `code ${response.code}`}`);
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
      msg_type: "media",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu video send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}

/**
 * Send a file message using a file_key
 */
export async function sendFileFeishu(params: {
  cfg: OpenClawConfig;
  to: string;
  fileKey: string;
  replyToMessageId?: string;
}): Promise<SendMediaResult> {
  const { cfg, to, fileKey, replyToMessageId } = params;
  const feishuCfg = cfg.channels?.["feishu-unofficial"] as FeishuConfig | undefined;
  if (!feishuCfg) {
    throw new Error("Feishu channel not configured");
  }

  const client = createFeishuClient(feishuCfg);
  const receiveId = normalizeFeishuTarget(to);
  if (!receiveId) {
    throw new Error(`Invalid Feishu target: ${to}`);
  }

  const receiveIdType = resolveReceiveIdType(receiveId);
  const content = JSON.stringify({ file_key: fileKey });

  if (replyToMessageId) {
    const response = await client.im.message.reply({
      path: { message_id: replyToMessageId },
      data: {
        content,
        msg_type: "file",
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu file reply failed: ${response.msg || `code ${response.code}`}`);
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
      msg_type: "file",
    },
  });

  if (response.code !== 0) {
    throw new Error(`Feishu file send failed: ${response.msg || `code ${response.code}`}`);
  }

  return {
    messageId: response.data?.message_id ?? "unknown",
    chatId: receiveId,
  };
}

/**
 * Helper to detect file type from extension
 */
export function detectFileType(
  fileName: string,
): "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream" {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case ".opus":
    case ".ogg":
      return "opus";
    case ".mp4":
    case ".mov":
    case ".avi":
      return "mp4";
    case ".pdf":
      return "pdf";
    case ".doc":
    case ".docx":
      return "doc";
    case ".xls":
    case ".xlsx":
      return "xls";
    case ".ppt":
    case ".pptx":
      return "ppt";
    default:
      return "stream";
  }
}

/**
 * Check if a string is a local file path (not a URL)
 */
function isLocalPath(urlOrPath: string): boolean {
  // Starts with / or ~ or drive letter (Windows)
  if (urlOrPath.startsWith("/") || urlOrPath.startsWith("~") || /^[a-zA-Z]:/.test(urlOrPath)) {
    return true;
  }
  // Try to parse as URL - if it fails or has no protocol, it's likely a local path
  try {
    const url = new URL(urlOrPath);
    return url.protocol === "file:";
  } catch {
    return true; // Not a valid URL, treat as local path
  }
}

/**
 * Upload and send media (image or file) from URL, local path, or buffer
 */
export async function sendMediaFeishu(params: {
  cfg: OpenClawConfig;
  to: string;
  mediaUrl?: string;
  mediaBuffer?: Buffer;
  fileName?: string;
  replyToMessageId?: string;
}): Promise<SendMediaResult> {
  const { cfg, to, mediaUrl, mediaBuffer, fileName, replyToMessageId } = params;

  let filePath: string | Buffer | undefined;
  let name: string;

  if (mediaBuffer) {
    // Buffer - pass directly to upload function
    filePath = mediaBuffer;
    name = fileName ?? "file";
  } else if (mediaUrl) {
    if (isLocalPath(mediaUrl)) {
      // Local file path - pass directly to avoid creating temporary files
      filePath = mediaUrl.startsWith("~")
        ? mediaUrl.replace("~", process.env.HOME ?? "")
        : mediaUrl.replace("file://", "");

      if (!fs.existsSync(filePath)) {
        throw new Error(`Local file not found: ${filePath}`);
      }
      name = fileName ?? path.basename(filePath);
    } else {
      // Remote URL - fetch as buffer
      const response = await fetch(mediaUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch media from URL: ${response.status}`);
      }
      filePath = Buffer.from(await response.arrayBuffer());
      name = fileName ?? (path.basename(new URL(mediaUrl).pathname) || "file");
    }
  } else {
    throw new Error("Either mediaUrl or mediaBuffer must be provided");
  }

  // Determine if it's an image based on extension
  const ext = path.extname(name).toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".ico", ".tiff"].includes(ext);
  const isVideo = [".mp4", ".mov", ".avi", ".mkv", ".webm"].includes(ext);

  if (isImage) {
    const { imageKey } = await uploadImageFeishu({ cfg, image: filePath });
    return sendImageFeishu({ cfg, to, imageKey, replyToMessageId });
  } else if (isVideo) {
    const fileType = "mp4"; // Video files use "mp4" type in Feishu API

    // Detect duration for video files
    let duration: number | undefined;
    const bufferToCheck = typeof filePath === "string" ? fs.readFileSync(filePath) : filePath;
    duration = await detectMediaDuration(bufferToCheck, name);

    const { fileKey } = await uploadFileFeishu({
      cfg,
      file: filePath,
      fileName: name,
      fileType,
      duration,
    });
    return sendVideoFeishu({ cfg, to, fileKey, replyToMessageId });
  } else {
    const fileType = detectFileType(name);

    // Detect duration for audio files
    const audioTypes = ["opus"];
    let duration: number | undefined;
    if (audioTypes.includes(fileType)) {
      // If filePath is a string (file path), read the buffer to detect duration
      // If it's already a Buffer, use it directly
      const bufferToCheck = typeof filePath === "string" ? fs.readFileSync(filePath) : filePath;
      duration = await detectMediaDuration(bufferToCheck, name);
    }

    const { fileKey } = await uploadFileFeishu({
      cfg,
      file: filePath,
      fileName: name,
      fileType,
      duration,
    });
    return sendFileFeishu({ cfg, to, fileKey, replyToMessageId });
  }
}
