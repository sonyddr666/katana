export async function base64Encode(args: { text: string }): Promise<any> {
  const { text } = args;

  try {
    const encoded = Buffer.from(text, "utf-8").toString("base64");

    return {
      ok: true,
      scope: "system",
      data: { original_length: text.length, encoded, type: "base64" },
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "system",
      data: { error: error.message },
    };
  }
}
