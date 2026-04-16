import vm from "vm";

export async function runJs(args: { code: string }): Promise<any> {
  const { code } = args;

  try {
    // Create a sandbox with limited context
    const sandbox = {
      console: {
        log: (...args: any[]) => console.log("[JS]", ...args),
        error: (...args: any[]) => console.error("[JS]", ...args),
      },
      Math: Math,
      Date: Date,
      JSON: JSON,
      Array: Array,
      Object: Object,
      String: String,
      Number: Number,
      Boolean: Boolean,
      RegExp: RegExp,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
    };

    // Create context with limited globals
    const context = vm.createContext(sandbox);

    // Run code with timeout
    let result: any;
    const execution = vm.runInContext(code, context, { timeout: 5000 });
    result = execution;

    try {
      result = JSON.stringify(result);
    } catch {
      // not JSON serializable, keep as is
    }

    return {
      ok: true,
      scope: "system",
      data: { result, type: typeof result },
      suggested_next: "Use the result in your next step",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "system",
      data: { error: error.message, stack: error.stack?.split("\n")[0] },
      suggested_next: "Simplify the code or check for syntax errors",
    };
  }
}
