import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const sessions = sqliteTable("sessions", {
  sessionId: text("session_id").primaryKey(),
  messagesJson: text("messages_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull()
});

export const chats = sqliteTable(
  "chats",
  {
    chatId: text("chat_id").primaryKey(),
    sessionId: text("session_id").notNull(),
    title: text("title").notNull(),
    model: text("model").notNull(),
    mode: text("mode").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    temperature: integer("temperature"),
    systemPrompt: text("system_prompt"),
    reasoningEffort: text("reasoning_effort"),
    maxTokens: integer("max_tokens"),
    authSlot: text("auth_slot"),
    responseId: text("response_id"),
    store: integer("store", { mode: "boolean" }).notNull().default(false),
    resumable: integer("resumable", { mode: "boolean" }).notNull().default(false),
    messagesJson: text("messages_json").notNull().default("[]")
  },
  (table) => ({
    sessionIdx: index("chats_session_id_idx").on(table.sessionId),
    updatedAtIdx: index("chats_updated_at_idx").on(table.updatedAt)
  })
);

export type SessionRow = typeof sessions.$inferSelect;
export type ChatRow = typeof chats.$inferSelect;
