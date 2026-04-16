import { promises as fs } from "fs";
import path from "path";

import { config } from "../src/server/config/env";
import { saveChat, type ChatRecord } from "../src/server/chat-store";
import { createSession, type Message } from "../src/server/history/store";

async function migrateSessions(): Promise<number> {
  let count = 0;
  try {
    const entries = await fs.readdir(config.historyDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(config.historyDir, entry.name), "utf-8");
      try {
        const data = JSON.parse(raw) as { sessionId: string; messages: Message[] };
        if (!data.sessionId || !Array.isArray(data.messages)) continue;
        await createSession(data.sessionId, data.messages);
        count += 1;
      } catch (err) {
        console.warn(`Skip ${entry.name}:`, (err as Error).message);
      }
    }
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  return count;
}

async function migrateChats(): Promise<number> {
  let count = 0;
  try {
    const entries = await fs.readdir(config.chatsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const raw = await fs.readFile(path.join(config.chatsDir, entry.name), "utf-8");
      try {
        const data = JSON.parse(raw) as ChatRecord;
        if (!data.chat_id) continue;
        await saveChat(data);
        count += 1;
      } catch (err) {
        console.warn(`Skip ${entry.name}:`, (err as Error).message);
      }
    }
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
  }
  return count;
}

async function main() {
  console.log("Migrating legacy JSON files to SQLite...");
  const sessions = await migrateSessions();
  const chats = await migrateChats();
  console.log(`Done. Migrated ${sessions} session(s), ${chats} chat(s).`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
