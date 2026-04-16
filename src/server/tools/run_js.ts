import ivm from "isolated-vm";

import { logger } from "../logger";

const MEMORY_LIMIT_MB = 64;
const TIMEOUT_MS = 5000;

export async function runJs(args: { code: string }): Promise<any> {
  const { code } = args;

  if (typeof code !== "string" || !code.trim()) {
    return {
      ok: false,
      scope: "system",
      data: { error: "Missing or empty 'code' argument" },
      suggested_next: "Provide JavaScript code to execute"
    };
  }

  let isolate: ivm.Isolate | null = null;
  const logs: string[] = [];

  try {
    isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });
    const context = await isolate.createContext();
    const jail = context.global;

    await jail.set("global", jail.derefInto());

    await jail.set("_logCallback", new ivm.Reference((...items: unknown[]) => {
      const line = items.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ");
      logs.push(line);
    }));

    await jail.set("_errCallback", new ivm.Reference((...items: unknown[]) => {
      const line = items.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ");
      logs.push(`[error] ${line}`);
    }));

    await context.eval(`
      const console = {
        log: (...a) => _logCallback.applySync(undefined, a.map(x => typeof x === 'object' ? JSON.stringify(x) : x)),
        error: (...a) => _errCallback.applySync(undefined, a.map(x => typeof x === 'object' ? JSON.stringify(x) : x))
      };
    `);

    const wrapped = `(() => { return (function userCode() { ${code} })(); })()`;
    const script = await isolate.compileScript(wrapped);
    const execution = await script.run(context, { timeout: TIMEOUT_MS, copy: true });

    const resultType = typeof execution;
    const result = resultType === "string" ? (execution as string) : JSON.stringify(execution ?? null, null, 2);

    return {
      ok: true,
      scope: "system",
      data: { result, type: resultType, logs },
      suggested_next: "Use the result in your next step"
    };
  } catch (error: any) {
    logger.debug({ err: error }, "run_js execution failed");
    return {
      ok: false,
      scope: "system",
      data: { error: error.message || String(error), stack: error.stack?.split("\n")[0], logs },
      suggested_next: "Simplify the code or check for syntax errors"
    };
  } finally {
    try {
      isolate?.dispose();
    } catch {
      // ignore
    }
  }
}
