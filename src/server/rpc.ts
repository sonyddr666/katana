import { config } from "./config/env";
import { toolRegistry } from "./tools/registry";
import { runToolLoop } from "./tools-loop/engine";
import { getSession, createSession, updateSession } from "./history/store";
import { handleHistoryGet, handleHistoryClear } from "./history";

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

export async function rpcHandler(
  requestBody: JsonRpcRequest | { model: string; messages: any[]; tools_enabled?: string[]; system?: string }
): Promise<JsonRpcResponse> {
  // Handle OpenAI-compatible format (not strict JSON-RPC)
  if ("model" in requestBody) {
    return handleChatMessage(requestBody);
  }

  // Standard JSON-RPC 2.0
  const { id, method, params = {} } = requestBody;

  try {
    switch (method) {
      case "chat": {
        return handleChatMessage(params);
      }

      case "models": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            models: [
              { id: "codex-mini", object: "model", owned_by: "openai" },
              { id: "codex", object: "model", owned_by: "openai" },
            ],
          },
        };
      }

      case "tools.list": {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: toolRegistry.map((t) => ({
              name: t.name,
              description: t.description,
              scope: t.scope,
              schema: t.schema,
            })),
          },
        };
      }

      case "tools.run": {
        const { tool, args } = params;
        if (!tool || !args) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32602, message: "Invalid params: tool and args required" },
          };
        }

        const toolDef = toolRegistry.find((t) => t.name === tool);
        if (!toolDef) {
          return {
            jsonrpc: "2.0",
            id,
            error: { code: -32601, message: `Tool not found: ${tool}` },
          };
        }

        try {
          const result = await toolDef.handler(args);
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
          result: historyResult.result,
        };
      }

      case "history.clear": {
        const clearResult = await handleHistoryClear(params as { sessionId: string });
        return {
          jsonrpc: "2.0",
          id,
          result: clearResult.result,
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

async function handleChatMessage(params: {
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  tools_enabled?: string[];
  system?: string;
  sessionId?: string;
}): Promise<JsonRpcResponse> {
  const model = params.model || "codex-mini";
  const userMessages = params.messages || [];
  const toolsEnabled = params.tools_enabled || [];
  const systemPrompt = params.system || "";
  const sessionId = params.sessionId || "default";

  // Get or create session
  let session = getSession(sessionId);
  if (!session) {
    session = createSession(sessionId);
  }

  // Build message history
  const allMessages = [
    ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
    ...session.messages,
    ...userMessages,
  ];

  // Run tool loop
  const toolResult = await runToolLoop(allMessages, toolsEnabled, [], config.maxToolLoops);

  // Update session with new messages
  if (toolResult.ok) {
    updateSession(sessionId, toolResult.data.messages);
  }

  // Return response with tool execution summary
  return {
    jsonrpc: "2.0",
    id: Date.now(),
    result: {
      model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: toolResult.ok
              ? `Tool loop completed. Attempts: ${toolResult.attempts.length}. ${toolResult.suggested_next || ""}`
              : `Error: ${JSON.stringify(toolResult)}`,
          },
          finish_reason: toolResult.ok ? "stop" : "error",
        },
      ],
      usage: {
        prompt_tokens: allMessages.length,
        completion_tokens: 1,
        total_tokens: allMessages.length + 1,
      },
      tool_execution: {
        attempts: toolResult.attempts,
        suggested_next: toolResult.suggested_next,
      },
      sessionId,
    },
  };
}
