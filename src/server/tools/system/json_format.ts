export async function jsonFormat(args: { raw: string }): Promise<any> {
  const { raw } = args;

  try {
    const parsed = JSON.parse(raw);
    const formatted = JSON.stringify(parsed, null, 2);

    return {
      ok: true,
      scope: "system",
      data: {
        original_length: raw.length,
        formatted,
        formatted_length: formatted.length,
        valid: true,
      },
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "system",
      data: {
        error: error.message,
        raw: raw.substring(0, 200),
        valid: false,
      },
      suggested_next: "Check JSON syntax - missing quotes or brackets?",
    };
  }
}
