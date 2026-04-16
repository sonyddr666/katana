import { clearSession, getSession } from "./store";

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export async function handleHistoryGet(params: {
  sessionId?: string;
}): Promise<RpcResponse> {
  const { sessionId } = params;

  if (!sessionId) {
    return {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32602, message: "Invalid params: sessionId required" },
    };
  }

  const session = await getSession(sessionId);
  if (!session) {
    return {
      jsonrpc: "2.0",
      id: null,
      result: { sessionId, messages: [] },
    };
  }

  return {
    jsonrpc: "2.0",
    id: null,
    result: {
      sessionId,
      messages: session.messages,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    },
  };
}

export async function handleHistoryClear(params: {
  sessionId?: string;
}): Promise<RpcResponse> {
  const { sessionId } = params;

  if (!sessionId) {
    return {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32602, message: "Invalid params: sessionId required" },
    };
  }

  const deleted = await clearSession(sessionId);

  return {
    jsonrpc: "2.0",
    id: null,
    result: { sessionId, deleted },
  };
}

export function getHistoryHandler() {
  return {
    "history.get": handleHistoryGet,
    "history.clear": handleHistoryClear,
  };
}
