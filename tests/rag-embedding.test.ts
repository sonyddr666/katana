import { describe, expect, it } from "vitest";

import { cosineSimilarity, deserialize, embed, serialize } from "../src/server/tools/rag/embedding";
import { chunkText } from "../src/server/tools/rag/chunker";

describe("rag/embedding", () => {
  it("gera vetor com dimensão configurada", () => {
    const result = embed("texto de exemplo para embedding");
    expect(result.vector.length).toBe(result.dim);
    expect(result.tokens).toBeGreaterThan(0);
  });

  it("vetor é L2-normalizado (norma ~1)", () => {
    const { vector } = embed("maçã banana laranja");
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 4);
  });

  it("textos similares têm cosine alta", () => {
    const a = embed("receita de bolo de chocolate com cobertura");
    const b = embed("receita para bolo de chocolate e cobertura");
    const similarity = cosineSimilarity(a.vector, b.vector);
    expect(similarity).toBeGreaterThan(0.3);
  });

  it("textos distintos têm cosine mais baixa que textos similares", () => {
    const query = embed("receita de bolo de chocolate");
    const close = embed("bolo de chocolate fácil");
    const far = embed("problemas de banco de dados distribuídos");
    expect(cosineSimilarity(query.vector, close.vector)).toBeGreaterThan(cosineSimilarity(query.vector, far.vector));
  });

  it("serialize/deserialize preserva vetor", () => {
    const { vector } = embed("algum texto aleatório de teste");
    const roundtrip = deserialize(serialize(vector));
    expect(roundtrip.length).toBe(vector.length);
    for (let i = 0; i < vector.length; i++) {
      expect(roundtrip[i]).toBeCloseTo(vector[i], 4);
    }
  });

  it("texto vazio retorna vetor zero", () => {
    const { vector, tokens } = embed("   ");
    expect(tokens).toBe(0);
    expect(vector.every((v) => v === 0)).toBe(true);
  });
});

describe("rag/chunker", () => {
  it("texto curto vira 1 chunk", () => {
    const chunks = chunkText("frase curta");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe("frase curta");
  });

  it("texto longo gera múltiplos chunks com overlap", () => {
    const long = "parágrafo. ".repeat(500);
    const chunks = chunkText(long, 400, 80);
    expect(chunks.length).toBeGreaterThan(2);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeGreaterThan(0);
      expect(chunk.content.length).toBeLessThanOrEqual(420);
    }
  });

  it("respeita tamanho custom", () => {
    const text = "x".repeat(3000);
    const chunks = chunkText(text, 500, 50);
    expect(chunks.length).toBeGreaterThan(4);
  });
});
