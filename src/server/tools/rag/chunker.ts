import { config } from "../../config/env";

export interface Chunk {
  index: number;
  content: string;
}

export function chunkText(text: string, size?: number, overlap?: number): Chunk[] {
  const chunkSize = size ?? config.embeddingChunkSize;
  const chunkOverlap = Math.min(overlap ?? config.embeddingChunkOverlap, Math.max(0, chunkSize - 1));
  const normalized = text.replace(/\r\n/g, "\n").trim();

  if (!normalized) return [];
  if (normalized.length <= chunkSize) {
    return [{ index: 0, content: normalized }];
  }

  const chunks: Chunk[] = [];
  const step = Math.max(1, chunkSize - chunkOverlap);
  let start = 0;
  let idx = 0;

  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const windowEnd = Math.min(normalized.length, end);
      const windowStart = Math.max(start + Math.floor(chunkSize / 2), end - 200);
      const slice = normalized.slice(windowStart, windowEnd);
      const breakOffsets = [
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
        slice.lastIndexOf(". "),
        slice.lastIndexOf("; ")
      ];
      const bestInSlice = Math.max(...breakOffsets);
      if (bestInSlice > 0) {
        end = windowStart + bestInSlice + 1;
      }
    }

    const piece = normalized.slice(start, end).trim();
    if (piece) chunks.push({ index: idx++, content: piece });

    if (end >= normalized.length) break;
    start = end - chunkOverlap;
    if (start < 0) start = 0;
  }

  return chunks;
}
