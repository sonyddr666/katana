import { promises as fs } from "fs";
import path from "path";

import { and, eq } from "drizzle-orm";

import { config } from "../../config/env";
import { getDb } from "../../db";
import { ragEntries } from "../../db/schema";
import { chunkText } from "./chunker";
import { cosineSimilarity, deserialize, embed, embeddingModelName, serialize } from "./embedding";

interface RagHit {
  id: string;
  filepath: string;
  chunkIndex: number;
  userId: string;
  excerpt: string;
  ingestedAt: string;
  score: number;
}

function createExcerpt(text: string, maxLength = 240): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength)}\u2026`;
}

function resolveWorkspaceFile(filepath: string): string {
  const workspaceRoot = path.resolve(config.workspaceDir);
  const fullPath = path.resolve(workspaceRoot, filepath);
  const relative = path.relative(workspaceRoot, fullPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path traversal attempt detected");
  }
  return fullPath;
}

export async function searchRag(args: {
  query: string;
  top_k?: number;
  filters?: { userId?: string; filepath?: string };
}): Promise<any> {
  const { query, top_k = 5, filters = {} } = args;

  if (typeof query !== "string" || !query.trim()) {
    return {
      ok: false,
      scope: "rag",
      data: { error: "Missing 'query' argument" }
    };
  }

  try {
    const db = getDb();
    const conditions = [] as any[];
    if (filters.userId) conditions.push(eq(ragEntries.userId, filters.userId));
    if (filters.filepath) conditions.push(eq(ragEntries.filepath, filters.filepath));

    const rows = conditions.length
      ? await db.select().from(ragEntries).where(and(...conditions))
      : await db.select().from(ragEntries);

    if (rows.length === 0) {
      return {
        ok: true,
        scope: "rag",
        data: { query, top_k, filters, results: [] },
        suggested_next: "Index a workspace file with ingest_file before searching again."
      };
    }

    const queryEmbedding = embed(query);
    const hits: RagHit[] = rows
      .filter((r) => r.embeddingDim === queryEmbedding.dim)
      .map((r) => ({
        id: r.id,
        filepath: r.filepath,
        chunkIndex: r.chunkIndex,
        userId: r.userId,
        excerpt: r.excerpt,
        ingestedAt: r.ingestedAt,
        score: cosineSimilarity(queryEmbedding.vector, deserialize(r.embedding))
      }))
      .filter((hit) => hit.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, Math.min(top_k, 50)));

    return {
      ok: true,
      scope: "rag",
      data: { query, top_k, filters, results: hits, model: embeddingModelName },
      suggested_next: hits.length
        ? "Use read_file to inspect the original document or ingest_file to refresh stale content."
        : "No semantic match found. Try rephrasing the query or ingest more documents."
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "rag",
      data: { error: error.message, query }
    };
  }
}

export async function ingestFile(args: { filepath: string; userId: string }): Promise<any> {
  const { filepath, userId } = args;

  if (!filepath || !userId) {
    return {
      ok: false,
      scope: "rag",
      data: { error: "Missing 'filepath' or 'userId'" }
    };
  }

  try {
    const fullPath = resolveWorkspaceFile(filepath);
    const content = await fs.readFile(fullPath, "utf-8");
    const chunks = chunkText(content);
    const ingestedAt = new Date().toISOString();
    const bytes = Buffer.byteLength(content, "utf-8");
    const db = getDb();

    await db
      .delete(ragEntries)
      .where(and(eq(ragEntries.userId, userId), eq(ragEntries.filepath, filepath)));

    let totalTokens = 0;
    for (const chunk of chunks) {
      const embedding = embed(chunk.content);
      totalTokens += embedding.tokens;
      await db.insert(ragEntries).values({
        id: `${userId}:${filepath}#${chunk.index}`,
        userId,
        filepath,
        chunkIndex: chunk.index,
        content: chunk.content,
        excerpt: createExcerpt(chunk.content),
        embedding: serialize(embedding.vector),
        embeddingModel: embedding.model,
        embeddingDim: embedding.dim,
        bytes: Buffer.byteLength(chunk.content, "utf-8"),
        ingestedAt
      });
    }

    return {
      ok: true,
      scope: "rag",
      data: {
        filepath,
        userId,
        bytes,
        chunks: chunks.length,
        tokens: totalTokens,
        model: embeddingModelName,
        dim: config.embeddingDim
      },
      suggested_next: "Use search_rag with a natural-language query to retrieve this document."
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "rag",
      data: { error: error.message, filepath, userId }
    };
  }
}

export async function ragStatus(_args: Record<string, unknown> = {}): Promise<any> {
  try {
    const db = getDb();
    const rows = await db.select({ userId: ragEntries.userId, filepath: ragEntries.filepath }).from(ragEntries);
    const files = new Set<string>();
    for (const r of rows) files.add(`${r.userId}:${r.filepath}`);

    return {
      ok: true,
      scope: "rag",
      data: {
        collection: config.qdrantCollection,
        status: "ready",
        chunks: rows.length,
        documents: files.size,
        model: embeddingModelName,
        dim: config.embeddingDim,
        backend: "sqlite-local"
      },
      suggested_next: "Use ingest_file to add workspace documents to the index."
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "rag",
      data: { error: error.message }
    };
  }
}
