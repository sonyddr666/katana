import { eq } from "drizzle-orm";

import { getDb } from "../db";
import { sessions } from "../db/schema";

export interface ToolCall {
  id: string;
  type?: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: "user" | "assistant" | "system" | "tool" | string;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface Session {
  sessionId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

function rowToSession(row: { sessionId: string; messagesJson: string; createdAt: string; updatedAt: string }): Session {
  let messages: Message[] = [];
  try {
    const parsed = JSON.parse(row.messagesJson);
    if (Array.isArray(parsed)) messages = parsed as Message[];
  } catch {
    // stored JSON invalid — return empty messages
  }
  return { sessionId: row.sessionId, messages, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  if (!sessionId) return undefined;
  const db = getDb();
  const rows = await db.select().from(sessions).where(eq(sessions.sessionId, sessionId)).limit(1);
  if (rows.length === 0) return undefined;
  return rowToSession(rows[0]);
}

export async function createSession(sessionId: string, messages: Message[] = []): Promise<Session> {
  const timestamp = new Date().toISOString();
  const db = getDb();
  const session: Session = { sessionId, messages, createdAt: timestamp, updatedAt: timestamp };

  await db
    .insert(sessions)
    .values({
      sessionId,
      messagesJson: JSON.stringify(messages),
      createdAt: timestamp,
      updatedAt: timestamp
    })
    .onConflictDoUpdate({
      target: sessions.sessionId,
      set: { messagesJson: JSON.stringify(messages), updatedAt: timestamp }
    });

  return session;
}

export async function updateSession(sessionId: string, messages: Message[]): Promise<Session> {
  const existing = await getSession(sessionId);
  const now = new Date().toISOString();
  const createdAt = existing?.createdAt || now;
  const db = getDb();

  await db
    .insert(sessions)
    .values({ sessionId, messagesJson: JSON.stringify(messages), createdAt, updatedAt: now })
    .onConflictDoUpdate({
      target: sessions.sessionId,
      set: { messagesJson: JSON.stringify(messages), updatedAt: now }
    });

  return { sessionId, messages, createdAt, updatedAt: now };
}

export async function appendMessages(sessionId: string, messages: Message[]): Promise<Session> {
  const existing = await getSession(sessionId);
  if (!existing) return createSession(sessionId, messages);
  return updateSession(sessionId, [...existing.messages, ...messages]);
}

export async function clearSession(sessionId: string): Promise<boolean> {
  const db = getDb();
  const result = await db.delete(sessions).where(eq(sessions.sessionId, sessionId)).returning();
  return result.length > 0;
}

export async function listSessions(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ sessionId: sessions.sessionId }).from(sessions);
  return rows.map((r) => r.sessionId);
}
