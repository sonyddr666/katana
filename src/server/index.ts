import express from "express";
import http from "http";
import path from "path";

import cors from "cors";
import bodyParser from "body-parser";

import { config } from "./config/env";
import { setupHubApiRoutes } from "./hub-api";
import { rpcHandler } from "./rpc";
import { sseRouter } from "./sse";
import { authMiddleware } from "./middlewares/auth";
import { loggerMiddleware } from "./middlewares/logger";
import { setupToolLoopRoutes } from "./tools-loop/routes";

const app = express();
const server = http.createServer(app);
const webRoot = path.resolve(__dirname, "..", "..", "src", "web");

// Trust proxy for correct IP detection behind reverse proxy
app.set("trust proxy", 1);

// Middlewares
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(loggerMiddleware);
app.use(authMiddleware);

// Static files (Chat UI)
app.use(express.static(webRoot));

// JSON-RPC 2.0 endpoint
app.post("/rpc", async (req, res) => {
  try {
    const result = await rpcHandler(req.body);
    res.json(result);
  } catch (error) {
    console.error("RPC handler error:", error);
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body.id,
      error: {
        code: -32603,
        message: "Internal error",
        data: String(error),
      },
    });
  }
});

// REST hub API
app.use("/v1", setupHubApiRoutes());

// Tool Loop routes (debug/test direct tool execution)
app.use("/tools", setupToolLoopRoutes());

// SSE streaming endpoint
app.use("/stream", sseRouter);

app.get("/", (_req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
const PORT = config.port || 8080;
const HOST = config.host || "0.0.0.0";

server.listen(PORT, HOST, () => {
  console.log(`🚀 CODEX-JSON-RPC server listening on http://${HOST}:${PORT}`);
  console.log(`📡 Chat UI: http://localhost:${PORT}/`);
  console.log(`🔧 JSON-RPC: POST http://localhost:${PORT}/rpc`);
  console.log(`🔌 OpenAI-compat: POST http://localhost:${PORT}/v1/chat/completions`);
});

export { app, server };
