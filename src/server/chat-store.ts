import { promises as fs } from "fs";
import path from "path";

import { config } from "./config/env";

export interface ChatAttachment {
  id?: string;
  name?: string;
  mime?: string;
  type?: string;
  is_image?: boolean;
  expires_at?: number | null;
  url?: string | null;
  text_content?: string | null;
}

export interface ChatMessage {
  role: string;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  response_id?: string | null;
  latency_ms?: number;
  ts?: number;
  attachments?: ChatAttachment[];
}

export interface ChatRecord {
  chat_id: string;
  session_id: string;
  title: string;
  model: string;
  mode: string;
  created_at: number;
  updated_at: number;
  temperature?: number;
  system_prompt?: string;
  reasoning_effort?: string;
  max_tokens?: number;
  auth_slot?: string;
  response_id?: string | null;
  store: boolean;
  resumable: boolean;
  messages: ChatMessage[];
}

function sanitizeChatId(chatId: string): string {
  return String(chatId || "chat").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function chatFile(chatId: string): string {
  return path.join(config.chatsDir, `${sanitizeChatId(chatId)}.json`);
}

function deriveTitle(messages: ChatMessage[], fallback: string): string {
  const firstUserMessage = messages.find((message) => message.role === "user" && String(message.content || "").trim());
  const title = String(firstUserMessage?.content || fallback).replace(/\s+/g, " ").trim();
  return title.length > 80 ? `${title.slice(0, 77)}…` : title || fallback;
}

async function writeChat(record: ChatRecord): Promise<void> {
  await fs.writeFile(chatFile(record.chat_id), `${JSON.stringify(record, null, 2)}\n`, "utf-8");
}

export async function getChat(chatId: string): Promise<ChatRecord | null> {
  try {
    const raw = await fs.readFile(chatFile(chatId), "utf-8");
    return JSON.parse(raw) as ChatRecord;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function saveChat(record: ChatRecord): Promise<ChatRecord> {
  await writeChat(record);
  return record;
}

export async function upsertChat(input: Partial<ChatRecord> & { chat_id: string; session_id: string; model: string; mode: string; messages: ChatMessage[] }): Promise<ChatRecord> {
  const existing = await getChat(input.chat_id);
  const now = Math.floor(Date.now() / 1000);
  const record: ChatRecord = {
    chat_id: input.chat_id,
    session_id: input.session_id,
    title: input.title || existing?.title || deriveTitle(input.messages, input.chat_id),
    model: input.model,
    mode: input.mode,
    created_at: existing?.created_at || input.created_at || now,
    updated_at: input.updated_at || now,
    temperature: input.temperature,
    system_prompt: input.system_prompt,
    reasoning_effort: input.reasoning_effort,
    max_tokens: input.max_tokens,
    auth_slot: input.auth_slot,
    response_id: input.response_id ?? null,
    store: Boolean(input.store),
    resumable: Boolean(input.resumable),
    messages: input.messages.map((message) => ({
      ...message,
      ts: message.ts || now
    }))
  };
  await writeChat(record);
  return record;
}

export async function listChats(): Promise<ChatRecord[]> {
  try {
    const entries = await fs.readdir(config.chatsDir, { withFileTypes: true });
    const chats = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
        .map(async (entry) => {
          const raw = await fs.readFile(path.join(config.chatsDir, entry.name), "utf-8");
          return JSON.parse(raw) as ChatRecord;
        })
    );
    return chats.sort((a, b) => b.updated_at - a.updated_at);
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function searchChats(query: string): Promise<ChatRecord[]> {
  const normalized = String(query || "").trim().toLowerCase();
  if (!normalized) {
    return listChats();
  }
  const chats = await listChats();
  return chats.filter((chat) => {
    if (chat.title.toLowerCase().includes(normalized)) {
      return true;
    }
    return chat.messages.some((message) => String(message.content || "").toLowerCase().includes(normalized));
  });
}

export async function deleteChat(chatId: string): Promise<boolean> {
  try {
    await fs.unlink(chatFile(chatId));
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function clearThreadBySessionId(sessionId: string): Promise<number> {
  const chats = await listChats();
  let updated = 0;
  for (const chat of chats) {
    if (chat.session_id !== sessionId) {
      continue;
    }
    chat.response_id = null;
    chat.store = false;
    chat.resumable = false;
    chat.updated_at = Math.floor(Date.now() / 1000);
    await writeChat(chat);
    updated += 1;
  }
  return updated;
}

export function summarizeChat(chat: ChatRecord) {
  return {
    chat_id: chat.chat_id,
    title: chat.title,
    model: chat.model,
    mode: chat.mode,
    message_count: chat.messages.length,
    updated_at: chat.updated_at,
    created_at: chat.created_at,
    session_id: chat.session_id,
    response_id: chat.response_id || null,
    store: chat.store,
    resumable: chat.resumable,
    temperature: chat.temperature,
    system_prompt: chat.system_prompt,
    auth_slot: chat.auth_slot || "",
    reasoning_effort: chat.reasoning_effort || "",
    max_tokens: chat.max_tokens
  };
}
