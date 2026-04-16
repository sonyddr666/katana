import { describe, expect, it } from "vitest";

import { config } from "../src/server/config/env";

describe("config/env", () => {
  it("carrega valores padrão válidos", () => {
    expect(config.port).toBeTypeOf("number");
    expect(config.port).toBeGreaterThan(0);
    expect(config.host).toBeTruthy();
    expect(config.maxToolLoops).toBeGreaterThan(0);
    expect(config.toolTimeoutMs).toBeGreaterThan(0);
  });

  it("resolve diretórios como absolutos", () => {
    expect(config.workspaceDir).toMatch(/[\\/]/);
    expect(config.dataDir).toMatch(/[\\/]/);
    expect(config.historyDir).toMatch(/[\\/]/);
  });

  it("modelo default está na lista disponível", () => {
    expect(config.availableModels).toContain(config.defaultCodexModel);
  });

  it("rate limit tem valores sensatos", () => {
    expect(config.rateLimitWindowMs).toBeGreaterThanOrEqual(1000);
    expect(config.rateLimitMax).toBeGreaterThan(0);
  });
});
