import express from "express";
import http from "http";
import path from "path";

import cors from "cors";
import bodyParser from "body-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import { config } from "./config/env";
import { setupHubApiRoutes } from "./hub-api";
import { rpcHandler } from "./rpc";
import { sseRouter } from "./sse";
import { authMiddleware } from "./middlewares/auth";
import { loggerMiddleware } from "./middlewares/logger";
import { setupToolLoopRoutes } from "./tools-loop/routes";
import { logger } from "./logger";
import { snapshot as metricsSnapshot } from "./metrics";

const app = express();
const server = http.createServer(app);
const webRoot = path.resolve(__dirname, "..", "..", "src", "web");

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true, limit: "10mb" }));
app.use(loggerMiddleware);
app.use(authMiddleware);

const apiLimiter = rateLimit({
  windowMs: config.rateLimitWindowMs,
  max: config.rateLimitMax,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: (req) => req.path === "/health" || req.path === "/metrics" || req.path.startsWith("/stream")
});
app.use(apiLimiter);

app.use(express.static(webRoot));

app.post("/rpc", async (req, res) => {
  try {
    const result = await rpcHandler(req.body);
    res.json(result);
  } catch (error) {
    logger.error({ err: error, rpcId: req.body?.id }, "RPC handler error");
    res.status(500).json({
      jsonrpc: "2.0",
      id: req.body?.id,
      error: {
        code: -32603,
        message: "Internal error",
        data: String(error),
      },
    });
  }
});

app.use("/v1", setupHubApiRoutes());
app.use("/tools", setupToolLoopRoutes());
app.use("/stream", sseRouter);

app.get("/", (_req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.get("/metrics", (_req, res) => {
  res.json(metricsSnapshot());
});

const PORT = config.port || 8080;
const HOST = config.host || "0.0.0.0";

server.listen(PORT, HOST, () => {
  logger.info(
    {
      host: HOST,
      port: PORT,
      urls: {
        ui: `http://localhost:${PORT}/`,
        rpc: `http://localhost:${PORT}/rpc`,
        openaiCompat: `http://localhost:${PORT}/v1/chat/completions`
      }
    },
    "CODEX-JSON-RPC server listening"
  );
});

export { app, server };
