import vm from "vm";

export async function runJs(args: { code: string }): Promise<any> {
  const { code } = args;

  try {
    const logs: string[] = [];
    const formatLog = (...items: any[]) => items.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join(" ");

    const sandbox = {
      console: {
        log: (...items: any[]) => logs.push(formatLog(...items)),
        error: (...items: any[]) => logs.push(`[error] ${formatLog(...items)}`),
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

    const context = vm.createContext(sandbox);
    const execution = vm.runInContext(code, context, { timeout: 5000 });
    const result = typeof execution === "string" ? execution : JSON.stringify(execution ?? null, null, 2);

    return {
      ok: true,
      scope: "system",
      data: { result, type: typeof execution, logs },
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
