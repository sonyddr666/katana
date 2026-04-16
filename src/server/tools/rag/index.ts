import { promises as fs } from "fs";
import path from "path";

import { config } from "../../config/env";

interface RagEntry {
  id: string;
  userId: string;
  filepath: string;
  content: string;
  excerpt: string;
  tokens: string[];
  ingestedAt: string;
}

interface RagStore {
  collection: string;
  status: string;
  entries: RagEntry[];
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((token) => token.length > 1);
}

function createExcerpt(text: string, maxLength = 240): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
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

async function loadStore(): Promise<RagStore> {
  try {
    const raw = await fs.readFile(config.ragStoreFile, "utf-8");
    return JSON.parse(raw) as RagStore;
  } catch (error: any) {
    if (error?.code === "ENOENT") {
      return {
        collection: config.qdrantCollection,
        status: "ready",
        entries: [],
      };
    }

    throw error;
  }
}

async function saveStore(store: RagStore): Promise<void> {
  await fs.mkdir(path.dirname(config.ragStoreFile), { recursive: true });
  await fs.writeFile(config.ragStoreFile, `${JSON.stringify(store, null, 2)}\n`, "utf-8");
}

export async function searchRag(args: {
  query: string;
  top_k?: number;
  filters?: Record<string, unknown>;
}): Promise<any> {
  const { query, top_k = 5, filters = {} } = args;

  try {
    const store = await loadStore();
    const queryTokens = tokenize(query);
    const hits = store.entries
      .filter((entry) => {
        return Object.entries(filters).every(([key, value]) => {
          if (value === undefined || value === null || value === "") {
            return true;
          }
          return (entry as any)[key] === value;
        });
      })
      .map((entry) => {
        const score = queryTokens.reduce((total, token) => total + (entry.tokens.includes(token) ? 1 : 0), 0);
        return {
          filepath: entry.filepath,
          userId: entry.userId,
          excerpt: entry.excerpt,
          ingestedAt: entry.ingestedAt,
          score,
        };
      })
      .filter((entry) => entry.score > 0 || queryTokens.length === 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, top_k);

    return {
      ok: true,
      scope: "rag",
      data: {
        query,
        top_k,
        filters,
        results: hits,
      },
      suggested_next: hits.length
        ? "Use read_file to inspect the original document or ingest_file to refresh stale content."
        : "Index a workspace file with ingest_file before searching again.",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "rag",
      data: { error: error.message, query },
    };
  }
}

export async function ingestFile(args: {
  filepath: string;
  userId: string;
}): Promise<any> {
  const { filepath, userId } = args;

  try {
    const fullPath = resolveWorkspaceFile(filepath);
    const content = await fs.readFile(fullPath, "utf-8");
    const store = await loadStore();
    const entry: RagEntry = {
      id: `${userId}:${filepath}`,
      userId,
      filepath,
      content,
      excerpt: createExcerpt(content),
      tokens: tokenize(content),
      ingestedAt: new Date().toISOString(),
    };

    const index = store.entries.findIndex((item) => item.id === entry.id);
    if (index >= 0) {
      store.entries.splice(index, 1, entry);
    } else {
      store.entries.push(entry);
    }

    await saveStore(store);

    return {
      ok: true,
      scope: "rag",
      data: {
        filepath,
        userId,
        bytes: Buffer.byteLength(content, "utf-8"),
        tokens: entry.tokens.length,
        collection: store.collection,
      },
      suggested_next: "Use search_rag with a natural-language query to retrieve this document.",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "rag",
      data: { error: error.message, filepath, userId },
    };
  }
}

export async function ragStatus(_args: {}): Promise<any> {
  try {
    const store = await loadStore();
    return {
      ok: true,
      scope: "rag",
      data: {
        collection: store.collection,
        status: store.status,
        points: store.entries.length,
        backend: config.qdrantHost ? "qdrant-configured-local-stub-active" : "local-stub",
      },
      suggested_next: "Use ingest_file to add workspace documents to the local stub index.",
    };
  } catch (error: any) {
    return {
      ok: false,
      scope: "rag",
      data: { error: error.message },
    };
  }
}
