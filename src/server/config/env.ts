import dotenv from "dotenv";
import { existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";

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

function readNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function readList(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) {
    return fallback;
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resolveProjectPath(value: string | undefined, fallbackRelativePath: string): string {
  const target = value?.trim() || fallbackRelativePath;
  return path.isAbsolute(target) ? target : path.resolve(projectRoot, target);
}

export const config = {
  projectRoot,
  host: process.env.HOST || "0.0.0.0",
  port: readNumber("PORT", 8080),
  maxToolLoops: readNumber("MAX_TOOL_LOOPS", 8),
  toolTimeoutMs: readNumber("TOOL_TIMEOUT_MS", 15000),
  workspaceDir: resolveProjectPath(process.env.WORKSPACE_DIR, "workspace"),
  dataDir: resolveProjectPath(process.env.DATA_DIR, ".data"),
  historyDir: resolveProjectPath(process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "history") : ".data/history", ".data/history"),
  ragStoreFile: resolveProjectPath(process.env.DATA_DIR ? path.join(process.env.DATA_DIR, "rag-store.json") : ".data/rag-store.json", ".data/rag-store.json"),
  codexResponsesUrl: process.env.CODEX_RESPONSES_URL || "https://chatgpt.com/backend-api/codex/responses",
  codexRefreshUrl: process.env.CODEX_REFRESH_URL || "https://chatgpt.com/api/auth/session",
  defaultCodexModel: process.env.DEFAULT_CODEX_MODEL || "gpt-5.4-mini",
  availableModels: readList("AVAILABLE_MODELS", DEFAULT_CODEX_MODELS),
  qdrantHost: process.env.QDRANT_HOST || "",
  qdrantCollection: process.env.QDRANT_COLLECTION || "codex-rag",
  authFile: resolveProjectPath(process.env.AUTH_FILE, "auth.json"),
  authRefreshUrl: process.env.AUTH_REFRESH_URL || process.env.CODEX_REFRESH_URL || "https://chatgpt.com/api/auth/session",
  authJson: process.env.AUTH_JSON || "",
  chatsDir: resolveProjectPath(process.env.CHATS_DIR, ".data/chats"),
  uploadsDir: resolveProjectPath(process.env.UPLOADS_DIR, ".data/uploads"),
  authPoolDir: resolveProjectPath(process.env.AUTH_POOL_DIR, ".data/auth-pool"),
  storeStateFile: resolveProjectPath(process.env.STORE_STATE_FILE, ".data/store-state.json"),
  adminPin: process.env.ADMIN_PIN || ""
};

for (const directory of [config.workspaceDir, config.dataDir, config.historyDir, config.chatsDir, config.uploadsDir, config.authPoolDir]) {
  mkdirSync(directory, { recursive: true });
}

export function loadAuth(): Record<string, any> | null {
  if (!existsSync(config.authFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(config.authFile, "utf-8"));
  } catch (err) {
    console.warn("Failed to parse auth file:", err);
    return null;
  }
}
