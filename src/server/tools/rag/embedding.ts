import { createHash } from "crypto";

import { config } from "../../config/env";

const STOPWORDS = new Set([
  "a","o","as","os","e","ou","de","do","da","dos","das","em","no","na","nos","nas",
  "para","por","com","sem","um","uma","uns","umas","que","se","ao","\u00e0","\u00e0s",
  "the","a","an","and","or","of","to","in","on","for","with","without","is","are","be","by","as","at","it","this","that"
]);

export interface EmbeddingResult {
  vector: number[];
  dim: number;
  model: string;
  tokens: number;
}

const MODEL_NAME = "local-hashed-tfidf-v1";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}_-]+/u)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function ngrams(tokens: string[], n: number): string[] {
  if (tokens.length < n) return [];
  const out: string[] = [];
  for (let i = 0; i <= tokens.length - n; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

function hashFeature(feature: string, dim: number): { index: number; sign: 1 | -1 } {
  const digest = createHash("sha256").update(feature).digest();
  const indexU32 = digest.readUInt32LE(0);
  const signBit = digest.readUInt32LE(4);
  return {
    index: indexU32 % dim,
    sign: signBit & 1 ? 1 : -1
  };
}

export function embed(text: string): EmbeddingResult {
  const dim = config.embeddingDim;
  const vector = new Array<number>(dim).fill(0);
  const tokens = tokenize(text);

  if (tokens.length === 0) {
    return { vector, dim, model: MODEL_NAME, tokens: 0 };
  }

  const features = [...tokens, ...ngrams(tokens, 2), ...ngrams(tokens, 3)];
  const counts = new Map<string, number>();
  for (const feature of features) {
    counts.set(feature, (counts.get(feature) || 0) + 1);
  }

  for (const [feature, count] of counts.entries()) {
    const { index, sign } = hashFeature(feature, dim);
    const weight = Math.log(1 + count);
    vector[index] += sign * weight;
  }

  let norm = 0;
  for (let i = 0; i < dim; i++) norm += vector[i] * vector[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) vector[i] /= norm;
  }

  return { vector, dim, model: MODEL_NAME, tokens: tokens.length };
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

export function serialize(vector: number[]): string {
  const buf = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) buf.writeFloatLE(vector[i], i * 4);
  return buf.toString("base64");
}

export function deserialize(encoded: string): number[] {
  const buf = Buffer.from(encoded, "base64");
  const out = new Array<number>(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

export const embeddingModelName = MODEL_NAME;
