import type { NextFunction, Request, Response } from "express";

import { loadAuth, refreshAuth, extractAccessToken, extractExpiresSeconds, hasUsableAuth } from "../codex/auth-manager";
import { logger } from "../logger";

function isPublicRequest(req: Request): boolean {
  if (req.path === "/health") {
    return true;
  }

  if (req.path.startsWith("/stream") || req.path.startsWith("/v1/")) {
    return true;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    return !req.path.startsWith("/rpc") && !req.path.startsWith("/tools");
  }

  return false;
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (isPublicRequest(req)) {
    next();
    return;
  }

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ") && authHeader.replace("Bearer ", "").trim()) {
    next();
    return;
  }

  let auth = loadAuth();
  if (hasUsableAuth(auth)) {
    const expiresAt = extractExpiresSeconds(auth);
    if (expiresAt && Date.now() / 1000 > expiresAt - 60) {
      try {
        auth = await refreshAuth(auth!);
      } catch (error) {
        logger.warn({ err: error }, "Failed to refresh auth token");
      }
    }

    const validUntil = extractExpiresSeconds(auth);
    if (!validUntil || validUntil > Date.now() / 1000 || Boolean(extractAccessToken(auth))) {
      next();
      return;
    }
  }

  if (process.env.NODE_ENV !== "production") {
    logger.warn({ path: req.path }, "Allowing unauthenticated request in non-production mode");
    next();
    return;
  }

  res.status(401).json({
    jsonrpc: "2.0",
    id: null,
    error: {
      code: -32001,
      message: "Authentication required",
    },
  });
}
