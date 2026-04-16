import dotenv from "dotenv";
import { readFileSync, existsSync } from "fs";

dotenv.config();

export const config = {
  port: Number(process.env.PORT) || 8080,
  host: process.env.HOST || "0.0.0.0",
  maxToolLoops: Number(process.env.MAX_TOOL_LOOPS) || 8,
  toolTimeoutMs: Number(process.env.TOOL_TIMEOUT_MS) || 15000,
  workspaceDir: process.env.WORKSPACE_DIR || "/workspace",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  qdrantHost: process.env.QDRANT_HOST || "http://localhost:6333",
  qdrantCollection: process.env.QDRANT_COLLECTION || "codex-rag",
  authFile: process.env.AUTH_FILE || "/app/auth.json",
};

// Check if auth file exists and load if present
export function loadAuth() {
  if (existsSync(config.authFile)) {
    try {
      return JSON.parse(readFileSync(config.authFile, "utf-8"));
    } catch (err) {
      console.warn("Failed to parse auth file:", err);
      return null;
    }
  }
  return null;
}
