interface Message {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, any>;
  }>;
}

interface Session {
  sessionId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

const sessions = new Map<string, Session>();

export function getSession(sessionId: string): Session | undefined {
  return sessions.get(sessionId);
}

export function createSession(sessionId: string): Session {
  const session: Session = {
    sessionId,
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  sessions.set(sessionId, session);
  return session;
}

export function updateSession(sessionId: string, messages: Message[]): Session {
  const existing = getSession(sessionId);
  if (!existing) {
    return createSession(sessionId);
  }

  existing.messages = messages;
  existing.updatedAt = new Date();
  return existing;
}

export function clearSession(sessionId: string): boolean {
  return sessions.delete(sessionId);
}

export function listSessions(): string[] {
  return Array.from(sessions.keys());
}
