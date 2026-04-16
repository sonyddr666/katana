import { mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { config } from "../src/server/config/env";
import { useInMemoryDbForTests } from "../src/server/db";
import { ingestFile, ragStatus, searchRag } from "../src/server/tools/rag";

const tempWorkspace = path.join(tmpdir(), `katana-rag-test-${Date.now()}`);

beforeAll(() => {
  mkdirSync(tempWorkspace, { recursive: true });
  (config as unknown as { workspaceDir: string }).workspaceDir = tempWorkspace;

  writeFileSync(
    path.join(tempWorkspace, "receita.md"),
    "# Bolo de chocolate\nIngredientes: farinha, cacau, ovos, açúcar.\nModo de preparo: misture tudo e asse por 40 minutos."
  );
  writeFileSync(
    path.join(tempWorkspace, "database.md"),
    "# Bancos distribuídos\nTópicos sobre replicação, consenso, Paxos e Raft.\nParticionamento horizontal e sharding."
  );
});

describe("rag/search + ingest (integração)", () => {
  beforeEach(() => {
    useInMemoryDbForTests();
  });

  it("search vazio retorna mensagem amigável quando não há entradas", async () => {
    const result = await searchRag({ query: "qualquer" });
    expect(result.ok).toBe(true);
    expect(result.data.results).toHaveLength(0);
  });

  it("ingestFile indexa chunks e search recupera semanticamente", async () => {
    const ingest = await ingestFile({ filepath: "receita.md", userId: "user1" });
    expect(ingest.ok).toBe(true);
    expect(ingest.data.chunks).toBeGreaterThan(0);

    const result = await searchRag({ query: "como fazer bolo de chocolate" });
    expect(result.ok).toBe(true);
    expect(result.data.results.length).toBeGreaterThan(0);
    expect(result.data.results[0].filepath).toBe("receita.md");
    expect(result.data.results[0].score).toBeGreaterThan(0);
  });

  it("search ranqueia documento relevante acima do irrelevante", async () => {
    await ingestFile({ filepath: "receita.md", userId: "user1" });
    await ingestFile({ filepath: "database.md", userId: "user1" });

    const result = await searchRag({ query: "ingredientes para bolo" });
    expect(result.ok).toBe(true);
    expect(result.data.results[0].filepath).toBe("receita.md");
  });

  it("filtro por userId isola resultados", async () => {
    await ingestFile({ filepath: "receita.md", userId: "user-A" });
    await ingestFile({ filepath: "database.md", userId: "user-B" });

    const a = await searchRag({ query: "bolo chocolate", filters: { userId: "user-A" } });
    expect(a.data.results.every((r: any) => r.userId === "user-A")).toBe(true);

    const b = await searchRag({ query: "Paxos consenso", filters: { userId: "user-B" } });
    expect(b.data.results.every((r: any) => r.userId === "user-B")).toBe(true);
  });

  it("ingest duplicado substitui chunks existentes", async () => {
    await ingestFile({ filepath: "receita.md", userId: "user1" });
    const firstStatus = await ragStatus();
    const firstCount = firstStatus.data.chunks;

    await ingestFile({ filepath: "receita.md", userId: "user1" });
    const secondStatus = await ragStatus();
    expect(secondStatus.data.chunks).toBe(firstCount);
  });

  it("ragStatus reporta documentos e chunks", async () => {
    await ingestFile({ filepath: "receita.md", userId: "user1" });
    const status = await ragStatus();
    expect(status.ok).toBe(true);
    expect(status.data.documents).toBe(1);
    expect(status.data.chunks).toBeGreaterThan(0);
    expect(status.data.backend).toBe("sqlite-local");
  });

  it("rejeita path traversal", async () => {
    const result = await ingestFile({ filepath: "../../etc/passwd", userId: "user1" });
    expect(result.ok).toBe(false);
    expect(result.data.error).toContain("traversal");
  });
});
