import type { Request, Response } from "express";

// Simple in-memory event emitter for SSE
interface SSEEvent {
  id: string;
  event: string;
  data: any;
}

const eventQueue = new Map<string, Array<SSEEvent>>();

export function sseRouter(req: Request, res: Response) {
  const sessionId = req.query.id as string || String(Date.now());

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Initialize queue for this session
  if (!eventQueue.has(sessionId)) {
    eventQueue.set(sessionId, []);
  }

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ sessionId })}\n\n`);

  // Store response object for this session
  (res as any).sessionId = sessionId;

  // Send queued events
  const queue = eventQueue.get(sessionId)!;
  queue.forEach((evt) => {
    res.write(`event: ${evt.event}\ndata: ${JSON.stringify(evt.data)}\n\n`);
  });
  queue.length = 0;

  // Keep connection alive
  const keepAlive = setInterval(() => {
    res.write(":\n\n");
  }, 15000);

  // Cleanup on disconnect
  req.on("close", () => {
    clearInterval(keepAlive);
    console.log(`SSE connection closed for session: ${sessionId}`);
  });

  res.on("close", () => {
    clearInterval(keepAlive);
  });

  return res;
}

// Helper to send event to a specific session
export function sendEvent(sessionId: string, event: string, data: any) {
  const queue = eventQueue.get(sessionId);
  if (queue) {
    queue.push({ id: Date.now().toString(), event, data });
  }
}

// Stream tool execution progress (stub - integrated into rpcHandler in production)
export function streamToolProgress(sessionId: string, toolName: string, status: string, data: any) {
  sendEvent(sessionId, "tool_update", { tool: toolName, status, data });
}
