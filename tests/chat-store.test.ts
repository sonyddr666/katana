import { beforeEach, describe, expect, it } from "vitest";

import {
  clearThreadBySessionId,
  deleteChat,
  getChat,
  listChats,
  searchChats,
  summarizeChat,
  upsertChat
} from "../src/server/chat-store";
import { useInMemoryDbForTests } from "../src/server/db";

const baseChat = (id: string, overrides: Partial<Parameters<typeof upsertChat>[0]> = {}) => ({
  chat_id: id,
  session_id: `sess-${id}`,
  model: "gpt-5.4-mini",
  mode: "chat",
  messages: [{ role: "user", content: `pergunta ${id}` }],
  ...overrides
});

describe("chat-store (SQLite)", () => {
  beforeEach(() => {
    useInMemoryDbForTests();
  });

  it("upsert cria novo chat com título derivado", async () => {
    const chat = await upsertChat(baseChat("c1"));
    expect(chat.chat_id).toBe("c1");
    expect(chat.title).toContain("pergunta c1");
    expect(chat.messages[0].ts).toBeGreaterThan(0);
  });

  it("upsert preserva createdAt ao atualizar", async () => {
    await upsertChat(baseChat("c2"));
    const first = await getChat("c2");
    await new Promise((r) => setTimeout(r, 10));
    const second = await upsertChat(baseChat("c2", { messages: [{ role: "user", content: "novo" }] }));
    expect(second.created_at).toBe(first?.created_at);
  });

  it("listChats ordena por updated_at desc", async () => {
    await upsertChat(baseChat("older"));
    await new Promise((r) => setTimeout(r, 1100));
    await upsertChat(baseChat("newer"));
    const chats = await listChats();
    expect(chats[0].chat_id).toBe("newer");
    expect(chats[1].chat_id).toBe("older");
  });

  it("listChats aplica limit/offset", async () => {
    for (let i = 0; i < 5; i++) {
      await upsertChat(baseChat(`p${i}`));
    }
    const page1 = await listChats({ limit: 2, offset: 0 });
    const page2 = await listChats({ limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1[0].chat_id).not.toBe(page2[0].chat_id);
  });

  it("searchChats encontra por título", async () => {
    await upsertChat(baseChat("x1", { title: "Receita de bolo" }));
    await upsertChat(baseChat("x2", { title: "Como fazer café" }));
    const result = await searchChats("bolo");
    expect(result).toHaveLength(1);
    expect(result[0].chat_id).toBe("x1");
  });

  it("clearThreadBySessionId zera response_id/store/resumable", async () => {
    await upsertChat(baseChat("t1", { session_id: "shared", response_id: "rid1", store: true, resumable: true }));
    await upsertChat(baseChat("t2", { session_id: "shared", response_id: "rid2", store: true, resumable: true }));
    const updated = await clearThreadBySessionId("shared");
    expect(updated).toBe(2);
    const chat = await getChat("t1");
    expect(chat?.response_id).toBeNull();
    expect(chat?.store).toBe(false);
  });

  it("deleteChat remove", async () => {
    await upsertChat(baseChat("d1"));
    expect(await deleteChat("d1")).toBe(true);
    expect(await deleteChat("d1")).toBe(false);
    expect(await getChat("d1")).toBeNull();
  });

  it("summarizeChat expõe metadata", async () => {
    const chat = await upsertChat(baseChat("s1"));
    const summary = summarizeChat(chat);
    expect(summary.chat_id).toBe("s1");
    expect(summary.message_count).toBe(1);
  });
});
