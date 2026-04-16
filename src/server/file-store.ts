import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

import type { Request } from "express";

import { config } from "./config/env";

export interface StoredUpload {
  id: string;
  name: string;
  mime: string;
  type: string;
  is_image: boolean;
  size: number;
  expires_at: number | null;
  url: string;
  stored_name: string;
}

function metaFile(id: string): string {
  return path.join(config.uploadsDir, `${id}.json`);
}

function dataFile(storedName: string): string {
  return path.join(config.uploadsDir, storedName);
}

function sanitizeFileName(name: string): string {
  return String(name || "upload.bin").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function detectMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".json") || lower.endsWith(".csv")) return "text/plain";
  return "application/octet-stream";
}

export async function saveUploadedFile(input: { filename: string; mime?: string; buffer: Buffer }): Promise<StoredUpload> {
  const id = randomUUID();
  const safeName = sanitizeFileName(input.filename || "upload.bin");
  const storedName = `${id}__${safeName}`;
  const mime = input.mime || detectMimeFromName(safeName);
  const meta: StoredUpload = {
    id,
    name: safeName,
    mime,
    type: mime,
    is_image: mime.startsWith("image/"),
    size: input.buffer.length,
    expires_at: null,
    url: `/v1/files/${id}`,
    stored_name: storedName
  };

  await fs.writeFile(dataFile(storedName), input.buffer);
  await fs.writeFile(metaFile(id), `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
  return meta;
}

export async function getUploadedFile(id: string): Promise<{ meta: StoredUpload; buffer: Buffer } | null> {
  try {
    const rawMeta = await fs.readFile(metaFile(id), "utf-8");
    const meta = JSON.parse(rawMeta) as StoredUpload;
    const buffer = await fs.readFile(dataFile(meta.stored_name));
    return { meta, buffer };
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function readRequestBuffer(req: Request): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export async function parseMultipartUpload(req: Request): Promise<{ filename: string; mime: string; buffer: Buffer }> {
  const contentType = String(req.headers["content-type"] || "");
  const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    throw new Error("Multipart boundary missing");
  }

  const boundary = `--${boundaryMatch[1] || boundaryMatch[2]}`;
  const rawBuffer = await readRequestBuffer(req);
  const raw = rawBuffer.toString("latin1");
  const parts = raw.split(boundary).filter((part) => part.includes("Content-Disposition"));

  for (const part of parts) {
    const filenameMatch = part.match(/filename="([^"]+)"/i);
    if (!filenameMatch) {
      continue;
    }
    const mimeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      continue;
    }
    let content = part.slice(headerEnd + 4);
    content = content.replace(/\r\n$/, "");
    return {
      filename: filenameMatch[1],
      mime: mimeMatch?.[1]?.trim() || detectMimeFromName(filenameMatch[1]),
      buffer: Buffer.from(content, "latin1")
    };
  }

  throw new Error("No file part found in multipart payload");
}
