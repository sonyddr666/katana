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

export const ragEntries = sqliteTable(
  "rag_entries",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    filepath: text("filepath").notNull(),
    chunkIndex: integer("chunk_index").notNull().default(0),
    content: text("content").notNull(),
    excerpt: text("excerpt").notNull(),
    embedding: text("embedding").notNull(),
    embeddingModel: text("embedding_model").notNull(),
    embeddingDim: integer("embedding_dim").notNull(),
    bytes: integer("bytes").notNull().default(0),
    ingestedAt: text("ingested_at").notNull()
  },
  (table) => ({
    userIdx: index("rag_user_id_idx").on(table.userId),
    filepathIdx: index("rag_filepath_idx").on(table.filepath)
  })
);

export type SessionRow = typeof sessions.$inferSelect;
export type ChatRow = typeof chats.$inferSelect;
export type RagEntryRow = typeof ragEntries.$inferSelect;
