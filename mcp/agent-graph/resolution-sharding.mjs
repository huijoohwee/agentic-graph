import {
  AgentGraphError,
  stableStringify,
} from "./contract.mjs";

export const MAX_RESOLUTION_SHARD_BYTES = 16 * 1024 * 1024;
export const TARGET_RESOLUTION_SHARD_BYTES = 8 * 1024 * 1024;

function normalizedTarget(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0
    ? Math.min(number, TARGET_RESOLUTION_SHARD_BYTES)
    : TARGET_RESOLUTION_SHARD_BYTES;
}

export function partitionResolutionEdges(edges, options = {}) {
  const checkpoint = typeof options.checkpoint === "function"
    ? options.checkpoint
    : () => {};
  const targetBytes = normalizedTarget(options.targetBytes);
  const chunks = [];
  let chunk = [];
  let chunkBytes = 256;
  for (const edge of edges) {
    checkpoint();
    const edgeBytes = Buffer.byteLength(stableStringify(edge, 2, { checkpoint })) + 512;
    if (edgeBytes > MAX_RESOLUTION_SHARD_BYTES) {
      throw new AgentGraphError(
        "artifact_too_large",
        `One resolution edge exceeds ${MAX_RESOLUTION_SHARD_BYTES} bytes.`,
        {
          edgeId: edge.id,
          actualBytesAtLeast: edgeBytes,
          maxBytes: MAX_RESOLUTION_SHARD_BYTES,
          previousSnapshotPreserved: true,
        },
      );
    }
    if (chunk.length && chunkBytes + edgeBytes > targetBytes) {
      chunks.push(chunk);
      chunk = [];
      chunkBytes = 256;
    }
    chunk.push(edge);
    chunkBytes += edgeBytes;
  }
  if (chunk.length || !chunks.length) chunks.push(chunk);
  return chunks;
}
