import { beforeEach, describe, expect, it } from "vitest";

import { useInMemoryDbForTests } from "../src/server/db";
import {
  appendMessages,
  clearSession,
  createSession,
  getSession,
  listSessions,
  updateSession
} from "../src/server/history/store";

describe("history/store (SQLite)", () => {
  beforeEach(() => {
    useInMemoryDbForTests();
  });

  it("cria e recupera sessão", async () => {
    const created = await createSession("s1", [{ role: "user", content: "hi" }]);
    expect(created.sessionId).toBe("s1");
    expect(created.messages).toHaveLength(1);

    const fetched = await getSession("s1");
    expect(fetched?.sessionId).toBe("s1");
    expect(fetched?.messages[0].content).toBe("hi");
  });

  it("retorna undefined para sessão inexistente", async () => {
    expect(await getSession("nope")).toBeUndefined();
  });

  it("atualiza sessão preservando createdAt", async () => {
    await createSession("s2", []);
    const first = await getSession("s2");
    await new Promise((r) => setTimeout(r, 10));
    const updated = await updateSession("s2", [{ role: "user", content: "msg" }]);
    expect(updated.createdAt).toBe(first?.createdAt);
    expect(updated.messages).toHaveLength(1);
  });

  it("appendMessages concatena", async () => {
    await createSession("s3", [{ role: "user", content: "a" }]);
    await appendMessages("s3", [{ role: "assistant", content: "b" }]);
    const result = await getSession("s3");
    expect(result?.messages).toHaveLength(2);
  });

  it("appendMessages cria se não existir", async () => {
    const result = await appendMessages("s4", [{ role: "user", content: "new" }]);
    expect(result.messages).toHaveLength(1);
  });

  it("clearSession remove", async () => {
    await createSession("s5", []);
    expect(await clearSession("s5")).toBe(true);
    expect(await clearSession("s5")).toBe(false);
  });

  it("listSessions lista IDs", async () => {
    await createSession("a", []);
    await createSession("b", []);
    const ids = await listSessions();
    expect(ids).toContain("a");
    expect(ids).toContain("b");
  });
});
