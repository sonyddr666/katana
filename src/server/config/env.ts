import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import { z } from "zod";

const projectRoot = path.resolve(__dirname, "..", "..", "..");
dotenv.config({ path: path.join(projectRoot, ".env") });

const DEFAULT_CODEX_MODELS = [
  "gpt-5.4",
  "gpt-5.4-mini",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.2",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini"
];

const listSchema = (fallback: string[]) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      const trimmed = raw?.trim();
      if (!trimmed) return fallback;
      return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).optional(),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(8080),
  MAX_TOOL_LOOPS: z.coerce.number().int().positive().default(8),
  TOOL_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  WORKSPACE_DIR: z.string().optional(),
  DATA_DIR: z.string().optional(),
  CODEX_RESPONSES_URL: z.string().url().default("https://chatgpt.com/backend-api/codex/responses"),
  CODEX_REFRESH_URL: z.string().url().default("https://chatgpt.com/api/auth/session"),
  DEFAULT_CODEX_MODEL: z.string().default("gpt-5.4-mini"),
  AVAILABLE_MODELS: listSchema(DEFAULT_CODEX_MODELS),
  QDRANT_HOST: z.string().default(""),
  QDRANT_COLLECTION: z.string().default("codex-rag"),
  AUTH_FILE: z.string().optional(),
  AUTH_REFRESH_URL: z.string().url().optional(),
  AUTH_JSON: z.string().default(""),
  CHATS_DIR: z.string().optional(),
  UPLOADS_DIR: z.string().optional(),
  AUTH_POOL_DIR: z.string().optional(),
  STORE_STATE_FILE: z.string().optional(),
  ADMIN_PIN: z.string().default(""),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  EMBEDDING_DIM: z.coerce.number().int().positive().default(384),
  EMBEDDING_CHUNK_SIZE: z.coerce.number().int().positive().default(1000),
  EMBEDDING_CHUNK_OVERLAP: z.coerce.number().int().nonnegative().default(150)
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  throw new Error("Environment validation failed");
}
const env = parsed.data;

function resolveProjectPath(value: string | undefined, fallbackRelativePath: string): string {
  const target = value?.trim() || fallbackRelativePath;
  return path.isAbsolute(target) ? target : path.resolve(projectRoot, target);
}

const dataDir = resolveProjectPath(env.DATA_DIR, ".data");

export const config = {
  projectRoot,
  nodeEnv: env.NODE_ENV,
  logLevel: env.LOG_LEVEL,
  host: env.HOST,
  port: env.PORT,
  maxToolLoops: env.MAX_TOOL_LOOPS,
  toolTimeoutMs: env.TOOL_TIMEOUT_MS,
  workspaceDir: resolveProjectPath(env.WORKSPACE_DIR, "workspace"),
  dataDir,
  historyDir: resolveProjectPath(
    env.DATA_DIR ? path.join(env.DATA_DIR, "history") : ".data/history",
    ".data/history"
  ),
  ragStoreFile: resolveProjectPath(
    env.DATA_DIR ? path.join(env.DATA_DIR, "rag-store.json") : ".data/rag-store.json",
    ".data/rag-store.json"
  ),
  codexResponsesUrl: env.CODEX_RESPONSES_URL,
  codexRefreshUrl: env.CODEX_REFRESH_URL,
  defaultCodexModel: env.DEFAULT_CODEX_MODEL,
  availableModels: env.AVAILABLE_MODELS,
  qdrantHost: env.QDRANT_HOST,
  qdrantCollection: env.QDRANT_COLLECTION,
  authFile: resolveProjectPath(env.AUTH_FILE, "auth.json"),
  authRefreshUrl: env.AUTH_REFRESH_URL || env.CODEX_REFRESH_URL,
  authJson: env.AUTH_JSON,
  chatsDir: resolveProjectPath(env.CHATS_DIR, ".data/chats"),
  uploadsDir: resolveProjectPath(env.UPLOADS_DIR, ".data/uploads"),
  authPoolDir: resolveProjectPath(env.AUTH_POOL_DIR, ".data/auth-pool"),
  storeStateFile: resolveProjectPath(env.STORE_STATE_FILE, ".data/store-state.json"),
  adminPin: env.ADMIN_PIN,
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: env.RATE_LIMIT_MAX,
  embeddingDim: env.EMBEDDING_DIM,
  embeddingChunkSize: env.EMBEDDING_CHUNK_SIZE,
  embeddingChunkOverlap: env.EMBEDDING_CHUNK_OVERLAP
};

for (const directory of [
  config.workspaceDir,
  config.dataDir,
  config.historyDir,
  config.chatsDir,
  config.uploadsDir,
  config.authPoolDir
]) {
  mkdirSync(directory, { recursive: true });
}

export type AuthFile = Record<string, unknown>;

export function loadAuth(): AuthFile | null {
  if (!existsSync(config.authFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(config.authFile, "utf-8")) as AuthFile;
  } catch (err) {
    console.warn("Failed to parse auth file:", err);
    return null;
  }
}
