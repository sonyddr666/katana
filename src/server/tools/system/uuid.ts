import { v4 as uuidv4 } from "uuid";

export async function generateUuid(_args: {}): Promise<any> {
  try {
    const id = uuidv4();

    return {
      ok: true,
      scope: "system",
      data: { uuid: id },
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "system",
      data: { error: error.message },
    };
  }
}
