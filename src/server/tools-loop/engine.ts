import { randomUUID } from "crypto";

import { buildPayload, collectCodexResponse } from "../codex/client";
import { config } from "../config/env";
import type { Message } from "../history/store";
import { sendEvent, streamToolProgress } from "../sse";
import { getToolByName, listTools, toolRegistry } from "../tools/registry";
import type { Envelope, ToolSchema, ToolSchemaProperty } from "../tools/types";

export interface ToolLoopResult<T = any> {
  ok: boolean;
  data: T;
  attempts: ToolAttempt[];
  suggested_next?: string;
  provider: string;
}

export interface ToolAttempt {
  action: string;
  result: "ok" | "error";
  latency_ms: number;
  error?: string;
}

export interface ModelToolCall {
  name: string;
  arguments: Record<string, any>;
  id?: string;
}

const TOOL_CALL_RE = /```tool_call\s*\n({[\s\S]*?})\n```/i;
const TOOL_PATCH_RE = /```tool_call[\s\S]*?```/i;

function normalizeMessages(messages: Message[]): Message[] {
  return messages.map((message) => ({
    ...message,
    content: message.content ?? "",
  }));
}

function normalizeEnabledTools(toolsEnabled: string[] | boolean | undefined): string[] {
  if (toolsEnabled === false) {
    return [];
  }

  if (Array.isArray(toolsEnabled)) {
    if (toolsEnabled.includes("*")) {
      return toolRegistry.map((tool) => tool.name);
    }

    return toolsEnabled.filter((name) => toolRegistry.some((tool) => tool.name === name));
  }

  return toolRegistry.map((tool) => tool.name);
}

function normalizeDisabledTools(disabledTools: string[] | undefined): string[] {
  return Array.isArray(disabledTools) ? disabledTools.filter(Boolean) : [];
}

function pickAvailableTools(toolsEnabled: string[] | boolean | undefined, disabledTools: string[] | undefined): ToolSchema[] {
  const enabled = new Set(normalizeEnabledTools(toolsEnabled));
  const disabled = new Set(normalizeDisabledTools(disabledTools));
  return toolRegistry.filter((tool) => enabled.has(tool.name) && !disabled.has(tool.name));
}

function safeParseArguments(raw: unknown): Record<string, any> {
  if (!raw) {
    return {};
  }

  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  return typeof raw === "object" ? (raw as Record<string, any>) : {};
}

function propertyType(property: ToolSchemaProperty | undefined): string {
  if (!property?.type) {
    return "any";
  }
  return Array.isArray(property.type) ? property.type.join("|") : property.type;
}

function buildToolsSystemPrompt(availableTools: ToolSchema[]): string {
  const toolLines = availableTools
    .map((tool) => {
      const params = Object.entries(tool.schema.properties || {})
        .map(([key, value]) => `${key}: ${propertyType(value)}`)
        .join(", ");
      return `- "${tool.name}" params: {${params}}`;
    })
    .join("\n");

  return [
    "[SYSTEM PROTOCOL: JSON-RPC TOOLS ENABLED]",
    "Quando precisar usar uma tool, emita APENAS este bloco e pare:",
    "```tool_call",
    '{"jsonrpc": "2.0", "id": "<uuid>", "method": "<tool_name>", "params": {<args>}}',
    "```",
    "O sistema responderá com:",
    "```tool_result",
    '{"jsonrpc": "2.0", "id": "<mesmo uuid>", "result": "<output>"}',
    "```",
    "Aguarde [TOOL RESULT] antes de continuar.",
    "Tools disponíveis:",
    toolLines
  ].join("\n");
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
}

function readEnvelopeError(envelope: Envelope): string | undefined {
  if (envelope.ok) {
    return undefined;
  }

  const data = envelope.data as Record<string, any>;
  return typeof data?.error === "string" ? data.error : "Tool execution failed";
}

function toolResultToText(envelope: Envelope): string {
  if (typeof envelope.data === "string") {
    return envelope.data;
  }

  try {
    return JSON.stringify(envelope.data, null, 2);
  } catch {
    return String(envelope.data);
  }
}

export async function runToolLoop(
  options: {
    model: string;
    messages: Message[];
    toolsEnabled?: string[] | boolean;
    disabledTools?: string[];
    sessionId?: string;
    maxLoops?: number;
    systemPrompt?: string;
  }
): Promise<ToolLoopResult> {
  const { model, messages, toolsEnabled, disabledTools, sessionId, maxLoops, systemPrompt } = options;
  const max = maxLoops ?? config.maxToolLoops;
  const availableTools = pickAvailableTools(toolsEnabled, disabledTools);
  const attempts: ToolAttempt[] = [];
  const callHistory = new Set<string>();
  const normalizedMessages = normalizeMessages(messages).filter((message) => message.role !== "system");

  let workingMessages = [...normalizedMessages];
  const sessionMessages = [...normalizedMessages];
  let loop = 0;
  let lastResponseId: string | null = null;
  let totalLatencyMs = 0;
  let finalText = "";

  sendEvent(sessionId, "session_status", {
    sessionId,
    provider: "codex",
    availableTools: availableTools.map((tool) => tool.name),
  });

  while (loop < max) {
    const instructions = [systemPrompt || "You are a helpful assistant.", availableTools.length ? buildToolsSystemPrompt(availableTools) : ""]
      .filter(Boolean)
      .join("\n\n");

    const payload = buildPayload({
      messages: workingMessages,
      model: model || config.defaultCodexModel,
      instructions,
      store: false,
      previousResponseId: null
    });

    const assistantTurn = await collectCodexResponse(payload, {
      onDelta(delta) {
        sendEvent(sessionId, "assistant_delta", { delta, round: loop });
      },
      onEvent(eventType, payloadChunk) {
        sendEvent(sessionId, "codex_event", { type: eventType, payload: payloadChunk, round: loop });
      }
    });

    totalLatencyMs += assistantTurn.latencyMs;
    if (assistantTurn.responseId) {
      lastResponseId = assistantTurn.responseId;
    }

    const toolCallMatch = availableTools.length ? TOOL_CALL_RE.exec(assistantTurn.content) : null;
    if (!toolCallMatch) {
      finalText = `${finalText}${finalText ? "\n\n" : ""}${assistantTurn.content}`.trim();
      break;
    }

    let rpcBlock: Record<string, any>;
    try {
      rpcBlock = JSON.parse(toolCallMatch[1]);
    } catch {
      finalText = `${finalText}${finalText ? "\n\n" : ""}${assistantTurn.content}`.trim();
      break;
    }

    const toolName = String(rpcBlock.method || rpcBlock.tool || "");
    const toolArguments = safeParseArguments(rpcBlock.params || rpcBlock.args || {});
    const toolRpcId = String(rpcBlock.id || randomUUID());

    if (!toolName || !availableTools.some((tool) => tool.name === toolName)) {
      finalText = `${finalText}${finalText ? "\n\n" : ""}${assistantTurn.content}`.trim();
      break;
    }

    const key = `${toolName}:${JSON.stringify(toolArguments)}`;
    if (callHistory.has(key)) {
      return {
        ok: false,
        data: { messages: sessionMessages, finalMessage: { role: "assistant", content: finalText }, loops: loop, responseId: lastResponseId, latencyMs: totalLatencyMs },
        attempts,
        suggested_next: "Infinite loop detected - same tool with same args called twice",
        provider: "codex"
      };
    }
    callHistory.add(key);

    const tool = getToolByName(toolName);
    if (!tool) {
      finalText = `${finalText}${finalText ? "\n\n" : ""}${assistantTurn.content}`.trim();
      break;
    }

    const visibleText = assistantTurn.content.replace(TOOL_PATCH_RE, `> 🔧 \`${toolName}\` executado`).trim();
    if (visibleText) {
      finalText = `${finalText}${finalText ? "\n\n" : ""}${visibleText}`.trim();
    }

    workingMessages.push({ role: "assistant", content: assistantTurn.content });

    const started = Date.now();
    streamToolProgress(sessionId, toolName, "running", {
      args: toolArguments,
      rpc_id: toolRpcId,
      round: loop
    });

    try {
      const envelope = await withTimeout(Promise.resolve(tool.handler(toolArguments)), config.toolTimeoutMs, toolName);
      const latency = Date.now() - started;
      const toolOutput = toolResultToText(envelope);

      attempts.push({
        action: toolName,
        result: envelope.ok ? "ok" : "error",
        latency_ms: latency,
        error: readEnvelopeError(envelope)
      });

      workingMessages.push({
        role: "user",
        content: JSON.stringify({
          jsonrpc: "2.0",
          id: toolRpcId,
          result: toolOutput
        })
      });

      streamToolProgress(sessionId, toolName, envelope.ok ? "done" : "error", {
        args: toolArguments,
        rpc_id: toolRpcId,
        latency_ms: latency,
        result: envelope
      });
    } catch (error: any) {
      const latency = Date.now() - started;
      const envelope: Envelope = {
        ok: false,
        scope: tool.scope,
        data: { error: error.message || String(error) }
      };

      attempts.push({
        action: toolName,
        result: "error",
        latency_ms: latency,
        error: error.message || String(error)
      });

      workingMessages.push({
        role: "user",
        content: JSON.stringify({
          jsonrpc: "2.0",
          id: toolRpcId,
          result: toolResultToText(envelope)
        })
      });

      streamToolProgress(sessionId, toolName, "error", {
        args: toolArguments,
        rpc_id: toolRpcId,
        latency_ms: latency,
        error: error.message || String(error)
      });
    }

    loop++;
  }

  const finalMessage: Message = {
    role: "assistant",
    content: finalText || `Max loops (${max}) reached - the model may need another turn to continue.`
  };
  sessionMessages.push(finalMessage);
  sendEvent(sessionId, "assistant_message", { message: finalMessage, provider: "codex", tools: listTools().length });

  return {
    ok: true,
    data: { messages: sessionMessages, finalMessage, loops: loop, responseId: lastResponseId, latencyMs: totalLatencyMs },
    attempts,
    suggested_next: loop >= max ? `Max loops (${max}) reached - might need more iterations` : "Task completed or no more tools needed",
    provider: "codex"
  };
}
