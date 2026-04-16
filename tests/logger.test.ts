import { describe, expect, it } from "vitest";

import { childLogger, logger } from "../src/server/logger";

describe("logger", () => {
  it("exporta instância pino", () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.warn).toBe("function");
  });

  it("childLogger cria logger com bindings", () => {
    const child = childLogger({ module: "test" });
    expect(child).toBeDefined();
    expect(typeof child.info).toBe("function");
  });
});
