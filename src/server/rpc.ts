import { CODEX_MODELS } from "./codex/client";
import { config } from "./config/env";
import { handleHistoryClear, handleHistoryGet } from "./history";
import { createSession, getSession, type Message, updateSession } from "./history/store";
import { runToolLoop } from "./tools-loop/engine";
import { getToolByName, listTools } from "./tools/registry";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, any>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

type ChatParams = {
  requestId?: string | number | null;
  model?: string;
  messages?: Array<{ role: string; content: string | null }>;
  tools_enabled?: string[] | boolean;
  disabled_tools?: string[];
  system?: string;
  sessionId?: string;
};

export async function rpcHandler(
  requestBody: JsonRpcRequest | (ChatParams & { model: string; messages: any[] })
): Promise<JsonRpcResponse> {
  if (!("jsonrpc" in requestBody) && "model" in requestBody) {
    return handleChatMessage(requestBody, null);
  }

  const { id, method, params = {} } = requestBody;

  try {
    switch (method) {
      case "chat": {
        return handleChatMessage(params as ChatParams, id);
      }

      case "models": {
        const uniqueModels = Array.from(new Set([...(config.availableModels || []), ...CODEX_MODELS]));
        return {
          jsonrpc: "2.0",
          id,
          result: {
            models: uniqueModels.map((modelId) => ({
              id: modelId,
              object: "model",
              owned_by: "chatgpt.com",
            })),
          },
        };
      }

      case "tools.list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: listTools(),
          },
        };
      }

      case "tools.run": {
        const { tool, args } = params;
        if (!tool) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Invalid params: tool is required" },
          };
        }

        const toolDef = getToolByName(tool);
        if (!toolDef) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Tool not found: ${tool}` },
          };
        }

        try {
          const result = await toolDef.handler(args || {});
          return {
            jsonrpc: "2.0",
            id,
            result: { tool, args, result },
          };
        } catch (err: any) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32603, message: "Tool execution failed", data: err.message },
          };
        }
      }

      case "history.get": {
        const historyResult = await handleHistoryGet(params as { sessionId: string });
        return {
          jsonrpc: "2.0",
          id,
          result: historyResult.result || null,
        };
      }

      case "history.clear": {
        const clearResult = await handleHistoryClear(params as { sessionId: string });
        return {
          jsonrpc: "2.0",
          id,
          result: clearResult.result || null,
        };
      }

      default: {
        return {
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Method not found: ${method}` },
        };
      }
    }
  } catch (error: any) {
    console.error("RPC handler error:", error);
    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32603, message: "Internal error", data: error.message },
    };
  }
}

async function handleChatMessage(params: ChatParams, requestId?: string | number | null): Promise<JsonRpcResponse> {
  const effectiveRequestId = requestId ?? params.requestId ?? null;
  const model = params.model || config.defaultCodexModel;
  const incomingMessages = (params.messages || []).map((message) => ({
    role: message.role,
    content: message.content ?? "",
  })) as Message[];
  const systemPrompt = params.system || "";
  const sessionId = params.sessionId || `session-${Date.now().toString(36)}`;
  const disabledTools = params.disabled_tools || [];

  let session = await getSession(sessionId);
  if (!session) {
    session = await createSession(sessionId);
  }

  const persistedMessages = session.messages.filter((message) => message.role !== "system");
  const conversation: Message[] = [...persistedMessages, ...incomingMessages];

  const toolResult = await runToolLoop({
    model,
    messages: conversation,
    toolsEnabled: params.tools_enabled,
    disabledTools,
    sessionId,
    maxLoops: config.maxToolLoops,
    systemPrompt,
  });

  await updateSession(sessionId, toolResult.data.messages);

  const finalAssistantMessage = toolResult.data.finalMessage || toolResult.data.messages.slice().reverse().find((message: Message) => message.role === "assistant");
  const promptTokens = Math.max(1, Math.ceil(JSON.stringify(conversation).length / 4));
  const completionTokens = Math.max(1, Math.ceil(JSON.stringify(finalAssistantMessage || {}).length / 4));

  return {
    jsonrpc: "2.0",
    id: effectiveRequestId,
    result: {
      model,
      created: Math.floor(Date.now() / 1000),
      choices: [
        {
          index: 0,
          message: {
            role: finalAssistantMessage?.role || "assistant",
            content: finalAssistantMessage?.content || "",
          },
          finish_reason: toolResult.ok ? "stop" : "error",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      tool_execution: {
        attempts: toolResult.attempts,
        suggested_next: toolResult.suggested_next,
        provider: toolResult.provider,
        loops: toolResult.data.loops,
        tools_enabled: params.tools_enabled,
        disabled_tools: disabledTools,
      },
      sessionId,
    },
  };
}

export function toOpenAiCompatChatCompletion(result: any): Record<string, any> {
  return {
    id: `chatcmpl-${Date.now().toString(36)}`,
    object: "chat.completion",
    created: result.created || Math.floor(Date.now() / 1000),
    model: result.model,
    choices: result.choices || [],
    usage: result.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
    sessionId: result.sessionId,
    tool_execution: result.tool_execution,
  };
}

export function toOpenAiCompatModels(result: any): Record<string, any> {
  return {
    object: "list",
    data: result?.models || [],
  };
}
