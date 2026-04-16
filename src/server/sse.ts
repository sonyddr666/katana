import { Router, type Request, type Response } from "express";

interface SseEvent {
  event: string;
  data: unknown;
  sentAt: string;
}

const clients = new Map<string, Set<Response>>();
const backlog = new Map<string, SseEvent[]>();
const MAX_BACKLOG_EVENTS = 100;

function writeEvent(res: Response, event: string, data: unknown): void {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function queueEvent(sessionId: string, payload: SseEvent): void {
  const events = backlog.get(sessionId) || [];
  events.push(payload);
  if (events.length > MAX_BACKLOG_EVENTS) {
    events.splice(0, events.length - MAX_BACKLOG_EVENTS);
  }
  backlog.set(sessionId, events);
}

function flushBacklog(sessionId: string, res: Response): void {
  const events = backlog.get(sessionId);
  if (!events?.length) {
    return;
  }

  for (const payload of events) {
    writeEvent(res, payload.event, payload.data);
  }

  backlog.set(sessionId, []);
}

function registerClient(sessionId: string, res: Response): void {
  const set = clients.get(sessionId) || new Set<Response>();
  set.add(res);
  clients.set(sessionId, set);
}

function unregisterClient(sessionId: string, res: Response): void {
  const set = clients.get(sessionId);
  if (!set) {
    return;
  }

  set.delete(res);
  if (!set.size) {
    clients.delete(sessionId);
  }
}

export const sseRouter = Router();

sseRouter.get("/:id?", (req: Request, res: Response) => {
  const sessionId = String(req.params.id || req.query.id || "default");

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.flushHeaders?.();

  registerClient(sessionId, res);
  writeEvent(res, "connected", { sessionId, connectedAt: new Date().toISOString() });
  flushBacklog(sessionId, res);

  const keepAlive = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);

  const cleanup = () => {
    clearInterval(keepAlive);
    unregisterClient(sessionId, res);
  };

  req.on("close", cleanup);
  res.on("close", cleanup);
});

export function sendEvent(sessionId: string | undefined, event: string, data: unknown): void {
  if (!sessionId) {
    return;
  }

  const payload: SseEvent = {
    event,
    data,
    sentAt: new Date().toISOString(),
  };

  const listeners = clients.get(sessionId);
  if (!listeners?.size) {
    queueEvent(sessionId, payload);
    return;
  }

  for (const client of listeners) {
    writeEvent(client, event, data);
  }
}

export function streamToolProgress(
  sessionId: string | undefined,
  toolName: string,
  status: "running" | "done" | "error",
  data: Record<string, unknown>
): void {
  sendEvent(sessionId, "tool_update", {
    tool: toolName,
    status,
    ...data,
  });
}
