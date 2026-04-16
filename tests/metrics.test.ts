import { beforeEach, describe, expect, it } from "vitest";

import {
  incrementCodexCall,
  incrementRpcError,
  incrementRpcRequest,
  incrementToolLoopIteration,
  recordToolCall,
  resetForTests,
  snapshot
} from "../src/server/metrics";

describe("metrics", () => {
  beforeEach(() => resetForTests());

  it("registra chamadas de tool com latência", () => {
    recordToolCall("search_web", 100, true);
    recordToolCall("search_web", 200, true);
    recordToolCall("search_web", 50, false, "boom");

    const snap = snapshot();
    const tool = snap.tools.search_web as Record<string, unknown>;
    expect(tool.calls).toBe(3);
    expect(tool.errors).toBe(1);
    expect(tool.avg_latency_ms).toBe(117);
    expect(tool.min_latency_ms).toBe(50);
    expect(tool.max_latency_ms).toBe(200);
    expect(tool.last_error).toBe("boom");
  });

  it("conta rpc, codex e loop iterations", () => {
    incrementRpcRequest();
    incrementRpcRequest();
    incrementRpcError();
    incrementToolLoopIteration();
    incrementCodexCall(true);
    incrementCodexCall(false);

    const snap = snapshot();
    expect(snap.counters.rpcRequests).toBe(2);
    expect(snap.counters.rpcErrors).toBe(1);
    expect(snap.counters.toolLoopIterations).toBe(1);
    expect(snap.counters.codexCalls).toBe(2);
    expect(snap.counters.codexErrors).toBe(1);
  });

  it("snapshot inclui uptime", () => {
    const snap = snapshot();
    expect(snap.counters.uptime_s).toBeGreaterThanOrEqual(0);
  });
});
