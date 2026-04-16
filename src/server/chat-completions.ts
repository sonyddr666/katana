import type { Request, Response } from "express";

import { resolveEffectiveAuthFromRequest, type EffectiveAuthSelection } from "./auth-pool";
import { streamCodexResponse, type CodexPayload } from "./codex/client";
import { upsertChat, getChat, summarizeChat, type ChatMessage } from "./chat-store";
import { updateSession } from "./history/store";
import { getStoreState } from "./store-state";
import { listTools } from "./tools/registry";

type CodexEventPayload = Record<string, any>;

function writeSse(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildTextualToolPrompt(requestTools: any[]): string {
  if (!requestTools.length) {
    return "";
  }

  const toolLines = requestTools
    .map((tool) => {
      const fn = tool?.function || tool;
      const properties = fn?.parameters?.properties || fn?.schema?.properties || {};
      const params = Object.entries(properties)
        .map(([key, value]: [string, any]) => `${key}: ${Array.isArray(value?.type) ? value.type.join("|") : value?.type || "any"}`)
        .join(", ");
      return `- "${fn?.name}" params: {${params}}`;
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

function flattenMessageContent(message: any): string {
  if (typeof message?.content === "string") {
    return message.content;
  }
  if (Array.isArray(message?.content)) {
    return message.content
      .map((item: any) => (typeof item === "string" ? item : item?.text || JSON.stringify(item)))
      .join("\n");
  }
  return message?.content == null ? "" : JSON.stringify(message.content);
}

function normalizeMessages(messages: any[]): ChatMessage[] {
  return (Array.isArray(messages) ? messages : []).map((message) => ({
    role: String(message?.role || "user"),
    content: flattenMessageContent(message),
    name: message?.name,
    tool_call_id: message?.tool_call_id,
    attachments: Array.isArray(message?.attachments) ? message.attachments : undefined,
    response_id: message?.response_id || null,
    latency_ms: typeof message?.latency_ms === "number" ? message.latency_ms : undefined,
    ts: typeof message?.ts === "number" ? message.ts : Math.floor(Date.now() / 1000)
  }));
}

function toModelMessages(messages: ChatMessage[]): Array<{ role: string; content: string }> {
  return messages.map((message) => {
    const attachmentLines = (message.attachments || [])
      .map((attachment) => {
        if (attachment.text_content) {
          return `[attachment:${attachment.name || attachment.id}]\n${attachment.text_content}`;
        }
        return attachment.name ? `[attachment:${attachment.name}]` : "";
      })
      .filter(Boolean)
      .join("\n\n");

    const mergedContent = [message.content || "", attachmentLines].filter(Boolean).join("\n\n");
    return {
      role: message.role === "assistant" ? "assistant" : "user",
      content: mergedContent
    };
  });
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export async function handleChatCompletions(req: Request, res: Response): Promise<void> {
  const stream = req.body?.stream !== false;
  const authSelection: EffectiveAuthSelection = await resolveEffectiveAuthFromRequest(req);
  const storeState = await getStoreState();

  const model = String(req.body?.model || "gpt-5.4-mini");
  const mode = String(req.body?.mode || "interactive");
  const chatId = String(req.body?.chat_id || req.body?.chatId || `chat-${Date.now().toString(36)}`);
  const sessionId = String(req.body?.session_id || req.body?.sessionId || `session-${Date.now().toString(36)}`);
  const systemPrompt = String(req.body?.systemPrompt || req.body?.system || "You are a helpful assistant.");
  const requestTools = Array.isArray(req.body?.tools)
    ? req.body.tools
    : req.body?.support_tools
      ? listTools().map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.schema } }))
      : [];

  const incomingMessages = normalizeMessages(req.body?.messages || []);
  const existingChat = await getChat(chatId);
  const resumePreferenceEnabled = Boolean(storeState.store_enabled);
  const previousResponseId = resumePreferenceEnabled ? existingChat?.response_id || null : null;
  const usingNativeResume = Boolean(previousResponseId);
  const payloadMessages = usingNativeResume ? incomingMessages.slice(-1) : incomingMessages;

  const instructions = [systemPrompt, buildTextualToolPrompt(requestTools)].filter(Boolean).join("\n\n");
  const payload: CodexPayload = {
    model,
    instructions,
    input: toModelMessages(payloadMessages).map((message) => ({
      type: "message",
      role: message.role === "assistant" ? "assistant" : "user",
      content: [
        {
          type: message.role === "assistant" ? "output_text" : "input_text",
          text: message.content
        }
      ]
    })),
    // The Codex backend rejects store=true in this HTTP flow.
    store: false,
    stream: true,
    ...(previousResponseId ? { previous_response_id: previousResponseId } : {})
  };

  if (!stream) {
    const result = await streamCodexResponse(payload, {
      auth: authSelection.auth || undefined,
      persistAuth: authSelection.persist,
      onDelta(_delta: string) {},
      onEvent(_type: string, _eventPayload: CodexEventPayload) {}
    });
    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: result.content,
      response_id: result.responseId,
      latency_ms: result.latencyMs,
      ts: Math.floor(Date.now() / 1000)
    };
    const persistedMessages = usingNativeResume && existingChat?.messages
      ? [...existingChat.messages, ...incomingMessages.slice(-1), assistantMessage]
      : [...incomingMessages, assistantMessage];
    const chat = await upsertChat({
      chat_id: chatId,
      session_id: sessionId,
      mode,
      model,
      temperature: Number.isFinite(Number(req.body?.temperature)) ? Number(req.body.temperature) : undefined,
      system_prompt: systemPrompt,
      reasoning_effort: req.body?.reasoning_effort,
      max_tokens: Number.isFinite(Number(req.body?.max_tokens)) ? Number(req.body.max_tokens) : undefined,
      auth_slot: authSelection.slotId || "",
      response_id: result.responseId,
      store: resumePreferenceEnabled,
      resumable: Boolean(result.responseId),
      messages: persistedMessages
    });
    await updateSession(sessionId, chat.messages.map((message) => ({ role: message.role as any, content: message.content, name: message.name, tool_call_id: message.tool_call_id })));
    res.json({
      id: `chatcmpl-${Date.now().toString(36)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: result.content },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: estimateTokens(JSON.stringify(incomingMessages)),
        completion_tokens: estimateTokens(result.content),
        total_tokens: estimateTokens(JSON.stringify(incomingMessages)) + estimateTokens(result.content)
      },
      _provider_store: false,
      _resume_enabled: resumePreferenceEnabled,
      _native_resume: usingNativeResume,
      _chat: summarizeChat(chat),
      _auth_pool: { effective: { slot_id: authSelection.slotId, label: authSelection.label } }
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  writeSse(res, { event: "item/started", item: { type: "message" } });

  let fullText = "";
  let responseId: string | null = existingChat?.response_id || null;

  try {
    const result = await streamCodexResponse(payload, {
      auth: authSelection.auth || undefined,
      persistAuth: authSelection.persist,
      onDelta(delta: string) {
        fullText += delta;
        writeSse(res, {
          id: `chatcmpl-${Date.now().toString(36)}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [
            {
              index: 0,
              delta: { content: delta },
              finish_reason: null
            }
          ]
        });
      },
      onEvent(type: string, eventPayload: CodexEventPayload) {
        if (type === "response.created") {
          responseId = eventPayload.response?.id || responseId;
        }
      }
    });
    const finalResponseId = result.responseId || responseId;

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: result.content,
      response_id: finalResponseId,
      latency_ms: result.latencyMs,
      ts: Math.floor(Date.now() / 1000)
    };

    const persistedMessages = usingNativeResume && existingChat?.messages
      ? [...existingChat.messages, ...incomingMessages.slice(-1), assistantMessage]
      : [...incomingMessages, assistantMessage];
    const chat = await upsertChat({
      chat_id: chatId,
      session_id: sessionId,
      mode,
      model,
      temperature: Number.isFinite(Number(req.body?.temperature)) ? Number(req.body.temperature) : undefined,
      system_prompt: systemPrompt,
      reasoning_effort: req.body?.reasoning_effort,
      max_tokens: Number.isFinite(Number(req.body?.max_tokens)) ? Number(req.body.max_tokens) : undefined,
      auth_slot: authSelection.slotId || "",
      response_id: finalResponseId,
      store: resumePreferenceEnabled,
      resumable: Boolean(finalResponseId),
      messages: persistedMessages
    });
    await updateSession(sessionId, chat.messages.map((message) => ({ role: message.role as any, content: message.content, name: message.name, tool_call_id: message.tool_call_id })));

    writeSse(res, { event: "item/completed", item: { type: "message" } });
    writeSse(res, {
      event: "turn/completed",
      _response_id: finalResponseId,
      _provider_store: false,
      _resume_enabled: resumePreferenceEnabled,
      _native_resume: usingNativeResume,
      _chat_mode: mode,
      _chat: summarizeChat(chat),
      _auth_pool: { effective: { slot_id: authSelection.slotId, label: authSelection.label } },
      usage: {
        prompt_tokens: estimateTokens(JSON.stringify(incomingMessages)),
        completion_tokens: estimateTokens(result.content),
        total_tokens: estimateTokens(JSON.stringify(incomingMessages)) + estimateTokens(result.content)
      }
    });
    res.write("data: [DONE]\n\n");
  } catch (error: any) {
    writeSse(res, { error: error.message || String(error) });
  } finally {
    res.end();
  }
}
