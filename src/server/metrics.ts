interface ToolStats {
  calls: number;
  errors: number;
  totalLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  lastError?: string;
  lastCallAt?: string;
}

interface Counters {
  rpcRequests: number;
  rpcErrors: number;
  toolLoopIterations: number;
  codexCalls: number;
  codexErrors: number;
  startedAt: string;
}

const counters: Counters = {
  rpcRequests: 0,
  rpcErrors: 0,
  toolLoopIterations: 0,
  codexCalls: 0,
  codexErrors: 0,
  startedAt: new Date().toISOString()
};

const toolStats = new Map<string, ToolStats>();

function getOrCreate(name: string): ToolStats {
  let entry = toolStats.get(name);
  if (!entry) {
    entry = {
      calls: 0,
      errors: 0,
      totalLatencyMs: 0,
      minLatencyMs: Number.POSITIVE_INFINITY,
      maxLatencyMs: 0
    };
    toolStats.set(name, entry);
  }
  return entry;
}

export function recordToolCall(name: string, latencyMs: number, success: boolean, errorMessage?: string) {
  const entry = getOrCreate(name);
  entry.calls += 1;
  if (!success) {
    entry.errors += 1;
    entry.lastError = errorMessage;
  }
  entry.totalLatencyMs += latencyMs;
  entry.minLatencyMs = Math.min(entry.minLatencyMs, latencyMs);
  entry.maxLatencyMs = Math.max(entry.maxLatencyMs, latencyMs);
  entry.lastCallAt = new Date().toISOString();
}

export function incrementRpcRequest() {
  counters.rpcRequests += 1;
}

export function incrementRpcError() {
  counters.rpcErrors += 1;
}

export function incrementToolLoopIteration() {
  counters.toolLoopIterations += 1;
}

export function incrementCodexCall(success: boolean) {
  counters.codexCalls += 1;
  if (!success) counters.codexErrors += 1;
}

export function snapshot() {
  const tools: Record<string, unknown> = {};
  for (const [name, stats] of toolStats.entries()) {
    tools[name] = {
      calls: stats.calls,
      errors: stats.errors,
      avg_latency_ms: stats.calls > 0 ? Math.round(stats.totalLatencyMs / stats.calls) : 0,
      min_latency_ms: stats.minLatencyMs === Number.POSITIVE_INFINITY ? 0 : stats.minLatencyMs,
      max_latency_ms: stats.maxLatencyMs,
      last_error: stats.lastError,
      last_call_at: stats.lastCallAt
    };
  }

  return {
    counters: { ...counters, uptime_s: Math.floor((Date.now() - new Date(counters.startedAt).getTime()) / 1000) },
    tools
  };
}

export function resetForTests() {
  counters.rpcRequests = 0;
  counters.rpcErrors = 0;
  counters.toolLoopIterations = 0;
  counters.codexCalls = 0;
  counters.codexErrors = 0;
  toolStats.clear();
}
