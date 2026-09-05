import {
  AgentGraphError,
  stableStringify,
} from "./contract.mjs";
import { boundedArtifactBytes } from "./store-records.mjs";

export const AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA = "agentic-graph-agent-graph-source-bundle/v1";
export const AGENT_GRAPH_SOURCE_PART_SCHEMA = "agentic-graph-agent-graph-source-part/v1";
export const LEGACY_AGENT_GRAPH_SOURCE_BUNDLE_SCHEMA = "agentic-graph-knowledge-graph-source-bundle/v1";
export const LEGACY_AGENT_GRAPH_SOURCE_PART_SCHEMA = "agentic-graph-knowledge-graph-source-part/v1";

export const MAX_SOURCE_PART_BYTES = 16 * 1024 * 1024;
export const TARGET_SOURCE_PART_BYTES = 8 * 1024 * 1024;
export const MAX_SOURCE_BUNDLE_BYTES = 4 * 1024 * 1024;
export const MAX_SOURCE_PARTS = 64;
export const MAX_SOURCE_ARTIFACT_BYTES = 256 * 1024 * 1024;
export const MAX_SOURCE_ARTIFACT_RECORDS = 350_000;
export const MAX_SNAPSHOT_ARTIFACT_BYTES = 8 * 1024 * 1024 * 1024;
export const MAX_SNAPSHOT_ARTIFACT_RECORDS = 10_000_000;
export const MAX_SNAPSHOT_SOURCE_PARTS = 500_000;

const boundedCount = (value, maximum) => {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? Math.min(number, maximum) : maximum;
};

export const sourcePartByteLimit = (value) => boundedArtifactBytes(value, MAX_SOURCE_PART_BYTES);
export const sourcePartTargetBytes = (value, hardLimit) => (
  boundedArtifactBytes(value, Math.min(TARGET_SOURCE_PART_BYTES, hardLimit))
);
export const sourceArtifactByteLimit = (value) => boundedArtifactBytes(
  value,
  MAX_SOURCE_ARTIFACT_BYTES,
);
export const sourceArtifactRecordLimit = (value) => boundedCount(
  value,
  MAX_SOURCE_ARTIFACT_RECORDS,
);
export const sourcePartCountLimit = (value) => boundedCount(value, MAX_SOURCE_PARTS);
export const snapshotArtifactByteLimit = (value) => boundedArtifactBytes(
  value,
  MAX_SNAPSHOT_ARTIFACT_BYTES,
);
export const snapshotArtifactRecordLimit = (value) => boundedCount(
  value,
  MAX_SNAPSHOT_ARTIFACT_RECORDS,
);
export const snapshotSourcePartCountLimit = (value) => boundedCount(
  value,
  MAX_SNAPSHOT_SOURCE_PARTS,
);

function sourceLimitError(code, message, options, details = {}) {
  return new AgentGraphError(code, message, {
    sourcePath: options.sourcePath,
    repositoryId: options.repositoryId,
    kind: options.kind,
    previousSnapshotPreserved: true,
    ...details,
  });
}

function assertPartCount(chunks, options) {
  if (chunks.length > options.maxParts) {
    throw sourceLimitError(
      "source_part_limit_exceeded",
      `Source graph requires more than ${options.maxParts} bounded parts.`,
      options,
      {
        actualPartsAtLeast: chunks.length,
        maxParts: options.maxParts,
      },
    );
  }
}

export function partitionSourceRecords(records, options) {
  if (!records.length) return [];
  const checkpoint = options.checkpoint || (() => {});
  const envelopeBytes = Buffer.byteLength(stableStringify(options.makePart([], 0, 1), 2, {
    checkpoint,
  }));
  const targetPayloadBytes = Math.max(1, options.targetBytes - envelopeBytes);
  const chunks = [];
  let chunk = [];
  let chunkBytes = 0;
  for (const record of records) {
    checkpoint();
    const recordBytes = Buffer.byteLength(stableStringify(record, 2, { checkpoint })) + 8;
    if (chunk.length && chunkBytes + recordBytes > targetPayloadBytes) {
      chunks.push(chunk);
      chunk = [];
      chunkBytes = 0;
    }
    chunk.push(record);
    chunkBytes += recordBytes;
  }
  if (chunk.length) chunks.push(chunk);
  assertPartCount(chunks, options);

  let changed = true;
  while (changed) {
    changed = false;
    const totalParts = chunks.length;
    for (let index = 0; index < chunks.length; index += 1) {
      checkpoint();
      const serialized = stableStringify(
        options.makePart(chunks[index], index, totalParts),
        2,
        { checkpoint },
      );
      const actualBytes = Buffer.byteLength(serialized);
      if (actualBytes <= options.maxBytes) continue;
      if (chunks[index].length < 2) {
        const record = chunks[index][0];
        throw sourceLimitError(
          "source_record_too_large",
          `One source ${options.kind} record exceeds ${options.maxBytes} bytes.`,
          options,
          {
            ordinal: index,
            recordId: String(record?.id || ""),
            actualBytes,
            maxBytes: options.maxBytes,
          },
        );
      }
      const midpoint = Math.floor(chunks[index].length / 2);
      chunks.splice(
        index,
        1,
        chunks[index].slice(0, midpoint),
        chunks[index].slice(midpoint),
      );
      assertPartCount(chunks, options);
      changed = true;
      break;
    }
  }
  return chunks.map((recordsForPart, ordinal) => (
    options.makePart(recordsForPart, ordinal, chunks.length)
  ));
}
