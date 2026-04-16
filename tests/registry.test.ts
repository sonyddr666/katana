import { describe, expect, it } from "vitest";

import { getToolByName, listTools, toolRegistry } from "../src/server/tools/registry";

describe("tools/registry", () => {
  it("expõe ferramentas registradas", () => {
    expect(toolRegistry.length).toBeGreaterThan(0);
  });

  it("listTools retorna metadata sem handler", () => {
    const list = listTools();
    expect(list.length).toBe(toolRegistry.length);
    for (const entry of list) {
      expect(entry).toHaveProperty("name");
      expect(entry).toHaveProperty("description");
      expect(entry).toHaveProperty("scope");
      expect(entry).toHaveProperty("schema");
      expect((entry as Record<string, unknown>).handler).toBeUndefined();
    }
  });

  it("getToolByName encontra ferramenta existente", () => {
    const search = getToolByName("search_web");
    expect(search).toBeDefined();
    expect(search?.scope).toBe("web");
  });

  it("getToolByName retorna undefined para nome inexistente", () => {
    expect(getToolByName("ferramenta_que_nao_existe")).toBeUndefined();
  });

  it("nomes de ferramentas são únicos", () => {
    const names = toolRegistry.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
