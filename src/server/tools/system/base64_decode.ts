export async function base64Decode(args: { text: string }): Promise<any> {
  const { text } = args;

  try {
    const decoded = Buffer.from(text, "base64").toString("utf-8");

    return {
      ok: true,
      scope: "system",
      data: { original_length: text.length, decoded, decoded_length: decoded.length },
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "system",
      data: { error: "Invalid base64 string: " + error.message },
    };
  }
}
