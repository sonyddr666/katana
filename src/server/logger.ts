import pino, { type LoggerOptions } from "pino";

const isProd = process.env.NODE_ENV === "production";
const level = process.env.LOG_LEVEL || (isProd ? "info" : "debug");

const redactPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers[\"x-admin-pin\"]",
  "headers.authorization",
  "headers.cookie",
  "access_token",
  "refresh_token",
  "tokens.access_token",
  "tokens.refresh_token",
  "auth.access_token",
  "auth.refresh_token",
  "*.access_token",
  "*.refresh_token"
];

const options: LoggerOptions = {
  level,
  base: { service: "codex-json-rpc" },
  redact: { paths: redactPaths, censor: "[REDACTED]" },
  timestamp: pino.stdTimeFunctions.isoTime
};

if (!isProd) {
  options.transport = {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname,service" }
  };
}

export const logger = pino(options);

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
