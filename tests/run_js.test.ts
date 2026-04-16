import { describe, expect, it } from "vitest";

import { runJs } from "../src/server/tools/run_js";

describe("tools/run_js (isolated-vm)", () => {
  it("executa expressão simples", async () => {
    const result = await runJs({ code: "return 1 + 2;" });
    expect(result.ok).toBe(true);
    expect(result.data.result).toBe("3");
    expect(result.data.type).toBe("number");
  });

  it("captura logs via console.log", async () => {
    const result = await runJs({ code: "console.log('hello', 42); return 'done';" });
    expect(result.ok).toBe(true);
    expect(result.data.logs.length).toBe(1);
    expect(result.data.logs[0]).toContain("hello");
    expect(result.data.logs[0]).toContain("42");
  });

  it("retorna erro para código inválido", async () => {
    const result = await runJs({ code: "this is not valid js;;;" });
    expect(result.ok).toBe(false);
    expect(result.data.error).toBeDefined();
  });

  it("rejeita código vazio", async () => {
    const result = await runJs({ code: "" });
    expect(result.ok).toBe(false);
  });

  it("não dá acesso a require/process", async () => {
    const result = await runJs({ code: "return typeof require + ',' + typeof process;" });
    expect(result.ok).toBe(true);
    expect(result.data.result).toContain("undefined");
  });

  it("respeita timeout em loop infinito", async () => {
    const result = await runJs({ code: "while(true){}" });
    expect(result.ok).toBe(false);
    expect(String(result.data.error).toLowerCase()).toMatch(/time|out/);
  }, 15000);
});
