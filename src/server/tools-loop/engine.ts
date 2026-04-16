import { config } from "../config/env";
import { getToolByName } from "../tools/registry";
import type { Envelope } from "../tools/types";

export interface ToolLoopResult<T = any> {
  ok: boolean;
  data: T;
  attempts: ToolAttempt[];
  suggested_next?: string;
}

export interface ToolAttempt {
  action: string;
  result: "ok" | "error";
  latency_ms: number;
  error?: string;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
  id?: string;
}

export async function runToolLoop(
  messages: Array<{ role: string; content: string; tool_calls?: any[] }>,
  toolsEnabled: string[] = [],
  disabledTools: string[] = [],
  maxLoops?: number
): Promise<ToolLoopResult> {
  const max = maxLoops ?? config.maxToolLoops;
  const attempts: ToolAttempt[] = [];
  const callHistory = new Set<string>(); // para detecção de loop infinito

  let currentMessages = [...messages];
  let loop = 0;

  while (loop < max) {
    // Simulate Codex response with tool calls
    // In production, this would call OpenAI API or local Codex
    const simulatedResponse = await simulateCodexResponse(currentMessages, toolsEnabled);

    if (!simulatedResponse.tool_calls?.length) {
      // No more tool calls, return final result
      return {
        ok: true,
        data: { messages: currentMessages, final: simulatedResponse },
        attempts,
        suggested_next: "Task completed or no more tools needed",
      };
    }

    for (const call of simulatedResponse.tool_calls) {
      const toolName = call.name;

      // Check if tool is disabled
      if (disabledTools.includes(toolName)) {
        console.warn(`Tool ${toolName} is disabled, skipping`);
        continue;
      }

      // Check if tool is enabled for this session
      if (toolsEnabled.length > 0 && !toolsEnabled.includes(toolName)) {
        console.warn(`Tool ${toolName} not enabled for this session`);
        continue;
      }

      // Infinite loop detection
      const key = `${toolName}:${JSON.stringify(call.arguments)}`;
      if (callHistory.has(key)) {
        return {
          ok: false,
          data: { messages: currentMessages },
          attempts,
          suggested_next: "Infinite loop detected - same tool with same args called twice",
        };
      }
      callHistory.add(key);

      // Execute tool
      const tool = getToolByName(toolName);
      const started = Date.now();

      if (!tool) {
        attempts.push({
          action: toolName,
          result: "error",
          latency_ms: Date.now() - started,
          error: `Tool not found: ${toolName}`,
        });
        currentMessages.push({
          role: "tool",
          content: JSON.stringify({ error: `Tool ${toolName} not found` }),
        });
        continue;
      }

      try {
        const envelope: Envelope = await tool.handler(call.arguments);
        const latency = Date.now() - started;

        attempts.push({
          action: toolName,
          result: envelope.ok ? "ok" : "error",
          latency_ms: latency,
          error: envelope.ok ? undefined : (envelope.data.error || "Tool execution failed"),
        });

        // Add tool result to message history
        currentMessages.push({
          role: "tool",
          content: JSON.stringify(envelope),
        });
      } catch (err: any) {
        const latency = Date.now() - started;
        attempts.push({
          action: toolName,
          result: "error",
          latency_ms: latency,
          error: err.message,
        });
        currentMessages.push({
          role: "tool",
          content: JSON.stringify({ error: err.message }),
        });
      }
    }

    loop++;
  }

  return {
    ok: true,
    data: { messages: currentMessages, loops: loop },
    attempts,
    suggested_next: `Max loops (${max}) reached - might need more iterations`,
  };
}

// Simulates Codex deciding which tools to call
// In production, replace with actual OpenAI/Codex API call
async function simulateCodexResponse(
  messages: Array<{ role: string; content: string; tool_calls?: any[] }>,
  _toolsEnabled: string[]
): Promise<{ tool_calls?: Array<{ name: string; arguments: Record<string, any>; id?: string }> }> {
  // This is a stub - in real implementation, you'd call the model
  // For now, we just check if last message was a tool result and stop
  const lastMsg = messages[messages.length - 1];
  if (lastMsg.role === "tool") {
    // Parse tool result to see if we should continue
    try {
      const result = JSON.parse(lastMsg.content);
      if (result.suggested_next) {
        // Continue with next tool (simulated)
        return { tool_calls: [] }; // stop for now
      }
    } catch {
      // not JSON, stop
    }
  }

  return { tool_calls: [] };
}
