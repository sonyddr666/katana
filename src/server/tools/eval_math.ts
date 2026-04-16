import { evaluate } from "mathjs";

export async function evalMath(args: { expression: string }): Promise<any> {
  const { expression } = args;

  try {
    // mathjs provides safe evaluation
    const result = evaluate(expression);

    return {
      ok: true,
      scope: "system",
      data: {
        expression,
        result: result.toString(),
        type: typeof result,
      },
      suggested_next: "Use the result in further calculations",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "system",
      data: { error: error.message, expression },
      suggested_next: "Check expression syntax and supported operations",
    };
  }
}
