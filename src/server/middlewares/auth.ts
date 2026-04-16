import { Request, Response, NextFunction } from "express";
import { config, loadAuth } from "../config/env";

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Skip auth for public endpoints
  const publicPaths = ["/", "/health", "/stream", "/v1/models", "/v1/chat/completions"];
  if (publicPaths.some((path) => req.path.startsWith(path))) {
    return next();
  }

  // For /rpc and /tools endpoints, check for bearer token or local auth
  const authHeader = req.headers.authorization;

  if (authHeader) {
    // Bearer token auth (OpenAI-compatible)
    const token = authHeader.replace("Bearer ", "");
    // In production, validate token properly
    if (token.length > 0) {
      return next();
    }
  }

  // Local auth from auth.json (Codex app-server style)
  const auth = loadAuth();
  if (auth && auth.access) {
    // Token is valid if not expired or will expire in more than 5 minutes
    const expiresAt = new Date(auth.expires);
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (expiresAt > fiveMinutesFromNow) {
      return next();
    }

    // Token expired, try to refresh (stub - would call refresh endpoint)
    console.warn("Auth token expired or expiring soon");
  }

  // For development, allow without auth but warn
  if (config.port === 8080) {
    console.warn("No valid auth found - allowing request (development mode)");
    return next();
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
