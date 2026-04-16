import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";

import { config } from "../config/env";
import { logger } from "../logger";
import * as schema from "./schema";

let singleton: BetterSQLite3Database<typeof schema> | null = null;
let rawSqlite: Database.Database | null = null;

function openDatabase(): BetterSQLite3Database<typeof schema> {
  const dbPath = path.join(config.dataDir, "katana.db");
  mkdirSync(path.dirname(dbPath), { recursive: true });

  rawSqlite = new Database(dbPath);
  rawSqlite.pragma("journal_mode = WAL");
  rawSqlite.pragma("foreign_keys = ON");
  rawSqlite.pragma("busy_timeout = 5000");

  const instance = drizzle(rawSqlite, { schema });
  runBootstrapMigrations(rawSqlite);
  logger.info({ dbPath }, "SQLite database opened");
  return instance;
}

function runBootstrapMigrations(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      messages_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chats (
      chat_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      model TEXT NOT NULL,
      mode TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      temperature INTEGER,
      system_prompt TEXT,
      reasoning_effort TEXT,
      max_tokens INTEGER,
      auth_slot TEXT,
      response_id TEXT,
      store INTEGER NOT NULL DEFAULT 0,
      resumable INTEGER NOT NULL DEFAULT 0,
      messages_json TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS chats_session_id_idx ON chats(session_id);
    CREATE INDEX IF NOT EXISTS chats_updated_at_idx ON chats(updated_at);

    CREATE TABLE IF NOT EXISTS rag_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filepath TEXT NOT NULL,
      chunk_index INTEGER NOT NULL DEFAULT 0,
      content TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      embedding TEXT NOT NULL,
      embedding_model TEXT NOT NULL,
      embedding_dim INTEGER NOT NULL,
      bytes INTEGER NOT NULL DEFAULT 0,
      ingested_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS rag_user_id_idx ON rag_entries(user_id);
    CREATE INDEX IF NOT EXISTS rag_filepath_idx ON rag_entries(filepath);
  `);
}

export function getDb(): BetterSQLite3Database<typeof schema> {
  if (!singleton) {
    singleton = openDatabase();
  }
  return singleton;
}

export function closeDb(): void {
  if (rawSqlite) {
    rawSqlite.close();
    rawSqlite = null;
    singleton = null;
  }
}

export function useInMemoryDbForTests(): BetterSQLite3Database<typeof schema> {
  closeDb();
  rawSqlite = new Database(":memory:");
  rawSqlite.pragma("journal_mode = WAL");
  rawSqlite.pragma("foreign_keys = ON");
  runBootstrapMigrations(rawSqlite);
  singleton = drizzle(rawSqlite, { schema });
  return singleton;
}

export { schema };
