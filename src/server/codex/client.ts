import readline from "readline";
import { Readable } from "stream";

import axios from "axios";

import { config } from "../config/env";
import type { Message } from "../history/store";
import { codexHeaders, type CodexAuthRecord } from "./auth-manager";

export const CODEX_MODELS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.2",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini"
];

export interface CodexPayload {
  model: string;
  instructions: string;
  input: Array<Record<string, any>>;
  store: boolean;
  stream: true;
  previous_response_id?: string;
}

export interface CollectCodexResponseOptions {
  onDelta?: (delta: string) => void;
  onEvent?: (eventType: string, payload: Record<string, any>) => void;
}

export interface StreamCodexResponseOptions extends CollectCodexResponseOptions {
  auth?: CodexAuthRecord;
  persistAuth?: (auth: CodexAuthRecord) => Promise<void>;
}

function normalizeMessageText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item: any) => {
        if (typeof item === "string") {
          return item;
        }
        return item?.text || JSON.stringify(item);
      })
      .join("\n");
  }

  if (content == null) {
    return "";
  }

  return JSON.stringify(content);
}

export function normalizeMessages(messages: Message[]): Array<Record<string, any>> {
  return messages.map((message) => {
    const role = message.role === "assistant" ? "assistant" : "user";
    const text = normalizeMessageText(message.content).trim();
    return {
      type: "message",
      role,
      content: [
        {
          type: role === "assistant" ? "output_text" : "input_text",
          text
        }
      ]
    };
  });
}

export function buildPayload(options: {
  messages: Message[];
  model?: string;
  instructions?: string;
  store?: boolean;
  previousResponseId?: string | null;
}): CodexPayload {
  const payload: CodexPayload = {
    model: options.model || config.defaultCodexModel,
    instructions: options.instructions || "You are a helpful assistant.",
    input: normalizeMessages(options.messages),
    // The Codex web backend currently expects store=false in this flow.
    store: false,
    stream: true
  };

  if (options.previousResponseId) {
    payload.previous_response_id = options.previousResponseId;
  }

  return payload;
}

async function readStreamSnippet(stream: Readable): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk.toString());
    if (chunks.join("").length > 400) {
      break;
    }
  }
  return chunks.join("").slice(0, 400);
}

export async function streamCodexResponse(
  payload: CodexPayload,
  options: StreamCodexResponseOptions = {}
): Promise<{ content: string; responseId: string | null; latencyMs: number; status: number }> {
  const startedAt = Date.now();
  const headers = await codexHeaders({
    auth: options.auth,
    persist: options.persistAuth
  });
  const response = await axios.post(config.codexResponsesUrl, payload, {
    headers,
    responseType: "stream",
    timeout: Math.max(config.toolTimeoutMs, 120000),
    validateStatus: () => true
  });

  if (response.status < 200 || response.status >= 300) {
    const snippet = await readStreamSnippet(response.data as Readable);
    throw new Error(`Codex request failed (${response.status}): ${snippet || "no body"}`);
  }

  const stream = response.data as Readable;
  const reader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity
  });

  let fullText = "";
  let responseId: string | null = null;

  for await (const rawLine of reader) {
    const line = typeof rawLine === "string" ? rawLine : String(rawLine);
    if (!line.startsWith("data: ")) {
      continue;
    }

    const chunk = line.slice(6);
    if (!chunk || chunk === "[DONE]") {
      continue;
    }

    try {
      const payloadChunk = JSON.parse(chunk) as Record<string, any>;
      const eventType = String(payloadChunk.type || "");
      options.onEvent?.(eventType, payloadChunk);

      if (eventType === "response.created") {
        responseId = payloadChunk.response?.id || responseId;
      } else if (eventType === "response.output_text.delta") {
        const delta = String(payloadChunk.delta || "");
        fullText += delta;
        if (delta) {
          options.onDelta?.(delta);
        }
      } else if (eventType === "response.completed") {
        break;
      }
    } catch {
      // ignore malformed SSE chunks
    }
  }

  return {
    content: fullText,
    responseId,
    latencyMs: Date.now() - startedAt,
    status: response.status
  };
}

export async function collectCodexResponse(
  payload: CodexPayload,
  options: CollectCodexResponseOptions = {}
): Promise<{ content: string; responseId: string | null; latencyMs: number }> {
  const result = await streamCodexResponse(payload, options);
  return {
    content: result.content,
    responseId: result.responseId,
    latencyMs: result.latencyMs
  };
}
