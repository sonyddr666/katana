import { and, desc, eq, like, or } from "drizzle-orm";

import { getDb } from "./db";
import { chats } from "./db/schema";

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

export interface ListChatsOptions {
  limit?: number;
  offset?: number;
  sessionId?: string;
}

function deriveTitle(messages: ChatMessage[], fallback: string): string {
  const firstUserMessage = messages.find((m) => m.role === "user" && String(m.content || "").trim());
  const title = String(firstUserMessage?.content || fallback).replace(/\s+/g, " ").trim();
  return title.length > 80 ? `${title.slice(0, 77)}…` : title || fallback;
}

type ChatDbRow = {
  chatId: string;
  sessionId: string;
  title: string;
  model: string;
  mode: string;
  createdAt: number;
  updatedAt: number;
  temperature: number | null;
  systemPrompt: string | null;
  reasoningEffort: string | null;
  maxTokens: number | null;
  authSlot: string | null;
  responseId: string | null;
  store: boolean;
  resumable: boolean;
  messagesJson: string;
};

function rowToChat(row: ChatDbRow): ChatRecord {
  let messages: ChatMessage[] = [];
  try {
    const parsed = JSON.parse(row.messagesJson);
    if (Array.isArray(parsed)) messages = parsed as ChatMessage[];
  } catch {
    // invalid stored JSON — empty
  }
  return {
    chat_id: row.chatId,
    session_id: row.sessionId,
    title: row.title,
    model: row.model,
    mode: row.mode,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    temperature: row.temperature ?? undefined,
    system_prompt: row.systemPrompt ?? undefined,
    reasoning_effort: row.reasoningEffort ?? undefined,
    max_tokens: row.maxTokens ?? undefined,
    auth_slot: row.authSlot ?? undefined,
    response_id: row.responseId,
    store: row.store,
    resumable: row.resumable,
    messages
  };
}

function chatToRowValues(record: ChatRecord) {
  return {
    chatId: record.chat_id,
    sessionId: record.session_id,
    title: record.title,
    model: record.model,
    mode: record.mode,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    temperature: record.temperature ?? null,
    systemPrompt: record.system_prompt ?? null,
    reasoningEffort: record.reasoning_effort ?? null,
    maxTokens: record.max_tokens ?? null,
    authSlot: record.auth_slot ?? null,
    responseId: record.response_id ?? null,
    store: Boolean(record.store),
    resumable: Boolean(record.resumable),
    messagesJson: JSON.stringify(record.messages)
  };
}

export async function getChat(chatId: string): Promise<ChatRecord | null> {
  const db = getDb();
  const rows = await db.select().from(chats).where(eq(chats.chatId, chatId)).limit(1);
  if (rows.length === 0) return null;
  return rowToChat(rows[0] as ChatDbRow);
}

export async function saveChat(record: ChatRecord): Promise<ChatRecord> {
  const db = getDb();
  const values = chatToRowValues(record);
  await db
    .insert(chats)
    .values(values)
    .onConflictDoUpdate({ target: chats.chatId, set: values });
  return record;
}

export async function upsertChat(
  input: Partial<ChatRecord> & { chat_id: string; session_id: string; model: string; mode: string; messages: ChatMessage[] }
): Promise<ChatRecord> {
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
    messages: input.messages.map((m) => ({ ...m, ts: m.ts || now }))
  };
  return saveChat(record);
}

export async function listChats(options: ListChatsOptions = {}): Promise<ChatRecord[]> {
  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);

  const query = options.sessionId
    ? db.select().from(chats).where(eq(chats.sessionId, options.sessionId))
    : db.select().from(chats);

  const rows = await query.orderBy(desc(chats.updatedAt)).limit(limit).offset(offset);
  return rows.map((r) => rowToChat(r as ChatDbRow));
}

export async function searchChats(query: string, options: ListChatsOptions = {}): Promise<ChatRecord[]> {
  const normalized = String(query || "").trim();
  if (!normalized) return listChats(options);

  const db = getDb();
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const like1 = `%${normalized.toLowerCase()}%`;

  const rows = await db
    .select()
    .from(chats)
    .where(or(like(chats.title, like1), like(chats.messagesJson, like1)))
    .orderBy(desc(chats.updatedAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => rowToChat(r as ChatDbRow));
}

export async function deleteChat(chatId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.delete(chats).where(eq(chats.chatId, chatId)).returning();
  return result.length > 0;
}

export async function clearThreadBySessionId(sessionId: string): Promise<number> {
  const db = getDb();
  const now = Math.floor(Date.now() / 1000);
  const result = await db
    .update(chats)
    .set({ responseId: null, store: false, resumable: false, updatedAt: now })
    .where(and(eq(chats.sessionId, sessionId)))
    .returning();
  return result.length;
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
