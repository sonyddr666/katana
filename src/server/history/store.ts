import { promises as fs } from "fs";
import path from "path";

import { config } from "../config/env";

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

function sanitizeSessionId(sessionId: string): string {
  return String(sessionId || "default").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function sessionFile(sessionId: string): string {
  return path.join(config.historyDir, `${sanitizeSessionId(sessionId)}.json`);
}

async function readSessionFile(sessionId: string): Promise<Session | undefined> {
  try {
    const raw = await fs.readFile(sessionFile(sessionId), "utf-8");
    return JSON.parse(raw) as Session;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

async function writeSessionFile(session: Session): Promise<void> {
  await fs.mkdir(config.historyDir, { recursive: true });
  await fs.writeFile(sessionFile(session.sessionId), `${JSON.stringify(session, null, 2)}\n`, "utf-8");
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  if (!sessionId) {
    return undefined;
  }

  return readSessionFile(sessionId);
}

export async function createSession(sessionId: string, messages: Message[] = []): Promise<Session> {
  const timestamp = new Date().toISOString();
  const session: Session = {
    sessionId,
    messages,
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await writeSessionFile(session);
  return session;
}

export async function updateSession(sessionId: string, messages: Message[]): Promise<Session> {
  const existing = await getSession(sessionId);
  const createdAt = existing?.createdAt || new Date().toISOString();
  const session: Session = {
    sessionId,
    messages,
    createdAt,
    updatedAt: new Date().toISOString(),
  };

  await writeSessionFile(session);
  return session;
}

export async function appendMessages(sessionId: string, messages: Message[]): Promise<Session> {
  const existing = await getSession(sessionId);
  if (!existing) {
    return createSession(sessionId, messages);
  }

  return updateSession(sessionId, [...existing.messages, ...messages]);
}

export async function clearSession(sessionId: string): Promise<boolean> {
  try {
    await fs.unlink(sessionFile(sessionId));
    return true;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function listSessions(): Promise<string[]> {
  try {
    const entries = await fs.readdir(config.historyDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name.replace(/\.json$/, ""));
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
