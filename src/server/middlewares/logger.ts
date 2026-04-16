import pinoHttp from "pino-http";
import { randomUUID } from "crypto";

import { logger } from "../logger";

export const loggerMiddleware = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = (req.headers["x-request-id"] as string | undefined)?.trim();
    const id = incoming || randomUUID();
    res.setHeader("x-request-id", id);
    return id;
  },
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, url: req.url, remoteAddress: req.remoteAddress }),
    res: (res) => ({ statusCode: res.statusCode })
  }
});
